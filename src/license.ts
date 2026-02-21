import { requestUrl } from 'obsidian';

export interface LicenseStatus {
    valid: boolean;
    tier: 'free' | 'pro';
    /** Cached timestamp for offline validation */
    lastChecked: number;
}

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * License manager for Vault Recall Pro.
 * Validates license keys against Gumroad's API.
 * Caches results locally for offline use.
 */
export class LicenseManager {
    private status: LicenseStatus = {
        valid: false,
        tier: 'free',
        lastChecked: 0,
    };

    /**
     * Check if the user has an active Pro license.
     */
    isPro(): boolean {
        return this.status.valid && this.status.tier === 'pro';
    }

    /**
     * Get the current license status.
     */
    getStatus(): LicenseStatus {
        return { ...this.status };
    }

    /**
     * Validate a license key.
     * First checks the cache, then validates against the API.
     */
    async validate(key: string | undefined, cachedStatus?: LicenseStatus): Promise<LicenseStatus> {
        // No key = free tier
        if (!key || key.trim().length === 0) {
            this.status = { valid: false, tier: 'free', lastChecked: Date.now() };
            return this.status;
        }

        // Check if cached result is still fresh
        if (cachedStatus && cachedStatus.valid) {
            const age = Date.now() - cachedStatus.lastChecked;
            if (age < CACHE_DURATION_MS) {
                this.status = cachedStatus;
                return this.status;
            }
        }

        // Validate against API
        try {
            const result = await this.validateWithAPI(key);
            this.status = result;
            return result;
        } catch {
            // If API is unreachable, trust the cached result (offline mode)
            if (cachedStatus && cachedStatus.valid) {
                this.status = cachedStatus;
                return this.status;
            }

            // No cache and API failed — stay on free
            this.status = { valid: false, tier: 'free', lastChecked: Date.now() };
            return this.status;
        }
    }

    /**
     * Validate a license key against Gumroad's API.
     *
     * To set this up:
     * 1. Create a product on https://gumroad.com
     * 2. Check "Generate a unique license key per sale"
     * 3. Replace PRODUCT_ID below with your Gumroad product permalink
     * 4. That's it — keys are auto-generated on purchase
     */
    private async validateWithAPI(key: string): Promise<LicenseStatus> {
        const response = await requestUrl({
            url: 'https://api.gumroad.com/v2/licenses/verify',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `product_id=nrwpa&license_key=${encodeURIComponent(key)}`,
        });

        if (response.status === 200) {
            const data = response.json;
            // Gumroad returns success=true for valid keys
            // Also check that the purchase wasn't refunded or chargebacked
            if (data.success && !data.purchase?.refunded && !data.purchase?.chargebacked) {
                return {
                    valid: true,
                    tier: 'pro',
                    lastChecked: Date.now(),
                };
            }
        }

        return {
            valid: false,
            tier: 'free',
            lastChecked: Date.now(),
        };
    }
}

// ── Free tier limits ──────────────────────────────────────

export const FREE_LIMITS = {
    /** Max notes in daily digest */
    maxDigestCount: 3,
    /** Max excluded folders */
    maxExcludedFolders: 2,
    /** Show full health details (issues list) */
    fullHealthDetails: false,
} as const;
