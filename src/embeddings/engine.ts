import { App, TFile, Notice } from 'obsidian';
import { tokenize, computeTF, computeIDF, computeTFIDF, cosineSimilarity } from './tfidf';

export interface NoteIndex {
    /** File path -> TF map (term -> frequency) */
    tfMaps: Record<string, Record<string, number>>;
    /** Global IDF map (term -> idf value) */
    idf: Record<string, number>;
    /** Timestamp of last full index */
    lastIndexed: number;
}

export interface SimilarNote {
    file: TFile;
    similarity: number;
}

/**
 * EmbeddingEngine manages the TF-IDF index for all vault notes.
 * Runs 100% locally — no data ever leaves the machine.
 */
export class EmbeddingEngine {
    private app: App;
    private tfMaps: Map<string, Map<string, number>> = new Map();
    private idf: Map<string, number> = new Map();
    private tfidfVectors: Map<string, Map<string, number>> = new Map();
    private indexReady = false;
    private excludedFolders: string[];
    private indexDir: string;

    constructor(app: App, excludedFolders: string[] = [], indexDir: string = '.vault-recall') {
        this.app = app;
        this.excludedFolders = excludedFolders;
        this.indexDir = indexDir;
    }

    /**
     * Update excluded folders (called when settings change).
     */
    setExcludedFolders(folders: string[]): void {
        this.excludedFolders = folders;
    }

    /**
     * Check if the index is ready
     */
    isReady(): boolean {
        return this.indexReady;
    }

    /**
     * Full vault index: reads all markdown files and builds TF-IDF vectors.
     */
    async indexVault(): Promise<void> {
        const startTime = Date.now();
        const files = this.getMarkdownFiles();

        if (files.length === 0) {
            new Notice('Vault Recall: No markdown files found to index.');
            return;
        }

        // Step 1: Build TF maps for each file
        this.tfMaps.clear();
        for (const file of files) {
            const content = await this.app.vault.cachedRead(file);
            const tokens = tokenize(this.getIndexableContent(file, content));
            const tf = computeTF(tokens);
            this.tfMaps.set(file.path, tf);
        }

        // Step 2: Compute global IDF
        const allTfMaps = Array.from(this.tfMaps.values());
        this.idf = computeIDF(allTfMaps);

        // Step 3: Build TF-IDF vectors for each file
        this.tfidfVectors.clear();
        for (const [path, tf] of this.tfMaps) {
            this.tfidfVectors.set(path, computeTFIDF(tf, this.idf));
        }

        this.indexReady = true;
        const elapsed = Date.now() - startTime;
        new Notice(`Vault Recall: Indexed ${files.length} notes in ${elapsed}ms`);
    }

    /**
     * Index a single note (for incremental updates when a file changes).
     */
    async indexNote(file: TFile): Promise<void> {
        if (!this.indexReady) return;

        const content = await this.app.vault.cachedRead(file);
        const tokens = tokenize(this.getIndexableContent(file, content));
        const tf = computeTF(tokens);
        this.tfMaps.set(file.path, tf);

        // Recompute IDF (needs all docs)
        const allTfMaps = Array.from(this.tfMaps.values());
        this.idf = computeIDF(allTfMaps);

        // Recompute TF-IDF for the changed file
        this.tfidfVectors.set(file.path, computeTFIDF(tf, this.idf));
    }

    /**
     * Remove a note from the index.
     */
    removeNote(path: string): void {
        this.tfMaps.delete(path);
        this.tfidfVectors.delete(path);
    }

    /**
     * Find top-K similar notes to a given file.
     */
    findSimilar(file: TFile, topK: number = 5): SimilarNote[] {
        if (!this.indexReady) return [];

        const sourceVector = this.tfidfVectors.get(file.path);
        if (!sourceVector) return [];

        const scores: { path: string; similarity: number }[] = [];

        for (const [path, vector] of this.tfidfVectors) {
            if (path === file.path) continue; // Skip self
            const sim = cosineSimilarity(sourceVector, vector);
            if (sim > 0.01) { // Minimal threshold to filter noise
                scores.push({ path, similarity: sim });
            }
        }

        // Sort by similarity descending
        scores.sort((a, b) => b.similarity - a.similarity);

        // Convert paths to TFile objects
        return scores.slice(0, topK).map(s => {
            const f = this.app.vault.getAbstractFileByPath(s.path);
            return f instanceof TFile ? { file: f, similarity: s.similarity } : null;
        }).filter((x): x is SimilarNote => x !== null);
    }

    /**
     * Get all indexed file paths.
     */
    getIndexedPaths(): string[] {
        return Array.from(this.tfMaps.keys());
    }

    /**
     * Get indexable content from a file: includes title + content.
     * Strips YAML frontmatter and markdown syntax for cleaner tokens.
     */
    private getIndexableContent(file: TFile, content: string): string {
        // Add the filename (without extension) as extra weight
        const title = file.basename.replace(/[-_]/g, ' ');

        // Strip YAML frontmatter
        let body = content.replace(/^---[\s\S]*?---\n?/, '');

        // Strip markdown links but keep text
        body = body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, link, alias) => alias ?? link);
        body = body.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

        // Strip other markdown syntax
        body = body.replace(/^#{1,6}\s+/gm, '');	// Headers
        body = body.replace(/[*_~`]/g, '');			// Bold/italic/code
        body = body.replace(/^>\s+/gm, '');			// Blockquotes
        body = body.replace(/^[-*+]\s+/gm, '');		// List markers
        body = body.replace(/^\d+\.\s+/gm, '');		// Numbered lists

        // Title gets extra weight by repeating it
        return `${title} ${title} ${title} ${body}`;
    }

    /**
     * Get all markdown files, excluding configured folders.
     */
    private getMarkdownFiles(): TFile[] {
        return this.app.vault.getMarkdownFiles().filter(file => {
            return !this.excludedFolders.some(folder =>
                file.path.startsWith(folder + '/')
            );
        });
    }

    /**
     * Save the index to disk inside the plugin's data directory.
     */
    async saveIndex(): Promise<void> {
        const data: NoteIndex = {
            tfMaps: Object.fromEntries(
                Array.from(this.tfMaps.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
            ),
            idf: Object.fromEntries(this.idf),
            lastIndexed: Date.now(),
        };

        const path = `${this.indexDir}/index.json`;
        const json = JSON.stringify(data);

        if (!(await this.app.vault.adapter.exists(this.indexDir))) {
            await this.app.vault.adapter.mkdir(this.indexDir);
        }
        await this.app.vault.adapter.write(path, json);
    }

    /**
     * Load a previously saved index from disk.
     * Returns true if a valid index was loaded.
     */
    async loadIndex(): Promise<boolean> {
        const path = `${this.indexDir}/index.json`;

        try {
            if (!(await this.app.vault.adapter.exists(path))) return false;

            const json = await this.app.vault.adapter.read(path);
            const data: NoteIndex = JSON.parse(json);

            // Restore TF maps
            this.tfMaps.clear();
            for (const [filePath, tf] of Object.entries(data.tfMaps)) {
                this.tfMaps.set(filePath, new Map(Object.entries(tf)));
            }

            // Restore IDF
            this.idf = new Map(Object.entries(data.idf));

            // Rebuild TF-IDF vectors
            this.tfidfVectors.clear();
            for (const [filePath, tf] of this.tfMaps) {
                this.tfidfVectors.set(filePath, computeTFIDF(tf, this.idf));
            }

            this.indexReady = true;
            return true;
        } catch {
            return false;
        }
    }
}
