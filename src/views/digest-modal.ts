import { App, Modal } from 'obsidian';
import type { ResurfacedNote } from '../resurfacer/resurfacer';

/**
 * Daily Digest Modal shown on startup (or via command).
 * Displays the day's resurfaced notes with previews and action buttons.
 */
export class DailyDigestModal extends Modal {
    private notes: ResurfacedNote[];

    constructor(app: App, notes: ResurfacedNote[]) {
        super(app);
        this.notes = notes;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('vr-digest-modal');

        // Header
        const header = contentEl.createDiv({ cls: 'vr-digest-header' });
        header.createEl('h2', { text: '🧠 Your Daily Recall' });

        const date = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
        });
        header.createEl('p', { text: date, cls: 'vr-digest-date' });

        if (this.notes.length === 0) {
            const empty = contentEl.createDiv({ cls: 'vr-digest-empty' });
            empty.createEl('p', { text: '✨ Nothing to resurface today!' });
            empty.createEl('p', {
                text: 'All your notes are either too recent or well-connected.',
                cls: 'vr-subtitle',
            });
            return;
        }

        const subtitle = contentEl.createEl('p', {
            text: `Here are ${this.notes.length} notes you may have forgotten:`,
            cls: 'vr-digest-subtitle',
        });

        // Note cards
        const list = contentEl.createDiv({ cls: 'vr-digest-list' });
        for (const note of this.notes) {
            this.renderDigestCard(list, note);
        }

        // Footer
        const footer = contentEl.createDiv({ cls: 'vr-digest-footer' });
        footer.createEl('p', {
            text: '💡 Tip: Review these notes to strengthen your knowledge connections',
            cls: 'vr-digest-tip',
        });
    }

    private renderDigestCard(container: HTMLElement, note: ResurfacedNote): void {
        const card = container.createDiv({ cls: 'vr-digest-card' });

        // Title row
        const titleRow = card.createDiv({ cls: 'vr-digest-title-row' });
        titleRow.createEl('h4', { text: note.file.basename, cls: 'vr-digest-note-title' });
        titleRow.createSpan({
            text: `${note.daysSinceModified}d ago`,
            cls: 'vr-digest-age',
        });

        // Reason badge
        card.createDiv({ text: note.reason, cls: 'vr-digest-reason' });

        // Snippet
        if (note.snippet) {
            card.createDiv({ text: note.snippet, cls: 'vr-digest-snippet' });
        }

        // Actions
        const actions = card.createDiv({ cls: 'vr-digest-actions' });

        const openBtn = actions.createEl('button', {
            text: '📖 Open',
            cls: 'vr-btn vr-btn-primary',
        });
        openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.app.workspace.getLeaf(false).openFile(note.file);
            this.close();
        });

        const dismissBtn = actions.createEl('button', {
            text: '✕ Dismiss',
            cls: 'vr-btn vr-btn-ghost',
        });
        dismissBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            card.remove();
        });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
