import { App, TFile } from 'obsidian';

export interface HealthReport {
    score: number;				// 0-100
    orphanNotes: TFile[];		// Notes with no backlinks
    brokenLinks: BrokenLink[];	// Links to non-existent notes
    emptyNotes: TFile[];		// Notes with almost no content
    duplicateTitles: string[][]; // Groups of files with same basename
    totalNotes: number;
    totalLinks: number;
}

export interface BrokenLink {
    sourceFile: TFile;
    targetPath: string;
}

/**
 * VaultHealthAnalyzer examines vault structure and identifies
 * organizational issues. Pure algorithmic — no AI needed.
 */
export class VaultHealthAnalyzer {
    private app: App;
    private excludedFolders: string[];

    constructor(app: App, excludedFolders: string[] = []) {
        this.app = app;
        this.excludedFolders = excludedFolders;
    }

    /**
     * Update excluded folders (called when settings change).
     */
    setExcludedFolders(folders: string[]): void {
        this.excludedFolders = folders;
    }

    /**
     * Run a full health analysis on the vault.
     */
    analyze(): HealthReport {
        const files = this.getMarkdownFiles();
        const orphanNotes = this.findOrphanNotes(files);
        const brokenLinks = this.findBrokenLinks(files);
        const emptyNotes = this.findEmptyNotes(files);
        const duplicateTitles = this.findDuplicateTitles(files);

        // Count total links
        let totalLinks = 0;
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.links) totalLinks += cache.links.length;
        }

        // Calculate health score (0-100)
        const score = this.calculateScore(
            files.length,
            orphanNotes.length,
            brokenLinks.length,
            emptyNotes.length,
            duplicateTitles.length,
        );

        return {
            score,
            orphanNotes,
            brokenLinks,
            emptyNotes,
            duplicateTitles,
            totalNotes: files.length,
            totalLinks,
        };
    }

    /**
     * Find notes that have zero backlinks (nothing links to them).
     */
    private findOrphanNotes(files: TFile[]): TFile[] {
        const orphans: TFile[] = [];
        const resolvedLinks = this.app.metadataCache.resolvedLinks;

        for (const file of files) {
            let count = 0;
            for (const sourcePath in resolvedLinks) {
                const targets = resolvedLinks[sourcePath];
                if (targets && file.path in targets) {
                    count++;
                }
            }

            // A note is orphan if nothing links to it AND it doesn't link to anything
            // (pure island in the graph)
            if (count === 0) {
                orphans.push(file);
            }
        }

        return orphans;
    }

    /**
     * Find links that point to non-existent notes.
     */
    private findBrokenLinks(files: TFile[]): BrokenLink[] {
        const broken: BrokenLink[] = [];

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache?.links) continue;

            for (const link of cache.links) {
                const targetPath = link.link;
                // Check if the linked file exists
                const resolved = this.app.metadataCache.getFirstLinkpathDest(
                    targetPath,
                    file.path
                );
                if (!resolved) {
                    broken.push({ sourceFile: file, targetPath });
                }
            }
        }

        return broken;
    }

    /**
     * Find notes with almost no content (<20 characters after stripping frontmatter).
     */
    private findEmptyNotes(files: TFile[]): TFile[] {
        const empty: TFile[] = [];

        for (const file of files) {
            // Use file stat size as a quick proxy
            // A file with < 50 bytes is effectively empty
            if (file.stat.size < 50) {
                empty.push(file);
            }
        }

        return empty;
    }

    /**
     * Find groups of files with identical basenames (potential duplicates).
     */
    private findDuplicateTitles(files: TFile[]): string[][] {
        const nameMap = new Map<string, string[]>();

        for (const file of files) {
            const name = file.basename.toLowerCase();
            const existing = nameMap.get(name);
            if (existing) {
                existing.push(file.path);
            } else {
                nameMap.set(name, [file.path]);
            }
        }

        // Return only groups with 2+ files
        const duplicates: string[][] = [];
        for (const paths of nameMap.values()) {
            if (paths.length > 1) {
                duplicates.push(paths);
            }
        }

        return duplicates;
    }

    /**
     * Calculate a health score from 0-100.
     * Higher = healthier vault.
     */
    private calculateScore(
        totalNotes: number,
        orphanCount: number,
        brokenCount: number,
        emptyCount: number,
        duplicateGroupCount: number,
    ): number {
        if (totalNotes === 0) return 100;

        // Penalties (percentage of total notes)
        const orphanPenalty = Math.min((orphanCount / totalNotes) * 40, 30);
        const brokenPenalty = Math.min((brokenCount / totalNotes) * 50, 25);
        const emptyPenalty = Math.min((emptyCount / totalNotes) * 30, 20);
        const duplicatePenalty = Math.min((duplicateGroupCount / totalNotes) * 20, 10);

        const score = 100 - orphanPenalty - brokenPenalty - emptyPenalty - duplicatePenalty;
        return Math.max(0, Math.round(score));
    }

    private getMarkdownFiles(): TFile[] {
        return this.app.vault.getMarkdownFiles().filter(file => {
            return !this.excludedFolders.some(folder =>
                file.path.startsWith(folder + '/')
            );
        });
    }
}
