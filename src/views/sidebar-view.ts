import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import type VaultRecallPlugin from '../main';
import type { ResurfacedNote } from '../resurfacer/resurfacer';
import type { HealthReport } from '../health/analyzer';
import type { SimilarNote } from '../embeddings/engine';
import { FREE_LIMITS } from '../license';

export const VIEW_TYPE = 'vault-recall-view';

type TabName = 'recall' | 'related' | 'health';

/**
 * Main sidebar view for Vault Recall.
 * Three tabs: Recall (daily digest), Related (contextual), Health (vault health).
 */
export class VaultRecallView extends ItemView {
    private plugin: VaultRecallPlugin;
    private activeTab: TabName = 'recall';

    constructor(leaf: WorkspaceLeaf, plugin: VaultRecallPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Vault Recall';
    }

    getIcon(): string {
        return 'brain';
    }

    async onOpen(): Promise<void> {
        await this.renderView();
    }

    async onClose(): Promise<void> {
        // Cleanup
    }

    /**
     * Refresh the view (called when active file changes or data updates).
     */
    async refresh(): Promise<void> {
        await this.renderView();
    }

    private async renderView(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        if (!container) return;
        container.empty();
        container.addClass('vault-recall-container');

        // Tab bar with refresh button
        const topBar = container.createDiv({ cls: 'vr-top-bar' });

        const tabBar = topBar.createDiv({ cls: 'vr-tab-bar' });
        this.createTab(tabBar, 'recall', '💡', 'Recall');
        this.createTab(tabBar, 'related', '🔗', 'Related');
        this.createTab(tabBar, 'health', '❤️', 'Health');

        const refreshBtn = topBar.createDiv({ cls: 'vr-refresh-btn', attr: { 'aria-label': 'Refresh & reindex' } });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.addClass('vr-spinning');
            await this.plugin.triggerReindex();
            refreshBtn.removeClass('vr-spinning');
            await this.renderView();
        });

        // Tab content
        const content = container.createDiv({ cls: 'vr-tab-content' });

        switch (this.activeTab) {
            case 'recall':
                await this.renderRecallTab(content);
                break;
            case 'related':
                await this.renderRelatedTab(content);
                break;
            case 'health':
                this.renderHealthTab(content);
                break;
        }
    }

    private createTab(parent: HTMLElement, id: TabName, icon: string, label: string): void {
        const tab = parent.createDiv({
            cls: `vr-tab ${this.activeTab === id ? 'vr-tab-active' : ''}`,
        });
        tab.createSpan({ text: `${icon} ${label}` });
        tab.addEventListener('click', () => {
            this.activeTab = id;
            this.renderView();
        });
    }

    // ── Recall Tab ──────────────────────────────────────────────

    private async renderRecallTab(container: HTMLElement): Promise<void> {
        const header = container.createDiv({ cls: 'vr-section-header' });
        header.createEl('h4', { text: '📌 Your Daily Recall' });
        header.createEl('p', {
            text: 'Notes you wrote but may have forgotten',
            cls: 'vr-subtitle',
        });

        if (!this.plugin.engine?.isReady()) {
            const loading = container.createDiv({ cls: 'vr-empty-state' });
            loading.createEl('p', { text: '⏳ Indexing vault…' });
            loading.createEl('p', {
                text: 'Run "Vault Recall: Reindex vault" from the command palette',
                cls: 'vr-subtitle',
            });
            return;
        }

        const count = this.plugin.getEffectiveDigestCount();
        const digest = await this.plugin.resurfacer?.getDailyDigest(count);

        if (!digest || digest.length === 0) {
            const empty = container.createDiv({ cls: 'vr-empty-state' });
            empty.createEl('p', { text: '✨ Nothing to resurface right now' });
            empty.createEl('p', {
                text: 'Keep writing — notes older than ' + this.plugin.settings.minDaysOld + ' days will appear here',
                cls: 'vr-subtitle',
            });
            return;
        }

        const list = container.createDiv({ cls: 'vr-note-list' });
        for (const note of digest) {
            this.renderNoteCard(list, note.file, note.snippet, note.reason, `${note.daysSinceModified}d ago`);
        }
    }

    // ── Related Tab ─────────────────────────────────────────────

    private async renderRelatedTab(container: HTMLElement): Promise<void> {
        const header = container.createDiv({ cls: 'vr-section-header' });
        header.createEl('h4', { text: '🔗 You Wrote About This' });
        header.createEl('p', {
            text: 'Forgotten notes related to what you\'re working on',
            cls: 'vr-subtitle',
        });

        if (!this.plugin.engine?.isReady()) {
            const loading = container.createDiv({ cls: 'vr-empty-state' });
            loading.createEl('p', { text: '⏳ Index not ready' });
            return;
        }

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            const empty = container.createDiv({ cls: 'vr-empty-state' });
            empty.createEl('p', { text: '📝 Open a note to see related content' });
            return;
        }

        const suggestions = this.plugin.resurfacer?.getContextualSuggestions(activeFile) ?? [];

        if (suggestions.length === 0) {
            const empty = container.createDiv({ cls: 'vr-empty-state' });
            empty.createEl('p', { text: '🔍 No forgotten related notes found' });
            empty.createEl('p', {
                text: 'This note might be new, or related notes were modified recently',
                cls: 'vr-subtitle',
            });
            return;
        }

        const list = container.createDiv({ cls: 'vr-note-list' });
        for (const s of suggestions) {
            const daysSince = Math.round((Date.now() - s.file.stat.mtime) / (1000 * 60 * 60 * 24));
            const similarity = Math.round(s.similarity * 100);
            this.renderNoteCard(
                list,
                s.file,
                '',
                `${similarity}% similar`,
                `${daysSince}d ago`,
            );
        }
    }

    // ── Health Tab ───────────────────────────────────────────────

    private renderHealthTab(container: HTMLElement): void {
        const header = container.createDiv({ cls: 'vr-section-header' });
        header.createEl('h4', { text: '❤️ Vault Health' });

        const report = this.plugin.healthAnalyzer?.analyze();
        if (!report) {
            container.createEl('p', { text: 'Unable to analyze vault health' });
            return;
        }

        // Score display
        this.renderHealthScore(container, report);

        // Stats
        const stats = container.createDiv({ cls: 'vr-health-stats' });
        this.renderStatRow(stats, '📄', 'Total Notes', report.totalNotes.toString());
        this.renderStatRow(stats, '🔗', 'Total Links', report.totalLinks.toString());
        this.renderStatRow(stats, '🏝️', 'Orphan Notes', report.orphanNotes.length.toString());
        this.renderStatRow(stats, '💔', 'Broken Links', report.brokenLinks.length.toString());
        this.renderStatRow(stats, '📭', 'Empty Notes', report.emptyNotes.length.toString());
        this.renderStatRow(stats, '👯', 'Duplicate Titles', report.duplicateTitles.length.toString());

        // Issue details — Pro only
        if (this.plugin.isPro() || FREE_LIMITS.fullHealthDetails) {
            if (report.orphanNotes.length > 0) {
                this.renderIssueGroup(container, '🏝️ Orphan Notes', report.orphanNotes.slice(0, 10));
            }

            if (report.brokenLinks.length > 0) {
                const group = container.createDiv({ cls: 'vr-issue-group' });
                group.createEl('h5', { text: `💔 Broken Links (${report.brokenLinks.length})` });
                for (const bl of report.brokenLinks.slice(0, 10)) {
                    const item = group.createDiv({ cls: 'vr-issue-item' });
                    item.createSpan({
                        text: `${bl.sourceFile.basename} → `,
                        cls: 'vr-issue-source',
                    });
                    item.createSpan({
                        text: bl.targetPath,
                        cls: 'vr-issue-broken',
                    });
                }
            }

            if (report.emptyNotes.length > 0) {
                this.renderIssueGroup(container, '📭 Empty Notes', report.emptyNotes.slice(0, 10));
            }
        } else {
            // Free tier: show upgrade prompt
            const upsell = container.createDiv({ cls: 'vr-upsell' });
            upsell.createEl('p', { text: '🔓 Unlock detailed issue lists with Pro' });
            upsell.createEl('p', {
                text: 'See orphan notes, broken links, and more',
                cls: 'vr-subtitle',
            });
            const link = upsell.createEl('a', {
                text: 'Upgrade to Pro →',
                href: 'https://vastavanjali.gumroad.com/l/nrwpa',
                cls: 'vr-upsell-link',
            });
        }
    }

    private renderHealthScore(container: HTMLElement, report: HealthReport): void {
        const scoreBox = container.createDiv({ cls: 'vr-health-score' });

        let scoreClass = 'vr-score-good';
        let label = 'Healthy';
        if (report.score < 50) {
            scoreClass = 'vr-score-bad';
            label = 'Needs Work';
        } else if (report.score < 75) {
            scoreClass = 'vr-score-warning';
            label = 'Fair';
        }

        const scoreNum = scoreBox.createDiv({ cls: `vr-score-number ${scoreClass}` });
        scoreNum.createSpan({ text: report.score.toString() });
        scoreNum.createSpan({ text: '/100', cls: 'vr-score-max' });

        scoreBox.createDiv({ cls: `vr-score-label ${scoreClass}`, text: label });
    }

    private renderStatRow(container: HTMLElement, icon: string, label: string, value: string): void {
        const row = container.createDiv({ cls: 'vr-stat-row' });
        row.createSpan({ text: `${icon} ${label}` });
        row.createSpan({ text: value, cls: 'vr-stat-value' });
    }

    private renderIssueGroup(container: HTMLElement, title: string, files: TFile[]): void {
        const group = container.createDiv({ cls: 'vr-issue-group' });
        group.createEl('h5', { text: `${title} (${files.length})` });
        for (const file of files) {
            const item = group.createDiv({ cls: 'vr-issue-item vr-clickable' });
            item.createSpan({ text: file.basename });
            item.addEventListener('click', () => {
                this.app.workspace.getLeaf(false).openFile(file);
            });
        }
    }

    // ── Shared Components ───────────────────────────────────────

    private renderNoteCard(
        container: HTMLElement,
        file: TFile,
        snippet: string,
        badge: string,
        age: string,
    ): void {
        const card = container.createDiv({ cls: 'vr-note-card' });

        const titleRow = card.createDiv({ cls: 'vr-card-title-row' });
        const titleEl = titleRow.createSpan({ text: file.basename, cls: 'vr-card-title' });
        titleRow.createSpan({ text: age, cls: 'vr-card-age' });

        if (badge) {
            card.createDiv({ text: badge, cls: 'vr-card-badge' });
        }

        if (snippet) {
            card.createDiv({ text: snippet, cls: 'vr-card-snippet' });
        }

        // Click to open
        card.addEventListener('click', () => {
            this.app.workspace.getLeaf(false).openFile(file);
        });
    }
}
