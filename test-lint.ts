import { ItemView } from 'obsidian';
export class TestView extends ItemView {
    getViewType() { return "test"; }
    getDisplayText() { return "test"; }
    async onOpen() {
        const h = this.containerEl.createEl('h4');
        h.createSpan({ text: '📌 ' });
        h.createSpan({ text: 'Your daily recall' });
        
        this.containerEl.createEl('h4', { text: '📌 ' + 'Your daily recall' });
    }
}
