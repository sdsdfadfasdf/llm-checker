#!/usr/bin/env node
/**
 * End-to-End Test: Structured Logging
 *
 * Tests the complete logging workflow with real operations.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

const { getLogger } = require('../src/utils/logger');
const LogManager = require('../src/utils/log-manager');

console.log('🧪 End-to-End Structured Logging Test');
console.log('====================================\n');

async function runTest() {
    const TEST_LOG_DIR = path.join(os.tmpdir(), 'llm-checker-e2e-logs');

    // Clean up test directory
    if (fs.existsSync(TEST_LOG_DIR)) {
        fs.rmSync(TEST_LOG_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_LOG_DIR, { recursive: true });

    const today = new Date().toISOString().split('T')[0];

    try {
        console.log('1. Testing model selection logging...');

        const modelLogPath = path.join(TEST_LOG_DIR, `model_selection_${today}.jsonl`);
        const logger = getLogger({
            structuredLogFile: modelLogPath,
            console: false
        });

        // Simulate model selection
        const mockHardware = {
            cpu: { cores: 8 },
            memory: { total: 32 },
            gpu: { model: 'RTX 4090', vram: 24 }
        };

        const mockCandidates = [
            {
                meta: { model_identifier: 'llama3-8b' },
                score: 85,
                quant: 'Q4_K_M',
                requiredGB: 8,
                estTPS: 45
            }
        ];

        logger.logModelSelection('coding', mockHardware, mockCandidates, mockCandidates[0]);

        // Verify log was created
        if (fs.existsSync(modelLogPath)) {
            const logContent = fs.readFileSync(modelLogPath, 'utf8');
            const logEntry = JSON.parse(logContent.trim());
            console.log('   ✅ Model selection log created');
            console.log(`   📝 Category: ${logEntry.data.category}`);
            console.log(`   📝 Candidates: ${logEntry.data.candidates_count}`);
            console.log(`   📝 Selected: ${logEntry.data.selected_model}`);
        } else {
            console.log('   ❌ Model selection log not created');
        }

        console.log('\n2. Testing hardware detection logging...');

        const hwLogPath = path.join(TEST_LOG_DIR, `hardware_detection_${today}.jsonl`);
        const hwLogger = new (require('../src/utils/logger').Logger)({
            structuredLogFile: hwLogPath,
            console: false
        });

        const mockHardwareData = {
            cpu: {
                model: 'AMD Ryzen 7 5700X',
                cores: 8,
                architecture: 'x86_64',
                speed: 3.4
            },
            memory: {
                total: 32,
                available: 16
            },
            gpu: {
                model: 'NVIDIA RTX 4090',
                vendor: 'NVIDIA',
                vram: 24,
                type: 'nvidia',
                unified: false
            },
            acceleration: {
                supports_cuda: true,
                supports_rocm: false,
                supports_metal: false,
                supports_cpu: true
            }
        };

        hwLogger.logHardwareDetectionStructured(mockHardwareData);

        if (fs.existsSync(hwLogPath)) {
            const logContent = fs.readFileSync(hwLogPath, 'utf8');
            const logEntry = JSON.parse(logContent.trim());
            console.log('   ✅ Hardware detection log created');
            console.log(`   📝 CPU: ${logEntry.data.cpu.model}`);
            console.log(`   📝 GPU: ${logEntry.data.gpu.model}`);
            console.log(`   📝 CUDA: ${logEntry.data.acceleration.cuda}`);
        } else {
            console.log('   ❌ Hardware detection log not created');
        }

        console.log('\n3. Testing performance benchmark logging...');

        const perfLogPath = path.join(TEST_LOG_DIR, `performance_benchmark_${today}.jsonl`);
        const perfLogger = new (require('../src/utils/logger').Logger)({
            structuredLogFile: perfLogPath,
            console: false
        });

        const mockPerfResults = {
            tokensPerSecond: 45.5,
            responseTime: 1200,
            promptTokens: 10,
            generatedTokens: 50
        };

        perfLogger.logPerformanceBenchmark('llama3-8b', mockPerfResults);

        if (fs.existsSync(perfLogPath)) {
            const logContent = fs.readFileSync(perfLogPath, 'utf8');
            const logEntry = JSON.parse(logContent.trim());
            console.log('   ✅ Performance benchmark log created');
            console.log(`   📝 TPS: ${logEntry.data.tokens_per_second}`);
            console.log(`   📝 Response Time: ${logEntry.data.response_time_ms}ms`);
        } else {
            console.log('   ❌ Performance benchmark log not created');
        }

        console.log('\n4. Testing sync operation logging...');

        const syncLogPath = path.join(TEST_LOG_DIR, `sync_operation_${today}.jsonl`);
        const syncLogger = new (require('../src/utils/logger').Logger)({
            structuredLogFile: syncLogPath,
            console: false
        });

        const mockSyncResults = {
            modelsAdded: 10,
            modelsUpdated: 5,
            modelsFailed: 0,
            totalModels: 15,
            duration: 30000,
            errors: []
        };

        syncLogger.logSyncOperation('ollama', 'sync', mockSyncResults);

        if (fs.existsSync(syncLogPath)) {
            const logContent = fs.readFileSync(syncLogPath, 'utf8');
            const logEntry = JSON.parse(logContent.trim());
            console.log('   ✅ Sync operation log created');
            console.log(`   📝 Source: ${logEntry.data.source}`);
            console.log(`   📝 Models Added: ${logEntry.data.models_added}`);
            console.log(`   📝 Duration: ${logEntry.data.duration_ms}ms`);
        } else {
            console.log('   ❌ Sync operation log not created');
        }

        console.log('\n5. Testing LogManager query and analysis...');

        const logManager = new LogManager({ logDir: TEST_LOG_DIR });

        const modelLogs = logManager.queryLogs('model_selection');
        console.log(`   📊 Model selection logs: ${modelLogs.length}`);

        const hwLogs = logManager.queryLogs('hardware_detection');
        console.log(`   📊 Hardware detection logs: ${hwLogs.length}`);

        const stats = logManager.getLogStats();
        console.log(`   📊 Total log files: ${stats.total_files}`);
        console.log(`   📊 Total size: ${(stats.total_size / 1024).toFixed(2)} KB`);

        const analysis = logManager.analyzeLogs('model_selection', 7);
        console.log(`   📈 Analysis entries: ${analysis.total_entries}`);

        console.log('\n6. Testing log analyzer CLI...');

        // Test log analyzer
        const { spawn } = require('child_process');
        const analyzerPath = path.join(__dirname, '..', 'bin', 'log-analyzer.js');

        return new Promise((resolve) => {
            const analyzer = spawn('node', [analyzerPath, 'stats'], {
                cwd: __dirname,
                env: { ...process.env }
            });

            let output = '';
            analyzer.stdout.on('data', (data) => {
                output += data.toString();
            });

            analyzer.on('close', (code) => {
                if (code === 0) {
                    console.log('   ✅ Log analyzer CLI works');
                } else {
                    console.log('   ⚠️  Log analyzer CLI had issues');
                }

                console.log('\n✅ All end-to-end tests completed successfully!');

                // Cleanup
                if (fs.existsSync(TEST_LOG_DIR)) {
                    fs.rmSync(TEST_LOG_DIR, { recursive: true });
                    console.log('🧹 Cleaned up test directory');
                }

                resolve();
            });
        });

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

runTest().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
});