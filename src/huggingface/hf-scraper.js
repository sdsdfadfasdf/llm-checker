/**
 * Hugging Face Model Scraper
 *
 * Scrapes Hugging Face Hub for model information following Ollama scraper patterns.
 */

const HuggingFaceClient = require('./hf-client');
const HFNormalizer = require('./hf-normalizer');
const HFClassifier = require('./hf-classifier');

class HuggingFaceScraper {
    constructor(options = {}) {
        this.client = new HuggingFaceClient({
            apiToken: options.apiToken || process.env.HUGGINGFACE_TOKEN,
            timeout: options.timeout || 30000,
            maxRetries: options.maxRetries || 3
        });

        this.normalizer = new HFNormalizer();
        this.classifier = new HFClassifier();

        this.concurrency = options.concurrency || 3;
        this.rateLimitMs = options.rateLimitMs || 1000;

        this.onProgress = options.onProgress || (() => {});
        this.onError = options.onError || console.error;

        // Quality filters
        this.minDownloads = options.minDownloads || 1000;
        this.minLikes = options.minLikes || 10;
        this.maxModels = options.maxModels || 10000;

        // Relevant pipeline tags for filtering
        this.relevantPipelines = [
            'text-generation',
            'text-classification',
            'question-answering',
            'summarization',
            'translation',
            'text2text-generation',
            'feature-extraction',
            'text-embeddings',
            'image-text-to-text',
            'image-to-text',
            'conversational',
            'text-generation-inference',
            'code-generation'
        ];
    }

    /**
     * Scrape all HF models
     */
    async scrapeAll(onModelComplete = null) {
        const startTime = Date.now();

        this.onProgress({ phase: 'start', message: 'Fetching Hugging Face model list...' });

        // Step 1: Get list of models with pagination
        const modelList = await this.fetchModelList();

        this.onProgress({
            phase: 'list',
            message: `Found ${modelList.length} models, filtering by quality...`
        });

        // Step 2: Filter by quality
        const qualityModels = this.filterByQuality(modelList);

        this.onProgress({
            phase: 'filter',
            message: `Filtered to ${qualityModels.length} quality models`
        });

        // Step 3: Process models in batches
        const allModels = [];
        const allVariants = [];

        for (let i = 0; i < qualityModels.length; i += this.concurrency) {
            const batch = qualityModels.slice(i, i + this.concurrency);

            const batchPromises = batch.map(async (hfModel) => {
                try {
                    // Get detailed model info
                    const detailedModel = await this.fetchModelDetails(hfModel.modelId);

                    // Get model siblings (files/variants)
                    const siblings = await this.fetchModelSiblings(hfModel.modelId);

                    // Normalize to llm-checker format
                    const normalizedModel = this.normalizer.normalizeModel(detailedModel);

                    // Extract variants
                    const variants = await this.normalizer.extractVariants(hfModel.modelId, siblings);

                    return {
                        model: normalizedModel,
                        variants
                    };
                } catch (error) {
                    this.onError(`Error processing ${hfModel.modelId}: ${error.message}`);
                    return null;
                }
            });

            const batchResults = await Promise.all(batchPromises);

            for (const result of batchResults) {
                if (result) {
                    allModels.push(result.model);
                    allVariants.push(...result.variants);

                    if (onModelComplete) {
                        onModelComplete(result.model, result.variants);
                    }
                }
            }

            this.onProgress({
                phase: 'details',
                message: `Processed ${Math.min(i + this.concurrency, qualityModels.length)}/${qualityModels.length} models`,
                current: Math.min(i + this.concurrency, qualityModels.length),
                total: qualityModels.length
            });

            // Rate limiting between batches
            if (i + this.concurrency < qualityModels.length) {
                await this.sleep(this.rateLimitMs * 2);
            }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        this.onProgress({
            phase: 'complete',
            message: `Scraped ${allModels.length} HF models with ${allVariants.length} variants in ${elapsed}s`
        });

        return {
            models: allModels,
            variants: allVariants,
            stats: {
                modelCount: allModels.length,
                variantCount: allVariants.length,
                elapsedSeconds: parseFloat(elapsed)
            }
        };
    }

    /**
     * Fetch model list with pagination
     */
    async fetchModelList() {
        const allModels = [];
        let hasMore = true;
        let limit = 100;

        while (hasMore && allModels.length < this.maxModels) {
            try {
                const response = await this.client.listModels({
                    limit,
                    sort: 'downloads',
                    direction: 'desc',
                    cardData: false
                });

                if (response.models && Array.isArray(response.models)) {
                    allModels.push(...response.models);
                    hasMore = response.models.length === limit;
                } else {
                    hasMore = false;
                }

                // Rate limiting between pages
                if (hasMore) {
                    await this.sleep(this.rateLimitMs);
                }
            } catch (error) {
                this.onError(`Error fetching model list: ${error.message}`);
                hasMore = false;
            }
        }

        return allModels;
    }

    /**
     * Fetch model details
     */
    async fetchModelDetails(modelId) {
        try {
            return await this.client.getModel(modelId);
        } catch (error) {
            this.onError(`Error fetching details for ${modelId}: ${error.message}`);
            // Return minimal model info on error
            return {
                modelId: modelId,
                downloads: 0,
                likes: 0,
                tags: [],
                pipelineTag: null,
                lastModified: null,
                cardData: {}
            };
        }
    }

    /**
     * Fetch model siblings (files/variants)
     */
    async fetchModelSiblings(modelId) {
        try {
            return await this.client.getModelSiblings(modelId);
        } catch (error) {
            this.onError(`Error fetching siblings for ${modelId}: ${error.message}`);
            return [];
        }
    }

    /**
     * Filter models by quality
     */
    filterByQuality(models) {
        return models.filter(model => {
            // Filter by downloads
            if (model.downloads && model.downloads < this.minDownloads) {
                return false;
            }

            // Filter by likes
            if (model.likes && model.likes < this.minLikes) {
                return false;
            }

            // Filter by pipeline tag (only include relevant ones)
            if (model.pipelineTag && !this.relevantPipelines.includes(model.pipelineTag)) {
                return false;
            }

            return true;
        });
    }

    /**
     * Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = HuggingFaceScraper;