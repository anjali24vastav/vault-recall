import { App, PluginSettingTab, Setting, TFolder, Notice } from 'obsidian';
import type VaultRecallPlugin from './main';
import { FREE_LIMITS } from './license';

export interface VaultRecallSettings {
    /** Number of notes in daily digest */
    digestCount: number;
    /** Minimum days since modification to resurface */
    minDaysOld: number;
    /** Folders to exclude from indexing */
    excludedFolders: string[];
    /** Show daily digest on startup */
    showDigestOnStartup: boolean;
    /** License key for Pro features */
    licenseKey: string;
    /** Cached license validation status */
    licenseStatus: {
        valid: boolean;
        tier: 'free' | 'pro';
        lastChecked: number;
    } | null;
}

export const DEFAULT_SETTINGS: VaultRecallSettings = {
    digestCount: 5,
    minDaysOld: 7,
    excludedFolders: [],
    showDigestOnStartup: true,
    licenseKey: '',
    licenseStatus: null,
};

export class VaultRecallSettingTab extends PluginSettingTab {
    plugin: VaultRecallPlugin;

    constructor(app: App, plugin: VaultRecallPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Vault Recall Settings' });

        // ── License / Pro status ────────────────────────
        this.renderLicenseSection(containerEl);

        // ── Digest count ────────────────────────────────
        const isPro = this.plugin.isPro();
        const maxDigest = isPro ? 15 : FREE_LIMITS.maxDigestCount;

        new Setting(containerEl)
            .setName('Daily digest count')
            .setDesc(isPro
                ? 'Number of forgotten notes to resurface each day'
                : `Number of forgotten notes to resurface each day (Free: max ${FREE_LIMITS.maxDigestCount})`)
            .addSlider(slider => slider
                .setLimits(1, maxDigest, 1)
                .setValue(Math.min(this.plugin.settings.digestCount, maxDigest))
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.digestCount = value;
                    await this.plugin.saveSettingsOnly();
                }));

        // ── Min note age ────────────────────────────────
        new Setting(containerEl)
            .setName('Minimum note age (days)')
            .setDesc('Only resurface notes that haven\'t been modified for at least this many days')
            .addSlider(slider => slider
                .setLimits(1, 90, 1)
                .setValue(this.plugin.settings.minDaysOld)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.minDaysOld = value;
                    await this.plugin.saveSettingsOnly();
                }));

        // ── Excluded folders (folder picker) ────────────
        const maxFolders = isPro ? Infinity : FREE_LIMITS.maxExcludedFolders;
        new Setting(containerEl)
            .setName('Excluded folders')
            .setDesc(isPro
                ? 'Search and select folders to exclude from indexing'
                : `Search and select folders to exclude (Free: max ${FREE_LIMITS.maxExcludedFolders})`);

        this.renderFolderPicker(containerEl, maxFolders);

        // ── Show digest on startup ──────────────────────
        new Setting(containerEl)
            .setName('Show digest on startup')
            .setDesc('Automatically show the daily digest when Obsidian opens')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showDigestOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.showDigestOnStartup = value;
                    await this.plugin.saveSettingsOnly();
                }));
    }

    // ── License Section ─────────────────────────────────────

    private renderLicenseSection(containerEl: HTMLElement): void {
        const isPro = this.plugin.isPro();

        if (isPro) {
            new Setting(containerEl)
                .setName('✅ Vault Recall Pro')
                .setDesc('All premium features are unlocked')
                .addButton(btn => btn
                    .setButtonText('Deactivate')
                    .onClick(async () => {
                        this.plugin.settings.licenseKey = '';
                        this.plugin.settings.licenseStatus = null;
                        await this.plugin.saveSettingsOnly();
                        this.plugin.deactivateLicense();
                        this.display(); // Refresh settings UI
                    }));
        } else {
            const desc = document.createDocumentFragment();
            desc.append('Enter your license key to unlock all premium features. ');
            const buyLink = desc.createEl('a', {
                text: 'Get a license key →',
                href: 'https://vastavanjali.gumroad.com/l/nrwpa',
            });

            const setting = new Setting(containerEl)
                .setName('🔑 Activate Pro')
                .setDesc(desc);

            let keyInput = '';

            setting.addText(text => text
                .setPlaceholder('XXXX-XXXX-XXXX-XXXX')
                .setValue(this.plugin.settings.licenseKey)
                .onChange((value) => {
                    keyInput = value;
                }));

            setting.addButton(btn => btn
                .setButtonText('Activate')
                .setCta()
                .onClick(async () => {
                    if (!keyInput.trim()) {
                        new Notice('Please enter a license key');
                        return;
                    }

                    btn.setButtonText('Checking…');
                    btn.setDisabled(true);

                    this.plugin.settings.licenseKey = keyInput.trim();
                    const status = await this.plugin.activateLicense(keyInput.trim());

                    if (status.valid) {
                        new Notice('🎉 Vault Recall Pro activated!');
                    } else {
                        new Notice('❌ Invalid license key. Please try again.');
                        this.plugin.settings.licenseKey = '';
                    }

                    await this.plugin.saveSettingsOnly();
                    this.display(); // Refresh settings UI
                }));
        }
    }

    // ── Folder Picker ───────────────────────────────────────

    private renderFolderPicker(containerEl: HTMLElement, maxFolders: number): void {
        const pickerContainer = containerEl.createDiv({ cls: 'vr-folder-picker' });

        const atLimit = this.plugin.settings.excludedFolders.length >= maxFolders;

        // Search input
        const searchRow = pickerContainer.createDiv({ cls: 'vr-folder-search-row' });
        const searchInput = searchRow.createEl('input', {
            type: 'text',
            placeholder: atLimit ? `Upgrade to Pro for more folders` : 'Search folders...',
            cls: 'vr-folder-search-input',
        });
        if (atLimit) searchInput.disabled = true;

        const dropdown = pickerContainer.createDiv({ cls: 'vr-folder-dropdown' });
        dropdown.hide();

        // Get all vault folders
        const allFolders = this.getAllFolderPaths();

        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            dropdown.empty();

            if (query.length === 0) {
                dropdown.hide();
                return;
            }

            const matches = allFolders.filter(f =>
                f.toLowerCase().includes(query) &&
                !this.plugin.settings.excludedFolders.includes(f)
            );

            if (matches.length === 0) {
                const noResult = dropdown.createDiv({ cls: 'vr-folder-dropdown-item vr-folder-no-result' });
                noResult.setText('No matching folders');
                dropdown.show();
                return;
            }

            for (const folder of matches.slice(0, 10)) {
                const item = dropdown.createDiv({ cls: 'vr-folder-dropdown-item' });
                item.setText(folder);
                item.addEventListener('click', async () => {
                    this.plugin.settings.excludedFolders.push(folder);
                    await this.plugin.saveSettingsAndReindex();
                    searchInput.value = '';
                    dropdown.hide();
                    // Re-render the whole settings page to update limit state
                    this.display();
                });
            }

            dropdown.show();
        });

        // Close dropdown when clicking outside
        searchInput.addEventListener('blur', () => {
            setTimeout(() => dropdown.hide(), 200);
        });

        // Selected folders list
        const selectedList = pickerContainer.createDiv({ cls: 'vr-folder-selected-list' });
        this.renderSelectedFolders(selectedList);
    }

    private renderSelectedFolders(container: HTMLElement): void {
        container.empty();

        if (this.plugin.settings.excludedFolders.length === 0) {
            const empty = container.createDiv({ cls: 'vr-folder-empty' });
            empty.setText('No folders excluded');
            return;
        }

        for (const folder of this.plugin.settings.excludedFolders) {
            const tag = container.createDiv({ cls: 'vr-folder-tag' });
            tag.createSpan({ text: folder, cls: 'vr-folder-tag-name' });

            const removeBtn = tag.createSpan({ text: '✕', cls: 'vr-folder-tag-remove' });
            removeBtn.addEventListener('click', async () => {
                this.plugin.settings.excludedFolders =
                    this.plugin.settings.excludedFolders.filter((f: string) => f !== folder);
                await this.plugin.saveSettingsAndReindex();
                this.display();
            });
        }
    }

    private getAllFolderPaths(): string[] {
        const folders: string[] = [];
        const rootFolder = this.app.vault.getRoot();

        const walk = (folder: TFolder) => {
            for (const child of folder.children) {
                if (child instanceof TFolder) {
                    folders.push(child.path);
                    walk(child);
                }
            }
        };

        walk(rootFolder);
        return folders.sort();
    }
}
