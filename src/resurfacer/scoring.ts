import { TFile, App } from 'obsidian';

/**
 * Scoring functions for the smart resurfacer.
 * Combines relevance, time decay, and orphan status into a composite score.
 */

/**
 * Normalize a similarity value to 0-1 range.
 */
export function relevanceScore(similarity: number): number {
    return Math.min(Math.max(similarity, 0), 1);
}

/**
 * Time decay score: notes not modified for longer get higher scores.
 * Uses an exponential decay curve that plateaus.
 * - Modified today: ~0.0
 * - Modified 7 days ago: ~0.5
 * - Modified 30 days ago: ~0.85
 * - Modified 90+ days ago: ~0.95+
 */
export function timeDecayScore(lastModifiedMs: number): number {
    const now = Date.now();
    const daysSinceModified = (now - lastModifiedMs) / (1000 * 60 * 60 * 24);

    // Exponential decay: 1 - e^(-days/20)
    // 20 is the half-life in days (tune as needed)
    return 1 - Math.exp(-daysSinceModified / 20);
}

/**
 * Orphan boost: notes with fewer backlinks get a small boost.
 * Orphans (0 links) get full boost, well-connected notes get none.
 */
export function orphanBoost(backlinkCount: number): number {
    if (backlinkCount === 0) return 1.0;
    if (backlinkCount === 1) return 0.5;
    if (backlinkCount <= 3) return 0.2;
    return 0;
}

/**
 * Get the number of backlinks for a file using Obsidian's metadata cache.
 * Uses resolvedLinks to count how many other files link to this file.
 */
export function getBacklinkCount(app: App, file: TFile): number {
    // resolvedLinks is Record<sourcePath, Record<targetPath, linkCount>>
    const resolvedLinks = app.metadataCache.resolvedLinks;
    let count = 0;

    for (const sourcePath in resolvedLinks) {
        const targets = resolvedLinks[sourcePath];
        if (targets && file.path in targets) {
            count++;
        }
    }

    return count;
}

/**
 * Composite score combining relevance, time decay, and orphan status.
 * Weights can be tuned to prioritize different factors.
 */
export function compositeScore(
    relevance: number,
    decay: number,
    orphan: number,
    weights = { relevance: 0.5, decay: 0.35, orphan: 0.15 }
): number {
    return (
        relevance * weights.relevance +
        decay * weights.decay +
        orphan * weights.orphan
    );
}
