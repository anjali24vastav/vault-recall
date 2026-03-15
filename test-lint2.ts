import { ItemView } from 'obsidian';
export class TestView extends ItemView {
    getViewType() { return "test"; }
    getDisplayText() { return "test"; }
    async onOpen() {
        this.containerEl.createEl('h4', { text: '📌 Your daily recall' });
        this.containerEl.createEl('h4', { text: '📌 ' + 'Your daily recall' });
        this.containerEl.createSpan({ text: '📌 '});
        this.containerEl.createSpan({ text: 'Your daily recall'});
    }
}
