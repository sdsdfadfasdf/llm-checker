/**
 * Hugging Face Hub API Client
 *
 * Provides REST API client for Hugging Face Hub with rate limiting,
 * retry logic, and error handling.
 */

const https = require('https');
const http = require('http');
const TokenBucketRateLimiter = require('../utils/rate-limiter');

class HuggingFaceClient {
    constructor(options = {}) {
        this.baseURL = options.baseURL || 'https://huggingface.co';
        this.apiPath = '/api';
        this.apiToken = options.apiToken || process.env.HUGGINGFACE_TOKEN;
        this.timeout = options.timeout || 30000;
        this.maxRetries = options.maxRetries || 3;

        // Rate limiting: 60 requests/minute unauthenticated, 300 requests/minute authenticated
        const tokensPerMinute = this.apiToken ? 300 : 60;
        this.rateLimiter = new TokenBucketRateLimiter(tokensPerMinute, 60000);

        this.headers = {
            'User-Agent': 'llm-checker/3.5.13',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };

        if (this.apiToken) {
            this.headers['Authorization'] = `Bearer ${this.apiToken}`;
        }
    }

    /**
     * Make a rate-limited API request
     */
    async request(endpoint, options = {}) {
        await this.rateLimiter.waitForToken();

        const url = new URL(this.baseURL + this.apiPath + endpoint);
        const requestOptions = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: options.method || 'GET',
            headers: { ...this.headers, ...options.headers },
            timeout: this.timeout
        };

        if (options.params) {
            url.search = new URLSearchParams(options.params).toString();
            requestOptions.path = url.pathname + url.search;
        }

        return this.makeRequest(requestOptions, options.body);
    }

    /**
     * Make HTTP request with retry logic
     */
    async makeRequest(options, body = null, retryCount = 0) {
        return new Promise((resolve, reject) => {
            const protocol = options.port === 443 ? https : http;
            const timeoutId = setTimeout(() => {
                req.destroy();
                reject(new Error('Request timeout'));
            }, this.timeout);

            const req = protocol.request(options, (res) => {
                clearTimeout(timeoutId);

                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            const contentType = res.headers['content-type'] || '';
                            if (contentType.includes('application/json')) {
                                resolve(JSON.parse(data));
                            } else {
                                resolve(data);
                            }
                        } else if (res.statusCode === 429) {
                            // Rate limited - retry with backoff
                            if (retryCount < this.maxRetries) {
                                const backoffMs = Math.pow(2, retryCount) * 1000;
                                setTimeout(() => {
                                    this.makeRequest(options, body, retryCount + 1)
                                        .then(resolve)
                                        .catch(reject);
                                }, backoffMs);
                            } else {
                                reject(new Error('Rate limit exceeded after retries'));
                            }
                        } else if (res.statusCode >= 300 && res.statusCode < 400) {
                            // Redirect
                            const redirectUrl = res.headers.location;
                            if (redirectUrl) {
                                const redirectOptions = {
                                    ...options,
                                    path: new URL(redirectUrl).pathname + new URL(redirectUrl).search
                                };
                                this.makeRequest(redirectOptions, body, 0)
                                    .then(resolve)
                                    .catch(reject);
                            } else {
                                reject(new Error(`Redirect without location header: ${res.statusCode}`));
                            }
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error.message}`));
                    }
                });

                req.on('error', (error) => {
                    clearTimeout(timeoutId);
                    if (retryCount < this.maxRetries) {
                        const backoffMs = Math.pow(2, retryCount) * 1000;
                        setTimeout(() => {
                            this.makeRequest(options, body, retryCount + 1)
                                .then(resolve)
                                .catch(reject);
                        }, backoffMs);
                    } else {
                        reject(new Error(`Request failed after retries: ${error.message}`));
                    }
                });

                if (body) {
                    req.write(JSON.stringify(body));
                }

                req.end();
            });
        });
    }

    /**
     * List models with pagination
     */
    async listModels(options = {}) {
        const params = {
            limit: options.limit || 100,
            sort: options.sort || 'downloads',
            direction: options.direction || 'desc',
            cardData: options.cardData !== false,
            full: options.full || false
        };

        if (options.filter) {
            params.filter = options.filter;
        }

        return this.request('/models', { params });
    }

    /**
     * Get model details
     */
    async getModel(modelId) {
        return this.request(`/models/${encodeURIComponent(modelId)}`);
    }

    /**
     * Get model siblings (files/variants)
     */
    async getModelSiblings(modelId) {
        try {
            const model = await this.getModel(modelId);
            return model.siblings || [];
        } catch (error) {
            console.warn(`Error fetching siblings for ${modelId}: ${error.message}`);
            return [];
        }
    }

    /**
     * Get model card
     */
    async getModelCard(modelId) {
        try {
            return this.request(`/models/${encodeURIComponent(modelId)}/card`);
        } catch (error) {
            console.warn(`Error fetching card for ${modelId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Search models
     */
    async searchModels(query, options = {}) {
        const params = {
            q: query,
            limit: options.limit || 50
        };

        return this.request('/models', { params });
    }

    /**
     * Get available rate limit tokens
     */
    getAvailableTokens() {
        return this.rateLimiter.getAvailableTokens();
    }

    /**
     * Reset rate limiter
     */
    resetRateLimiter() {
        this.rateLimiter.reset();
    }
}

module.exports = HuggingFaceClient;