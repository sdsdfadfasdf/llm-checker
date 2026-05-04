/**
 * Hugging Face Model Normalizer
 *
 * Converts Hugging Face API responses to llm-checker model format.
 */

const HFClassifier = require('./hf-classifier');

class HFNormalizer {
    constructor() {
        this.classifier = new HFClassifier();
    }

    /**
     * Normalize a Hugging Face model to llm-checker format
     */
    normalizeModel(hfModel) {
        const classification = this.classifier.classify(hfModel);
        const family = this.classifier.extractFamily(hfModel.modelId);
        const capabilities = this.classifier.extractCapabilities(hfModel);

        return {
            id: hfModel.modelId,
            model_identifier: hfModel.modelId,
            model_name: hfModel.modelId,
            name: hfModel.modelId,
            displayName: this.extractDisplayName(hfModel.modelId),
            family: family,
            type: this.determineType(hfModel),
            description: hfModel.cardData?.description || '',
            capabilities: capabilities,
            categories: classification.categories,
            primary_category: classification.primary_category,
            pulls: hfModel.downloads || 0,
            tags_count: hfModel.tags?.length || 0,
            namespace: hfModel.author || '',
            url: `https://huggingface.co/${hfModel.modelId}`,
            last_updated: hfModel.lastModified || '',
            source: 'huggingface',
            registry: 'huggingface.co',
            // HF-specific fields
            hf_model_id: hfModel.modelId,
            hf_author: hfModel.author || '',
            hf_likes: hfModel.likes || 0,
            hf_downloads: hfModel.downloads || 0,
            hf_pipeline_tag: hfModel.pipelineTag || '',
            // Additional metadata
            library_name: hfModel.cardData?.library_name || '',
            license: hfModel.cardData?.license || '',
            languages: hfModel.cardData?.languages || [],
            datasets: hfModel.cardData?.datasets || [],
            tags: hfModel.tags || []
        };
    }

    /**
     * Extract display name from model ID
     */
    extractDisplayName(modelId) {
        if (!modelId) return 'Unknown Model';

        const parts = modelId.split('/');
        const modelName = parts[parts.length - 1];

        // Convert to title case
        return modelName
            .split(/[-_]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Determine model type (official vs community)
     */
    determineType(hfModel) {
        const officialAuthors = [
            'meta-llama',
            'mistralai',
            'google',
            'microsoft',
            'openai',
            'anthropic',
            'nvidia',
            'facebook',
            'bigscience'
        ];

        if (hfModel.author && officialAuthors.includes(hfModel.author.toLowerCase())) {
            return 'official';
        }

        return 'community';
    }

    /**
     * Extract variants from model siblings
     */
    async extractVariants(modelId, siblings) {
        const variants = [];

        if (!siblings || !Array.isArray(siblings)) {
            return variants;
        }

        for (const sibling of siblings) {
            if (this.isModelFile(sibling.rfilename)) {
                const variant = {
                    model_id: modelId,
                    tag: this.extractTag(sibling.rfilename),
                    params_b: this.extractParams(sibling.rfilename),
                    quant: this.extractQuantization(sibling.rfilename),
                    size_gb: this.bytesToGB(sibling.size),
                    context_length: this.extractContextLength(sibling.rfilename),
                    input_types: this.extractInputTypes(sibling.rfilename),
                    is_moe: this.isMoE(sibling.rfilename),
                    expert_count: this.extractExpertCount(sibling.rfilename),
                    format: this.extractFormat(sibling.rfilename)
                };

                variants.push(variant);
            }
        }

        return variants;
    }

    /**
     * Check if file is a model file
     */
    isModelFile(filename) {
        const modelExtensions = [
            '.safetensors',
            '.gguf',
            '.bin',
            '.pt',
            '.pth',
            '.onnx'
        ];

        return modelExtensions.some(ext => filename.endsWith(ext));
    }

    /**
     * Extract tag from filename
     */
    extractTag(filename) {
        // Remove extension
        const name = filename.replace(/\.(safetensors|gguf|bin|pt|pth|onnx)$/, '');

        // Extract tag (usually the last part before extension)
        const parts = name.split(/[-_]/);
        return parts[parts.length - 1] || 'default';
    }

    /**
     * Extract parameter count from filename
     */
    extractParams(filename) {
        // Look for patterns like "7b", "13b", "70b"
        const match = filename.match(/(\d+\.?\d*)\s*[bB]/i);
        if (match) {
            const value = parseFloat(match[1]);
            return value; // Return in billions
        }

        return null;
    }

    /**
     * Extract quantization from filename
     */
    extractQuantization(filename) {
        const quantPatterns = [
            { pattern: /q8[_-]?0/i, quant: 'Q8_0' },
            { pattern: /q6[_-]?k/i, quant: 'Q6_K' },
            { pattern: /q5[_-]?k[_-]?m/i, quant: 'Q5_K_M' },
            { pattern: /q5[_-]?k[_-]?s/i, quant: 'Q5_K_S' },
            { pattern: /q4[_-]?k[_-]?m/i, quant: 'Q4_K_M' },
            { pattern: /q4[_-]?0/i, quant: 'Q4_0' },
            { pattern: /fp16/i, quant: 'FP16' },
            { pattern: /fp32/i, quant: 'FP32' },
            { pattern: /bf16/i, quant: 'BF16' },
            { pattern: /iq4[_-]?nl/i, quant: 'IQ4_NL' },
            { pattern: /int8/i, quant: 'INT8' },
            { pattern: /int4/i, quant: 'INT4' }
        ];

        for (const { pattern, quant } of quantPatterns) {
            if (pattern.test(filename)) {
                return quant;
            }
        }

        return null;
    }

    /**
     * Extract context length from filename
     */
    extractContextLength(filename) {
        // Look for patterns like "32k", "128k", "4k"
        const match = filename.match(/(\d+)\s*[kK]/);
        if (match) {
            return parseInt(match[1]) * 1024;
        }

        // Default context length
        return 4096;
    }

    /**
     * Extract input types from filename
     */
    extractInputTypes(filename) {
        const inputTypes = ['text'];

        if (filename.includes('vision') || filename.includes('vl') || filename.includes('multimodal')) {
            inputTypes.push('image');
        }

        if (filename.includes('audio') || filename.includes('speech')) {
            inputTypes.push('audio');
        }

        return inputTypes;
    }

    /**
     * Check if model is MoE
     */
    isMoE(filename) {
        return filename.includes('moe') || filename.includes('mixture') || filename.includes('expert');
    }

    /**
     * Extract expert count for MoE models
     */
    extractExpertCount(filename) {
        if (!this.isMoE(filename)) {
            return null;
        }

        // Look for patterns like "8x7b" (8 experts, 7B each)
        const match = filename.match(/(\d+)x(\d+\.?\d*)\s*[bB]/i);
        if (match) {
            return parseInt(match[1]);
        }

        return null;
    }

    /**
     * Extract format from filename
     */
    extractFormat(filename) {
        if (filename.endsWith('.safetensors')) {
            return 'safetensors';
        } else if (filename.endsWith('.gguf')) {
            return 'gguf';
        } else if (filename.endsWith('.bin')) {
            return 'pytorch';
        } else if (filename.endsWith('.pt') || filename.endsWith('.pth')) {
            return 'pytorch';
        } else if (filename.endsWith('.onnx')) {
            return 'onnx';
        }

        return 'unknown';
    }

    /**
     * Convert bytes to GB
     */
    bytesToGB(bytes) {
        if (!bytes || bytes === 0) return 0;
        return Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
    }

    /**
     * Estimate model size from parameters and quantization
     */
    estimateSize(paramsB, quant) {
        if (!paramsB) return 0;

        const bytesPerParam = {
            'FP32': 4,
            'FP16': 2,
            'BF16': 2,
            'Q8_0': 1,
            'Q6_K': 0.75,
            'Q5_K_M': 0.625,
            'Q4_K_M': 0.5,
            'Q3_K_M': 0.4,
            'Q2_K': 0.3,
            'IQ4_NL': 0.5,
            'INT8': 1,
            'INT4': 0.5
        };

        const bpp = bytesPerParam[quant] || 0.5;
        return Math.round(paramsB * bpp * 10) / 10; // GB, rounded to 1 decimal
    }
}

module.exports = HFNormalizer;