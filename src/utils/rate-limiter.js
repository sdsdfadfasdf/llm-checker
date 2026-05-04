/**
 * Token Bucket Rate Limiter
 *
 * Implements the token bucket algorithm for smooth rate limiting.
 * This is used to respect API rate limits (e.g., Hugging Face: 60 req/min unauthenticated).
 */

class TokenBucketRateLimiter {
    constructor(tokensPerInterval, intervalMs) {
        this.capacity = tokensPerInterval;
        this.tokens = tokensPerInterval;
        this.interval = intervalMs;
        this.lastRefill = Date.now();
    }

    /**
     * Refill tokens based on elapsed time
     */
    refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;

        if (elapsed >= this.interval) {
            const intervals = Math.floor(elapsed / this.interval);
            const tokensToAdd = intervals * this.capacity;

            this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }

    /**
     * Wait for a token to be available
     * Returns immediately if a token is available, otherwise waits until one is available
     */
    async waitForToken() {
        this.refill();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return;
        }

        // Calculate time until next refill
        const now = Date.now();
        const timeUntilRefill = this.interval - (now - this.lastRefill);

        if (timeUntilRefill > 0) {
            await new Promise(resolve => setTimeout(resolve, timeUntilRefill));
            this.refill();
            this.tokens -= 1;
        }
    }

    /**
     * Check if a token is available without waiting
     */
    tryConsumeToken() {
        this.refill();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }

        return false;
    }

    /**
     * Get current token count
     */
    getAvailableTokens() {
        this.refill();
        return this.tokens;
    }

    /**
     * Reset the rate limiter
     */
    reset() {
        this.tokens = this.capacity;
        this.lastRefill = Date.now();
    }
}

module.exports = TokenBucketRateLimiter;