/**
 * Hugging Face Model Classifier
 *
 * Maps Hugging Face pipeline tags and model tags to llm-checker canonical categories.
 */

const { toText, regexRules, choosePrimary, CANON } = require('../utils/model-classifier');

// HF pipeline tag to canonical category mappings
const HF_PIPELINE_MAPPINGS = {
    'text-generation': ['chat', 'general'],
    'text-classification': ['general'],
    'token-classification': ['general'],
    'question-answering': ['reasoning', 'chat'],
    'summarization': ['creative', 'general'],
    'translation': ['creative', 'general'],
    'text2text-generation': ['chat', 'creative'],
    'fill-mask': ['general'],
    'feature-extraction': ['embeddings'],
    'text-embeddings': ['embeddings'],
    'image-text-to-text': ['multimodal'],
    'image-to-text': ['multimodal'],
    'text-to-image': ['creative'],
    'automatic-speech-recognition': ['multimodal'],
    'audio-to-audio': ['multimodal'],
    'audio-classification': ['multimodal'],
    'text-to-audio': ['creative'],
    'text-to-speech': ['creative'],
    'image-classification': ['multimodal'],
    'zero-shot-image-classification': ['multimodal'],
    'zero-shot-object-detection': ['multimodal'],
    'object-detection': ['multimodal'],
    'image-segmentation': ['multimodal'],
    'depth-estimation': ['multimodal'],
    'video-classification': ['multimodal'],
    'unconditional-image-generation': ['creative'],
    'text-to-video': ['creative'],
    'image-to-video': ['multimodal'],
    'text-to-3d': ['creative'],
    'image-to-3d': ['multimodal'],
    'reinforcement-learning': ['reasoning'],
    'graph-ml': ['reasoning'],
    'tabular-classification': ['reasoning'],
    'tabular-regression': ['reasoning'],
    'table-question-answering': ['reasoning'],
    'conversational': ['chat'],
    'text-generation-inference': ['chat', 'general'],
    'image-feature-extraction': ['multimodal'],
    'image-to-image': ['creative'],
    'inpainting': ['creative'],
    'image-editing': ['creative'],
    'image-captioning': ['multimodal'],
    'visual-question-answering': ['multimodal'],
    'document-question-answering': ['multimodal']
};

// HF-specific tag mappings
const HF_TAG_MAPPINGS = {
    'code-generation': ['coding'],
    'text-generation': ['chat', 'general'],
    'chat': ['chat'],
    'instruct': ['chat'],
    'conversational': ['chat'],
    'embeddings': ['embeddings'],
    'embedding': ['embeddings'],
    'vision': ['multimodal'],
    'multimodal': ['multimodal'],
    'vision-language': ['multimodal'],
    'vl': ['multimodal'],
    'reasoning': ['reasoning'],
    'math': ['reasoning'],
    'logic': ['reasoning'],
    'creative': ['creative'],
    'writing': ['creative'],
    'summarization': ['creative'],
    'translation': ['creative'],
    'safety': ['safety'],
    'guard': ['safety'],
    'moderation': ['safety']
};

class HFClassifier {
    /**
     * Classify a Hugging Face model
     */
    classify(hfModel) {
        const categories = new Set();

        // Map pipeline tag
        if (hfModel.pipelineTag && HF_PIPELINE_MAPPINGS[hfModel.pipelineTag]) {
            HF_PIPELINE_MAPPINGS[hfModel.pipelineTag].forEach(cat => categories.add(cat));
        }

        // Map model tags
        if (hfModel.tags && Array.isArray(hfModel.tags)) {
            for (const tag of hfModel.tags) {
                const normalizedTag = tag.toLowerCase().trim();
                if (HF_TAG_MAPPINGS[normalizedTag]) {
                    HF_TAG_MAPPINGS[normalizedTag].forEach(cat => categories.add(cat));
                }
            }
        }

        // Apply existing regex rules from model-classifier
        const hay = toText(hfModel);
        const regexCats = regexRules(hay);
        regexCats.forEach(cat => categories.add(cat));

        // Default to general if no categories
        if (categories.size === 0) {
            categories.add('general');
        }

        // Keep only canonical categories
        for (const cat of [...categories]) {
            if (!CANON.includes(cat)) {
                categories.delete(cat);
            }
        }

        // Choose primary category
        const primary = choosePrimary(categories);

        return {
            categories: [...categories].sort(),
            primary_category: primary
        };
    }

    /**
     * Extract family from model ID
     */
    extractFamily(modelId) {
        if (!modelId) return 'unknown';

        // Remove namespace/author
        const parts = modelId.split('/');
        const modelName = parts[parts.length - 1];

        // Extract base family name
        const familyPatterns = [
            /^(llama|mistral|qwen|gemma|phi|yi|deepseek|starcoder|code|granite|solar|minicpm|falcon|mpt|internlm|baichuan|zephyr|openchat|neural|tiny|stable|vicuna|alpaca|wizard|mytho|synthia|airoboros|samantha|tulu|upstage|orca|platypus|nous|cognitive|pythia|redpajama|gpt|opt|bloom|flan|t5|bart|pegasus|roberta|deberta|electra|camembert|xlm|bert|distilbert|albert)/i,
            /^(llama[\d.-]*|mistral[\d.-]*|qwen[\d.-]*|gemma[\d.-]*|phi-?[\d.-]*|yi-?[\d.-]*|deepseek-?[\d.-]*|starcoder[\d.-]*|code[\d.-]*|granite-?[\d.-]*|solar-?[\d.-]*|minicpm-?[\d.-]*|falcon-?[\d.-]*|mpt-?[\d.-]*|internlm-?[\d.-]*|baichuan-?[\d.-]*|zephyr-?[\d.-]*|openchat-?[\d.-]*|neural-?[\d.-]*|tiny-?[\d.-]*|stable-?[\d.-]*|vicuna-?[\d.-]*|alpaca-?[\d.-]*|wizard-?[\d.-]*|mytho-?[\d.-]*|synthia-?[\d.-]*|airoboros-?[\d.-]*|samantha-?[\d.-]*|tulu-?[\d.-]*|upstage-?[\d.-]*|orca-?[\d.-]*|platypus-?[\d.-]*|nous-?[\d.-]*|cognitive-?[\d.-]*|pythia-?[\d.-]*|redpajama-?[\d.-]*|gpt-?[\d.-]*|opt-?[\d.-]*|bloom-?[\d.-]*|flan-?[\d.-]*|t5-?[\d.-]*|bart-?[\d.-]*|pegasus-?[\d.-]*|roberta-?[\d.-]*|deberta-?[\d.-]*|electra-?[\d.-]*|camembert-?[\d.-]*|xlm-?[\d.-]*|bert-?[\d.-]*|distilbert-?[\d.-]*|albert-?[\d.-]*)/i
        ];

        for (const pattern of familyPatterns) {
            const match = modelName.match(pattern);
            if (match) {
                return match[1].toLowerCase();
            }
        }

        return 'unknown';
    }

    /**
     * Extract capabilities from model metadata
     */
    extractCapabilities(hfModel) {
        const capabilities = [];

        if (hfModel.pipelineTag) {
            capabilities.push(hfModel.pipelineTag);
        }

        if (hfModel.tags && Array.isArray(hfModel.tags)) {
            capabilities.push(...hfModel.tags);
        }

        return [...new Set(capabilities)];
    }
}

module.exports = HFClassifier;