#!/usr/bin/env node
/**
 * Unit Tests: Structured Logging
 *
 * Tests the Logger class structured logging methods and LogManager utility.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Test utilities
const assert = require('assert');

// Import modules
const { Logger, getLogger } = require('../src/utils/logger');
const LogManager = require('../src/utils/log-manager');

// Test configuration
const TEST_LOG_DIR = path.join(os.tmpdir(), 'llm-checker-test-logs');
const TEST_STRUCTURED_LOG = path.join(TEST_LOG_DIR, 'test.jsonl');

console.log('🧪 Structured Logging Unit Tests');
console.log('================================\n');

async function runTests() {
    let passed = 0;
    let failed = 0;

    // Clean up test directory
    if (fs.existsSync(TEST_LOG_DIR)) {
        fs.rmSync(TEST_LOG_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_LOG_DIR, { recursive: true });

    // Test 1: Logger structured logging methods
    try {
        console.log('Test 1: Logger structured logging methods...');
        const logger = new Logger({
            structuredLogFile: TEST_STRUCTURED_LOG,
            console: false
        });

        // Test logStructured method
        logger.logStructured('info', 'test_operation', {
            test_field: 'test_value',
            number: 42
        });

        // Verify log file was created
        assert(fs.existsSync(TEST_STRUCTURED_LOG), 'Structured log file should be created');

        // Verify log content
        const logContent = fs.readFileSync(TEST_STRUCTURED_LOG, 'utf8');
        const logEntry = JSON.parse(logContent.trim());

        assert(logEntry.timestamp, 'Log entry should have timestamp');
        assert(logEntry.level === 'INFO', 'Log entry should have INFO level');
        assert(logEntry.operation === 'test_operation', 'Log entry should have operation');
        assert(logEntry.data.test_field === 'test_value', 'Log entry should preserve data');

        console.log('✅ Logger structured logging methods work');
        passed++;
    } catch (error) {
        console.log('❌ Logger structured logging methods failed:', error.message);
        failed++;
    }

    // Test 2: Logger specialized logging methods
    try {
        console.log('\nTest 2: Logger specialized logging methods...');
        const logger = new Logger({
            structuredLogFile: TEST_STRUCTURED_LOG,
            console: false
        });

        // Test logModelSelection
        logger.logModelSelection('coding', {
            cpu: { cores: 8 },
            memory: { total: 32 },
            gpu: { model: 'RTX 4090', vram: 24 }
        }, [
            { meta: { model_identifier: 'test-model-1' }, score: 85, quant: 'Q4_K_M', requiredGB: 8, estTPS: 45 }
        ], {
            meta: { model_identifier: 'test-model-1' },
            score: 85
        });

        const logContent = fs.readFileSync(TEST_STRUCTURED_LOG, 'utf8');
        const lines = logContent.trim().split('\n');
        const lastEntry = JSON.parse(lines[lines.length - 1]);

        assert(lastEntry.operation === 'model_selection', 'Should log model selection');
        assert(lastEntry.data.category === 'coding', 'Should log category');
        assert(lastEntry.data.candidates_count === 1, 'Should log candidate count');
        assert(lastEntry.data.selected_model === 'test-model-1', 'Should log selected model');

        console.log('✅ Logger specialized logging methods work');
        passed++;
    } catch (error) {
        console.log('❌ Logger specialized logging methods failed:', error.message);
        failed++;
    }

    // Test 3: LogManager initialization
    try {
        console.log('\nTest 3: LogManager initialization...');
        const logManager = new LogManager({
            logDir: TEST_LOG_DIR
        });

        assert(fs.existsSync(TEST_LOG_DIR), 'Log directory should be created');
        assert(logManager.logDir === TEST_LOG_DIR, 'Log directory should be set correctly');

        console.log('✅ LogManager initialization works');
        passed++;
    } catch (error) {
        console.log('❌ LogManager initialization failed:', error.message);
        failed++;
    }

    // Test 4: LogManager getStructuredLogPath
    try {
        console.log('\nTest 4: LogManager getStructuredLogPath...');
        const logManager = new LogManager({
            logDir: TEST_LOG_DIR
        });

        const logPath = logManager.getStructuredLogPath('test_operation');
        const today = new Date().toISOString().split('T')[0];
        const expectedPath = path.join(TEST_LOG_DIR, `test_operation_${today}.jsonl`);

        assert(logPath === expectedPath, 'Log path should be formatted correctly');

        console.log('✅ LogManager getStructuredLogPath works');
        passed++;
    } catch (error) {
        console.log('❌ LogManager getStructuredLogPath failed:', error.message);
        failed++;
    }

    // Test 5: LogManager queryLogs
    try {
        console.log('\nTest 5: LogManager queryLogs...');
        const logManager = new LogManager({
            logDir: TEST_LOG_DIR
        });

        // Create test log file
        const testLogPath = logManager.getStructuredLogPath('query_test');
        const testEntries = [
            { timestamp: new Date().toISOString(), level: 'INFO', operation: 'query_test', data: { test: 'value1' } },
            { timestamp: new Date().toISOString(), level: 'ERROR', operation: 'query_test', data: { test: 'value2' } },
            { timestamp: new Date().toISOString(), level: 'INFO', operation: 'query_test', data: { test: 'value3' } }
        ];

        fs.writeFileSync(testLogPath, testEntries.map(e => JSON.stringify(e)).join('\n'));

        // Query all logs
        const allLogs = logManager.queryLogs('query_test');
        assert(allLogs.length === 3, 'Should return all logs');

        // Query by level
        const errorLogs = logManager.queryLogs('query_test', { level: 'error' });
        assert(errorLogs.length === 1, 'Should return only ERROR logs');

        // Query by field
        const filteredLogs = logManager.queryLogs('query_test', { field: 'test', value: 'value1' });
        assert(filteredLogs.length === 1, 'Should return only matching logs');

        console.log('✅ LogManager queryLogs works');
        passed++;
    } catch (error) {
        console.log('❌ LogManager queryLogs failed:', error.message);
        failed++;
    }

    // Test 6: LogManager getLogStats
    try {
        console.log('\nTest 6: LogManager getLogStats...');
        const logManager = new LogManager({
            logDir: TEST_LOG_DIR
        });

        const stats = logManager.getLogStats();

        assert(stats.total_files >= 0, 'Should return total files count');
        assert(stats.total_size >= 0, 'Should return total size');
        assert(typeof stats.operations === 'object', 'Should return operations object');

        console.log('✅ LogManager getLogStats works');
        passed++;
    } catch (error) {
        console.log('❌ LogManager getLogStats failed:', error.message);
        failed++;
    }

    // Test 7: LogManager analyzeLogs
    try {
        console.log('\nTest 7: LogManager analyzeLogs...');
        const logManager = new LogManager({
            logDir: TEST_LOG_DIR
        });

        const analysis = logManager.analyzeLogs('query_test', 7);

        assert(analysis.operation === 'query_test', 'Should return operation name');
        assert(analysis.period_days === 7, 'Should return period');
        assert(typeof analysis.total_entries === 'number', 'Should return total entries');
        assert(typeof analysis.by_level === 'object', 'Should return level breakdown');
        assert(Array.isArray(analysis.trends), 'Should return trends array');
        assert(Array.isArray(analysis.errors), 'Should return errors array');

        console.log('✅ LogManager analyzeLogs works');
        passed++;
    } catch (error) {
        console.log('❌ LogManager analyzeLogs failed:', error.message);
        failed++;
    }

    // Test 8: LogManager clearLogs
    try {
        console.log('\nTest 8: LogManager clearLogs...');
        const logManager = new LogManager({
            logDir: TEST_LOG_DIR
        });

        // Create test log file
        const testLogPath = logManager.getStructuredLogPath('clear_test');
        fs.writeFileSync(testLogPath, JSON.stringify({ test: 'data' }));

        // Clear logs
        const result = logManager.clearLogs('clear_test');

        assert(result.success === true, 'Clear should succeed');
        assert(result.deleted === 1, 'Should delete 1 file');
        assert(!fs.existsSync(testLogPath), 'Log file should be deleted');

        console.log('✅ LogManager clearLogs works');
        passed++;
    } catch (error) {
        console.log('❌ LogManager clearLogs failed:', error.message);
        failed++;
    }

    // Test 9: Logger global instance
    try {
        console.log('\nTest 9: Logger global instance...');
        const logger1 = getLogger();
        const logger2 = getLogger();

        assert(logger1 === logger2, 'Should return same instance');

        console.log('✅ Logger global instance works');
        passed++;
    } catch (error) {
        console.log('❌ Logger global instance failed:', error.message);
        failed++;
    }

    // Test 10: JSON log format validation
    try {
        console.log('\nTest 10: JSON log format validation...');
        const logger = new Logger({
            structuredLogFile: TEST_STRUCTURED_LOG,
            console: false
        });

        // Test all specialized logging methods
        logger.logHardwareDetectionStructured({
            cpu: { model: 'Test CPU', cores: 8, architecture: 'x86_64', speed: 3.5 },
            memory: { total: 32, available: 16 },
            gpu: { model: 'Test GPU', vendor: 'NVIDIA', vram: 24, type: 'nvidia', unified: false },
            acceleration: { cuda: true, rocm: false, metal: false, cpu: true }
        });

        logger.logPerformanceBenchmark('test-model', {
            tokensPerSecond: 45,
            responseTime: 1200,
            promptTokens: 10,
            generatedTokens: 50
        });

        logger.logSyncOperation('ollama', 'sync', {
            modelsAdded: 10,
            modelsUpdated: 5,
            modelsFailed: 0,
            totalModels: 15,
            duration: 30000,
            errors: []
        });

        // Verify all logs are valid JSON
        const logContent = fs.readFileSync(TEST_STRUCTURED_LOG, 'utf8');
        const lines = logContent.trim().split('\n');

        for (const line of lines) {
            const entry = JSON.parse(line);
            assert(entry.timestamp, 'Each entry should have timestamp');
            assert(entry.level, 'Each entry should have level');
            assert(entry.operation, 'Each entry should have operation');
            assert(entry.data, 'Each entry should have data');
        }

        console.log('✅ JSON log format validation works');
        passed++;
    } catch (error) {
        console.log('❌ JSON log format validation failed:', error.message);
        failed++;
    }

    // Cleanup
    try {
        if (fs.existsSync(TEST_LOG_DIR)) {
            fs.rmSync(TEST_LOG_DIR, { recursive: true });
            console.log('\n🧹 Cleaned up test directory');
        }
    } catch (error) {
        console.log('\n⚠️  Warning: Could not clean up test directory:', error.message);
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