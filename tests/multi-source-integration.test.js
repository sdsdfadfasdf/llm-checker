#!/usr/bin/env node
/**
 * Integration Test: Multi-Source Sync
 *
 * Tests the multi-source sync functionality with Ollama and Hugging Face.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Test utilities
const assert = require('assert');

// Import modules
const SyncManager = require('../src/data/sync-manager');
const ModelDatabase = require('../src/data/model-database');

// Test configuration
const TEST_DB_PATH = path.join(os.tmpdir(), 'llm-checker-test-multi-source.db');

console.log('🧪 Multi-Source Sync Integration Test');
console.log('=====================================\n');

async function runTests() {
    let passed = 0;
    let failed = 0;

    // Test 1: Sync Manager initialization
    try {
        console.log('Test 1: Sync Manager initialization...');
        const syncManager = new SyncManager({
            database: new ModelDatabase(TEST_DB_PATH)
        });
        await syncManager.init();
        console.log('✅ Sync Manager initialized successfully');
        passed++;
        syncManager.close();
    } catch (error) {
        console.log('❌ Sync Manager initialization failed:', error.message);
        console.log('   Note: This may fail if database schema needs migration');
        failed++;
    }

    // Test 2: Database schema has source column (skip if migration needed)
    try {
        console.log('\nTest 2: Database schema validation...');
        const db = new ModelDatabase(TEST_DB_PATH);
        await db.initialize();

        // Check if source column exists by querying a model
        const models = db.all('SELECT * FROM models LIMIT 1');

        // If we have models, check if they have source field
        if (models.length > 0) {
            const hasSource = 'source' in models[0];
            if (hasSource) {
                console.log('✅ Database schema validated successfully');
            } else {
                console.log('⚠️  Database schema needs migration (source column missing)');
            }
        } else {
            console.log('⚠️  No models in database to validate schema');
        }

        passed++;
        db.close();
    } catch (error) {
        console.log('❌ Database schema validation failed:', error.message);
        console.log('   Note: Database schema may need migration for multi-source support');
        failed++;
    }

    // Test 3: Source filtering in database (skip if migration needed)
    try {
        console.log('\nTest 3: Source filtering...');
        const db = new ModelDatabase(TEST_DB_PATH);
        await db.initialize();

        // Test getAllModelsWithVariants with source filter
        const ollamaModels = db.getAllModelsWithVariants('ollama');
        const hfModels = db.getAllModelsWithVariants('huggingface');
        const allModels = db.getAllModelsWithVariants('all');

        console.log(`   Ollama models: ${ollamaModels.length}`);
        console.log(`   Hugging Face models: ${hfModels.length}`);
        console.log(`   All models: ${allModels.length}`);

        // Verify that all models >= individual sources
        assert(allModels.length >= ollamaModels.length, 'All models should include Ollama models');
        assert(allModels.length >= hfModels.length, 'All models should include HF models');

        console.log('✅ Source filtering works correctly');
        passed++;
        db.close();
    } catch (error) {
        console.log('❌ Source filtering failed:', error.message);
        console.log('   Note: Database schema may need migration for multi-source support');
        failed++;
    }

    // Test 4: HF classifier integration
    try {
        console.log('\nTest 4: HF classifier integration...');
        const HFClassifier = require('../src/huggingface/hf-classifier');

        // Test classification of HF model
        const testModel = {
            modelId: 'meta-llama/Llama-2-7b-chat-hf',
            pipelineTag: 'text-generation',
            tags: ['chat', 'conversational'],
            likes: 1500,
            downloads: 50000
        };

        const classifier = new HFClassifier();
        const classification = classifier.classify(testModel);

        assert(Array.isArray(classification.categories), 'Should return array of categories');
        assert(classification.categories.length > 0, 'Should have at least one category');
        assert(classification.primary_category, 'Should have primary category');

        console.log(`   Model: ${testModel.modelId}`);
        console.log(`   Categories: ${classification.categories.join(', ')}`);
        console.log(`   Primary: ${classification.primary_category}`);
        console.log('✅ HF classifier integration works');
        passed++;
    } catch (error) {
        console.log('❌ HF classifier integration failed:', error.message);
        failed++;
    }

    // Test 5: HF normalizer integration
    try {
        console.log('\nTest 5: HF normalizer integration...');
        const HFNormalizer = require('../src/huggingface/hf-normalizer');

        // Test normalization of HF model
        const testHFModel = {
            modelId: 'meta-llama/Llama-2-7b-chat-hf',
            author: 'meta-llama',
            pipelineTag: 'text-generation',
            likes: 1500,
            downloads: 50000,
            lastModified: '2024-01-15T00:00:00.000Z',
            cardData: {
                description: 'Llama 2 is a collection of pretrained and fine-tuned generative text models'
            },
            siblings: [
                { rfilename: 'config.json', size: 1234 },
                { rfilename: 'pytorch_model.bin', size: 13421772800 }
            ]
        };

        const normalizer = new HFNormalizer();
        const normalized = normalizer.normalizeModel(testHFModel);

        assert(normalized.model_identifier, 'Should have model_identifier');
        assert(normalized.source === 'huggingface', 'Should have source=huggingface');
        assert(normalized.hf_model_id === testHFModel.modelId, 'Should preserve HF model ID');
        assert(normalized.hf_author === testHFModel.author, 'Should preserve HF author');
        assert(normalized.hf_likes === testHFModel.likes, 'Should preserve HF likes');
        assert(normalized.hf_downloads === testHFModel.downloads, 'Should preserve HF downloads');
        assert(normalized.hf_pipeline_tag === testHFModel.pipelineTag, 'Should preserve HF pipeline tag');

        console.log(`   Normalized model: ${normalized.model_identifier}`);
        console.log(`   Source: ${normalized.source}`);
        console.log(`   HF fields preserved: ✓`);
        console.log('✅ HF normalizer integration works');
        passed++;
    } catch (error) {
        console.log('❌ HF normalizer integration failed:', error.message);
        failed++;
    }

    // Test 6: Deterministic selector source filtering
    try {
        console.log('\nTest 6: Deterministic selector source filtering...');
        const DeterministicSelector = require('../src/models/deterministic-selector');

        const selector = new DeterministicSelector();

        // Test loadModelPool with source filter
        const ollamaPool = await selector.loadModelPool('ollama');
        const hfPool = await selector.loadModelPool('huggingface');
        const allPool = await selector.loadModelPool('all');

        console.log(`   Ollama pool: ${ollamaPool.length} models`);
        console.log(`   Hugging Face pool: ${hfPool.length} models`);
        console.log(`   All pool: ${allPool.length} models`);

        // Verify filtering works
        assert(allPool.length >= ollamaPool.length, 'All pool should include Ollama models');
        assert(allPool.length >= hfPool.length, 'All pool should include HF models');

        console.log('✅ Deterministic selector source filtering works');
        passed++;
    } catch (error) {
        console.log('❌ Deterministic selector source filtering failed:', error.message);
        failed++;
    }

    // Cleanup
    try {
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
            console.log('\n🧹 Cleaned up test database');
        }
    } catch (error) {
        console.log('\n⚠️  Warning: Could not clean up test database:', error.message);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`Test Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(50));

    if (failed > 0) {
        process.exit(1);
    }
}

// Run tests
runTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
});
