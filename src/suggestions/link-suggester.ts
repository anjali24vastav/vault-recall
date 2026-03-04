import { App, TFile } from 'obsidian';
import { EmbeddingEngine, SimilarNote } from '../embeddings/engine';

export interface LinkSuggestion {
    /** The file that could be linked to */
    file: TFile;
    /** Similarity score */
    similarity: number;
    /** Key shared terms between the notes */
    sharedTerms: string[];
}

/**
 * LinkSuggester finds notes that are semantically similar to the current note
 * but aren't already linked. Helps users discover connections they missed.
 */
export class LinkSuggester {
    private app: App;
    private engine: EmbeddingEngine;

    constructor(app: App, engine: EmbeddingEngine) {
        this.app = app;
        this.engine = engine;
    }

    /**
     * Get link suggestions for a given file.
     * Returns similar notes that are NOT already linked from the current note.
     */
    getSuggestions(file: TFile, count: number = 5): LinkSuggestion[] {
        if (!this.engine.isReady()) return [];

        // Get existing outgoing links from this file
        const existingLinks = this.getOutgoingLinks(file);

        // Find similar notes
        const similar = this.engine.findSimilar(file, count * 3);

        // Filter out already-linked notes and convert to suggestions
        const suggestions: LinkSuggestion[] = [];

        for (const s of similar) {
            // Skip if already linked
            if (existingLinks.has(s.file.path)) continue;

            // Only suggest notes above a meaningful similarity threshold
            if (s.similarity < 0.05) continue;

            const sharedTerms = this.getSharedTerms(file, s.file);
            suggestions.push({
                file: s.file,
                similarity: s.similarity,
                sharedTerms: sharedTerms.slice(0, 3),
            });

            if (suggestions.length >= count) break;
        }

        return suggestions;
    }

    /**
     * Get all outgoing links from a file.
     */
    private getOutgoingLinks(file: TFile): Set<string> {
        const links = new Set<string>();
        const cache = this.app.metadataCache.getFileCache(file);

        if (cache?.links) {
            for (const link of cache.links) {
                const resolved = this.app.metadataCache.getFirstLinkpathDest(
                    link.link,
                    file.path,
                );
                if (resolved) {
                    links.add(resolved.path);
                }
            }
        }

        // Also check embeds
        if (cache?.embeds) {
            for (const embed of cache.embeds) {
                const resolved = this.app.metadataCache.getFirstLinkpathDest(
                    embed.link,
                    file.path,
                );
                if (resolved) {
                    links.add(resolved.path);
                }
            }
        }

        return links;
    }

    /**
     * Find terms shared between two notes (based on their TF maps).
     * Returns the most important shared terms, sorted by weight.
     */
    private getSharedTerms(fileA: TFile, fileB: TFile): string[] {
        const cacheA = this.app.metadataCache.getFileCache(fileA);
        const cacheB = this.app.metadataCache.getFileCache(fileB);

        // Use tags as a quick proxy for shared terms
        const tagsA = new Set(cacheA?.tags?.map(t => t.tag.replace('#', '')) ?? []);
        const tagsB = new Set(cacheB?.tags?.map(t => t.tag.replace('#', '')) ?? []);

        const shared: string[] = [];
        for (const tag of tagsA) {
            if (tagsB.has(tag)) shared.push(`#${tag}`);
        }

        // Also extract shared words from filenames
        const wordsA = new Set(fileA.basename.toLowerCase().split(/[-_\s]+/));
        const wordsB = new Set(fileB.basename.toLowerCase().split(/[-_\s]+/));

        for (const word of wordsA) {
            if (word.length > 3 && wordsB.has(word)) {
                shared.push(word);
            }
        }

        return shared;
    }
}
