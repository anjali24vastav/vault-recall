import { App, TFile } from 'obsidian';
import { EmbeddingEngine, SimilarNote } from '../embeddings/engine';
import {
    relevanceScore,
    timeDecayScore,
    orphanBoost,
    getBacklinkCount,
    compositeScore,
} from './scoring';

export interface ResurfacedNote {
    file: TFile;
    score: number;
    reason: string;
    daysSinceModified: number;
    snippet: string;
}

/**
 * SmartResurfacer uses the embedding engine + scoring functions to find
 * the most valuable forgotten notes to resurface.
 */
export class SmartResurfacer {
    private app: App;
    private engine: EmbeddingEngine;
    private minDaysOld: number;

    constructor(app: App, engine: EmbeddingEngine, minDaysOld: number = 7) {
        this.app = app;
        this.engine = engine;
        this.minDaysOld = minDaysOld;
    }

    /**
     * Get the daily digest: top-N notes to resurface.
     * Uses a blend of relevance to recent work + time decay + orphan status.
     */
    async getDailyDigest(count: number = 5): Promise<ResurfacedNote[]> {
        if (!this.engine.isReady()) return [];

        // Get recently modified files (last 3 days) as context
        const recentFiles = this.getRecentlyModifiedFiles(3);
        if (recentFiles.length === 0) {
            // Fallback: just use time decay + orphan scoring
            return this.getForgottenNotes(count);
        }

        // Find notes similar to recent work
        const candidateMap = new Map<string, { file: TFile; maxSimilarity: number }>();

        for (const recentFile of recentFiles) {
            const similar = this.engine.findSimilar(recentFile, 20);
            for (const s of similar) {
                const daysSince = this.getDaysSinceModified(s.file);
                if (daysSince < this.minDaysOld) continue; // Skip recently modified

                const existing = candidateMap.get(s.file.path);
                if (!existing || s.similarity > existing.maxSimilarity) {
                    candidateMap.set(s.file.path, { file: s.file, maxSimilarity: s.similarity });
                }
            }
        }

        // Score each candidate
        const scored: ResurfacedNote[] = [];
        for (const [_, candidate] of candidateMap) {
            const { file, maxSimilarity } = candidate;
            const daysSince = this.getDaysSinceModified(file);
            const backlinks = getBacklinkCount(this.app, file);

            const rel = relevanceScore(maxSimilarity);
            const decay = timeDecayScore(file.stat.mtime);
            const orphan = orphanBoost(backlinks);
            const score = compositeScore(rel, decay, orphan);

            // Generate a reason string
            let reason = '';
            if (rel > 0.3) {
                reason = 'Related to your recent work';
            } else if (decay > 0.8) {
                reason = 'Written long ago, might be worth revisiting';
            } else if (orphan > 0.5) {
                reason = 'Unlinked note — consider connecting it';
            } else {
                reason = 'Forgotten note worth revisiting';
            }

            const snippet = await this.getSnippet(file);

            scored.push({
                file,
                score,
                reason,
                daysSinceModified: Math.round(daysSince),
                snippet,
            });
        }

        // Sort by composite score and return top N
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, count);
    }

    /**
     * Get contextual suggestions for the currently open file.
     * Returns forgotten notes that are semantically related.
     */
    getContextualSuggestions(currentFile: TFile, count: number = 5): SimilarNote[] {
        if (!this.engine.isReady()) return [];

        const similar = this.engine.findSimilar(currentFile, count * 3);

        // Filter to only notes older than minDaysOld
        return similar
            .filter(s => {
                const daysSince = this.getDaysSinceModified(s.file);
                return daysSince >= this.minDaysOld;
            })
            .slice(0, count);
    }

    /**
     * Fallback: get forgotten notes purely by time decay + orphan status.
     * Used when there are no recent files for context.
     */
    private async getForgottenNotes(count: number): Promise<ResurfacedNote[]> {
        const files = this.app.vault.getMarkdownFiles();
        const scored: ResurfacedNote[] = [];

        for (const file of files) {
            const daysSince = this.getDaysSinceModified(file);
            if (daysSince < this.minDaysOld) continue;

            const backlinks = getBacklinkCount(this.app, file);
            const decay = timeDecayScore(file.stat.mtime);
            const orphan = orphanBoost(backlinks);
            const score = compositeScore(0.3, decay, orphan); // Base relevance of 0.3

            let reason = '';
            if (orphan > 0.5) {
                reason = 'Unlinked note — consider connecting it';
            } else {
                reason = `Not modified in ${Math.round(daysSince)} days`;
            }

            const snippet = await this.getSnippet(file);
            scored.push({ file, score, reason, daysSinceModified: Math.round(daysSince), snippet });
        }

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, count);
    }

    private getDaysSinceModified(file: TFile): number {
        return (Date.now() - file.stat.mtime) / (1000 * 60 * 60 * 24);
    }

    private getRecentlyModifiedFiles(withinDays: number): TFile[] {
        const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
        return this.app.vault.getMarkdownFiles()
            .filter(f => f.stat.mtime > cutoff)
            .sort((a, b) => b.stat.mtime - a.stat.mtime)
            .slice(0, 10); // Cap at 10 most recent
    }

    /**
     * Get a short snippet from a file for preview purposes.
     */
    private async getSnippet(file: TFile, maxLength: number = 120): Promise<string> {
        try {
            const content = await this.app.vault.cachedRead(file);
            // Strip frontmatter
            let body = content.replace(/^---[\s\S]*?---\n?/, '').trim();
            // Strip markdown headers
            body = body.replace(/^#{1,6}\s+/gm, '');
            // Get first meaningful line
            const lines = body.split('\n').filter(l => l.trim().length > 0);
            const firstLine = lines[0] ?? '';

            if (firstLine.length <= maxLength) return firstLine;
            return firstLine.slice(0, maxLength) + '…';
        } catch {
            return '';
        }
    }
}
