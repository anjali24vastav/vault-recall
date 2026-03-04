import { App } from 'obsidian';

export interface ReviewEntry {
    /** File path */
    path: string;
    /** Number of times reviewed */
    reviewCount: number;
    /** Timestamp of last review */
    lastReviewedAt: number;
    /** Next scheduled review timestamp */
    nextReviewAt: number;
    /** Was the last interaction a skip? */
    skipped: boolean;
}

export interface ReviewHistory {
    entries: Record<string, ReviewEntry>;
    /** Current streak (consecutive days with at least 1 review) */
    streak: number;
    /** Last date a review was completed (YYYY-MM-DD) */
    lastStreakDate: string;
}

/** Spaced repetition intervals in days */
const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60, 90];
const SKIP_INTERVAL = 1; // Skipped notes come back tomorrow

/**
 * ReviewManager implements spaced repetition for vault notes.
 * Tracks review history, calculates next review dates, and maintains streaks.
 */
export class ReviewManager {
    private app: App;
    private dataDir: string;
    private history: ReviewHistory = {
        entries: {},
        streak: 0,
        lastStreakDate: '',
    };
    private loaded = false;

    constructor(app: App, dataDir: string) {
        this.app = app;
        this.dataDir = dataDir;
    }

    // ── Public API ───────────────────────────────────────────

    /**
     * Mark a note as reviewed. Advances it to the next spaced repetition interval.
     */
    async markReviewed(path: string): Promise<void> {
        const now = Date.now();
        const existing = this.history.entries[path];
        const reviewCount = (existing?.reviewCount ?? 0) + 1;

        // Next interval based on review count
        const intervalIndex = Math.min(reviewCount - 1, REVIEW_INTERVALS.length - 1);
        const intervalDays = REVIEW_INTERVALS[intervalIndex]!;
        const nextReviewAt = now + intervalDays * 24 * 60 * 60 * 1000;

        this.history.entries[path] = {
            path,
            reviewCount,
            lastReviewedAt: now,
            nextReviewAt,
            skipped: false,
        };

        this.updateStreak();
        await this.save();
    }

    /**
     * Mark a note as skipped. It will come back sooner (next day).
     */
    async markSkipped(path: string): Promise<void> {
        const now = Date.now();
        const existing = this.history.entries[path];

        this.history.entries[path] = {
            path,
            reviewCount: existing?.reviewCount ?? 0,
            lastReviewedAt: now,
            nextReviewAt: now + SKIP_INTERVAL * 24 * 60 * 60 * 1000,
            skipped: true,
        };

        await this.save();
    }

    /**
     * Get notes that are due for review (next review date is in the past).
     */
    getDueForReview(): ReviewEntry[] {
        const now = Date.now();
        const due: ReviewEntry[] = [];

        for (const entry of Object.values(this.history.entries)) {
            if (entry.nextReviewAt <= now) {
                due.push(entry);
            }
        }

        // Sort: skipped notes first, then by how overdue they are
        due.sort((a, b) => {
            if (a.skipped && !b.skipped) return -1;
            if (!a.skipped && b.skipped) return 1;
            return a.nextReviewAt - b.nextReviewAt;
        });

        return due;
    }

    /**
     * Check if a note has been reviewed before.
     */
    hasBeenReviewed(path: string): boolean {
        return path in this.history.entries;
    }

    /**
     * Get the review entry for a specific note.
     */
    getEntry(path: string): ReviewEntry | undefined {
        return this.history.entries[path];
    }

    /**
     * Get the current review streak.
     */
    getStreak(): number {
        return this.history.streak;
    }

    /**
     * Get total number of reviews completed.
     */
    getTotalReviews(): number {
        let total = 0;
        for (const entry of Object.values(this.history.entries)) {
            total += entry.reviewCount;
        }
        return total;
    }

    /**
     * Remove a note from review history (e.g., when file is deleted).
     */
    async removeNote(path: string): Promise<void> {
        delete this.history.entries[path];
        await this.save();
    }

    // ── Streak Management ────────────────────────────────────

    private updateStreak(): void {
        const today = this.getDateString(new Date());
        const yesterday = this.getDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

        if (this.history.lastStreakDate === today) {
            // Already reviewed today, streak unchanged
            return;
        }

        if (this.history.lastStreakDate === yesterday) {
            // Consecutive day — increment streak
            this.history.streak += 1;
        } else {
            // Streak broken — reset to 1
            this.history.streak = 1;
        }

        this.history.lastStreakDate = today;
    }

    private getDateString(date: Date): string {
        return date.toISOString().split('T')[0]!;
    }

    // ── Persistence ──────────────────────────────────────────

    async load(): Promise<void> {
        const path = `${this.dataDir}/review-history.json`;
        try {
            if (await this.app.vault.adapter.exists(path)) {
                const raw = await this.app.vault.adapter.read(path);
                const data = JSON.parse(raw);
                this.history = {
                    entries: data.entries ?? {},
                    streak: data.streak ?? 0,
                    lastStreakDate: data.lastStreakDate ?? '',
                };
            }
        } catch {
            // Start fresh if corrupted
            this.history = { entries: {}, streak: 0, lastStreakDate: '' };
        }
        this.loaded = true;
    }

    async save(): Promise<void> {
        const path = `${this.dataDir}/review-history.json`;
        const json = JSON.stringify(this.history);

        if (!(await this.app.vault.adapter.exists(this.dataDir))) {
            await this.app.vault.adapter.mkdir(this.dataDir);
        }
        await this.app.vault.adapter.write(path, json);
    }

    isLoaded(): boolean {
        return this.loaded;
    }
}
