import { Plugin, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { DEFAULT_SETTINGS, VaultRecallSettings, VaultRecallSettingTab } from './settings';
import { EmbeddingEngine } from './embeddings/engine';
import { SmartResurfacer } from './resurfacer/resurfacer';
import { VaultHealthAnalyzer } from './health/analyzer';
import { VaultRecallView, VIEW_TYPE } from './views/sidebar-view';
import { DailyDigestModal } from './views/digest-modal';
import { LicenseManager, LicenseStatus, FREE_LIMITS } from './license';

export default class VaultRecallPlugin extends Plugin {
    settings: VaultRecallSettings;
    engine: EmbeddingEngine | null = null;
    resurfacer: SmartResurfacer | null = null;
    healthAnalyzer: VaultHealthAnalyzer | null = null;
    private licenseManager: LicenseManager = new LicenseManager();

    // Debounce timers
    private indexDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingIndexFiles: Set<string> = new Set();

    async onload(): Promise<void> {
        await this.loadSettings();

        // Validate license
        await this.licenseManager.validate(
            this.settings.licenseKey,
            this.settings.licenseStatus ?? undefined
        );

        const excludedFolders = this.getExcludedFolders();

        // Initialize core engines
        const indexDir = this.getIndexDir();
        this.engine = new EmbeddingEngine(this.app, excludedFolders, indexDir);
        this.resurfacer = new SmartResurfacer(this.app, this.engine, this.settings.minDaysOld);
        this.healthAnalyzer = new VaultHealthAnalyzer(this.app, excludedFolders);

        // Register the sidebar view
        this.registerView(VIEW_TYPE, (leaf) => new VaultRecallView(leaf, this));

        // Ribbon icon to open sidebar
        this.addRibbonIcon('brain', 'Vault Recall', () => {
            this.activateView();
        });

        // Commands
        this.addCommand({
            id: 'open-vault-recall',
            name: 'Open Vault Recall sidebar',
            callback: () => this.activateView(),
        });

        this.addCommand({
            id: 'reindex-vault',
            name: 'Reindex vault',
            callback: () => this.reindexVault(),
        });

        this.addCommand({
            id: 'show-daily-digest',
            name: 'Show daily digest',
            callback: () => this.showDailyDigest(),
        });

        // Settings tab
        this.addSettingTab(new VaultRecallSettingTab(this.app, this));

        // Auto-index on startup
        this.app.workspace.onLayoutReady(async () => {
            await this.initializeIndex();

            if (this.settings.showDigestOnStartup && this.engine?.isReady()) {
                setTimeout(() => this.showDailyDigest(), 2000);
            }
        });

        // Listen for file changes — debounced
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.debouncedIndexNote(file);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (file instanceof TFile) {
                    this.engine?.removeNote(file.path);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('rename', async (file, oldPath) => {
                if (file instanceof TFile && file.extension === 'md') {
                    this.engine?.removeNote(oldPath);
                    this.debouncedIndexNote(file);
                }
            })
        );

        // Update sidebar when active file changes — debounced
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.debouncedRefreshSidebar();
            })
        );
    }

    onunload(): void {
        if (this.indexDebounceTimer) clearTimeout(this.indexDebounceTimer);
        if (this.refreshDebounceTimer) clearTimeout(this.refreshDebounceTimer);
        this.engine?.saveIndex();
    }

    // ── License ─────────────────────────────────────────────

    isPro(): boolean {
        return this.licenseManager.isPro();
    }

    async activateLicense(key: string): Promise<LicenseStatus> {
        const status = await this.licenseManager.validate(key);
        this.settings.licenseStatus = status;
        return status;
    }

    deactivateLicense(): void {
        this.licenseManager.validate(undefined);
    }

    /**
     * Get the effective digest count, capped by tier.
     */
    getEffectiveDigestCount(): number {
        if (this.isPro()) return this.settings.digestCount;
        return Math.min(this.settings.digestCount, FREE_LIMITS.maxDigestCount);
    }

    // ── Settings ────────────────────────────────────────────

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<VaultRecallSettings>);
    }

    async saveSettingsOnly(): Promise<void> {
        await this.saveData(this.settings);
    }

    async saveSettingsAndReindex(): Promise<void> {
        await this.saveData(this.settings);

        const excludedFolders = this.getExcludedFolders();
        this.engine?.setExcludedFolders(excludedFolders);
        this.healthAnalyzer?.setExcludedFolders(excludedFolders);

        if (this.engine?.isReady()) {
            await this.engine.indexVault();
            await this.engine.saveIndex();

            const view = this.getRecallView();
            if (view) {
                await view.refresh();
            }
        }
    }

    // ── Index Management ────────────────────────────────────

    private async initializeIndex(): Promise<void> {
        if (!this.engine) return;

        const loaded = await this.engine.loadIndex();
        if (loaded) {
            new Notice('Vault Recall: Index loaded from cache');
        } else {
            await this.engine.indexVault();
            await this.engine.saveIndex();
        }
    }

    private async reindexVault(): Promise<void> {
        if (!this.engine) return;
        await this.engine.indexVault();
        await this.engine.saveIndex();

        const view = this.getRecallView();
        if (view) {
            await view.refresh();
        }
    }

    async triggerReindex(): Promise<void> {
        await this.reindexVault();
    }

    // ── Debounced Operations ────────────────────────────────

    private debouncedIndexNote(file: TFile): void {
        this.pendingIndexFiles.add(file.path);

        if (this.indexDebounceTimer) {
            clearTimeout(this.indexDebounceTimer);
        }

        this.indexDebounceTimer = setTimeout(async () => {
            this.indexDebounceTimer = null;
            for (const path of this.pendingIndexFiles) {
                const f = this.app.vault.getAbstractFileByPath(path);
                if (f instanceof TFile) {
                    await this.engine?.indexNote(f);
                }
            }
            this.pendingIndexFiles.clear();
        }, 2000);
    }

    private debouncedRefreshSidebar(): void {
        if (this.refreshDebounceTimer) {
            clearTimeout(this.refreshDebounceTimer);
        }

        this.refreshDebounceTimer = setTimeout(async () => {
            this.refreshDebounceTimer = null;
            const view = this.getRecallView();
            if (view) {
                await view.refresh();
            }
        }, 300);
    }

    // ── Helpers ─────────────────────────────────────────────

    private async showDailyDigest(): Promise<void> {
        if (!this.resurfacer || !this.engine?.isReady()) {
            new Notice('Vault Recall: Index not ready. Run "Reindex vault" first.');
            return;
        }

        const count = this.getEffectiveDigestCount();
        const digest = await this.resurfacer.getDailyDigest(count);
        new DailyDigestModal(this.app, digest).open();
    }

    private async activateView(): Promise<void> {
        const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
        if (existing.length > 0) {
            this.app.workspace.revealLeaf(existing[0]!);
            return;
        }

        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE, active: true });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    private getRecallView(): VaultRecallView | null {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
        if (leaves.length > 0) {
            return leaves[0]!.view as VaultRecallView;
        }
        return null;
    }

    private getIndexDir(): string {
        return `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    }

    private getExcludedFolders(): string[] {
        return this.settings.excludedFolders;
    }
}
