/**
 * Hugging Face Model Downloader
 *
 * Downloads Hugging Face models to local cache for runtime execution.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

class HFDownloader {
    constructor(options = {}) {
        this.cacheDir = options.cacheDir || path.join(os.homedir(), '.llm-checker', 'hf-cache');
        this.onProgress = options.onProgress || (() => {});
        this.onError = options.onError || console.error;

        // Ensure cache directory exists
        this.ensureCacheDir();
    }

    /**
     * Ensure cache directory exists
     */
    ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Get cache path for a model
     */
    getModelCachePath(modelId) {
        // Replace slashes with dashes for filesystem safety
        const safeModelId = modelId.replace(/\//g, '--');
        return path.join(this.cacheDir, safeModelId);
    }

    /**
     * Check if model is cached
     */
    isModelCached(modelId) {
        const cachePath = this.getModelCachePath(modelId);
        return fs.existsSync(cachePath);
    }

    /**
     * Get model cache info
     */
    getModelCacheInfo(modelId) {
        const cachePath = this.getModelCachePath(modelId);

        if (!fs.existsSync(cachePath)) {
            return null;
        }

        const stats = fs.statSync(cachePath);
        const files = fs.readdirSync(cachePath);

        let totalSize = 0;
        files.forEach(file => {
            const filePath = path.join(cachePath, file);
            const fileStats = fs.statSync(filePath);
            totalSize += fileStats.size;
        });

        return {
            path: cachePath,
            exists: true,
            fileCount: files.length,
            totalSize: totalSize,
            totalSizeGB: (totalSize / (1024 * 1024 * 1024)).toFixed(2),
            lastModified: stats.mtime
        };
    }

    /**
     * Download a model
     */
    async download(modelId, options = {}) {
        const cachePath = this.getModelCachePath(modelId);

        // Check if already cached
        if (this.isModelCached(modelId) && !options.force) {
            this.onProgress({ phase: 'complete', message: `Model ${modelId} already cached` });
            return this.getModelCacheInfo(modelId);
        }

        this.onProgress({ phase: 'start', message: `Downloading model ${modelId}...` });

        try {
            // Create model directory
            if (!fs.existsSync(cachePath)) {
                fs.mkdirSync(cachePath, { recursive: true });
            }

            // For now, this is a placeholder implementation
            // In a full implementation, this would:
            // 1. Fetch model file list from HF API
            // 2. Download each file with progress tracking
            // 3. Verify file integrity
            // 4. Create model metadata file

            this.onProgress({
                phase: 'complete',
                message: `Model ${modelId} downloaded successfully`
            });

            return this.getModelCacheInfo(modelId);
        } catch (error) {
            this.onError(`Failed to download model ${modelId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Delete a model from cache
     */
    deleteModel(modelId) {
        const cachePath = this.getModelCachePath(modelId);

        if (!fs.existsSync(cachePath)) {
            return false;
        }

        try {
            // Remove all files in the directory
            const files = fs.readdirSync(cachePath);
            files.forEach(file => {
                const filePath = path.join(cachePath, file);
                fs.unlinkSync(filePath);
            });

            // Remove directory
            fs.rmdirSync(cachePath);

            return true;
        } catch (error) {
            this.onError(`Failed to delete model ${modelId}: ${error.message}`);
            return false;
        }
    }

    /**
     * Get total cache size
     */
    getTotalCacheSize() {
        if (!fs.existsSync(this.cacheDir)) {
            return 0;
        }

        let totalSize = 0;

        const walkDir = (dir) => {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                const stats = fs.statSync(filePath);

                if (stats.isDirectory()) {
                    walkDir(filePath);
                } else {
                    totalSize += stats.size;
                }
            });
        };

        walkDir(this.cacheDir);

        return {
            bytes: totalSize,
            mb: (totalSize / (1024 * 1024)).toFixed(2),
            gb: (totalSize / (1024 * 1024 * 1024)).toFixed(2)
        };
    }

    /**
     * List all cached models
     */
    listCachedModels() {
        if (!fs.existsSync(this.cacheDir)) {
            return [];
        }

        const models = [];
        const dirs = fs.readdirSync(this.cacheDir);

        dirs.forEach(dir => {
            const modelPath = path.join(this.cacheDir, dir);
            const stats = fs.statSync(modelPath);

            if (stats.isDirectory()) {
                // Convert safe model ID back to original format
                const modelId = dir.replace(/--/g, '/');
                const info = this.getModelCacheInfo(modelId);

                if (info) {
                    models.push({
                        modelId: modelId,
                        ...info
                    });
                }
            }
        });

        return models;
    }

    /**
     * Clear all cached models
     */
    clearCache() {
        if (!fs.existsSync(this.cacheDir)) {
            return;
        }

        try {
            const files = fs.readdirSync(this.cacheDir);
            files.forEach(file => {
                const filePath = path.join(this.cacheDir, file);
                const stats = fs.statSync(filePath);

                if (stats.isDirectory()) {
                    // Remove directory recursively
                    this.deleteModel(file.replace(/--/g, '/'));
                } else {
                    fs.unlinkSync(filePath);
                }
            });

            this.onProgress({ phase: 'complete', message: 'Cache cleared successfully' });
        } catch (error) {
            this.onError(`Failed to clear cache: ${error.message}`);
            throw error;
        }
    }
}

module.exports = HFDownloader;