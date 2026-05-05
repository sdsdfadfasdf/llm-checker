#!/usr/bin/env node
const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const os = require('os');
const chalk = require('chalk');
const { table } = require('table');
const LogManager = require('../src/utils/log-manager');

const program = new Command();

program
    .name('llm-checker-log')
    .description('Analyze and query structured logs from llm-checker operations')
    .version(require('../package.json').version);

const logManager = new LogManager();

program
    .command('query <operation>')
    .description('Query structured logs by operation type')
    .option('--date <date>', 'Filter by date (YYYY-MM-DD)')
    .option('--level <level>', 'Filter by log level (ERROR, WARN, INFO, DEBUG, TRACE)')
    .option('--start-time <time>', 'Filter by start time (ISO 8601)')
    .option('--end-time <time>', 'Filter by end time (ISO 8601)')
    .option('--field <field>', 'Filter by field name (e.g., "data.category")')
    .option('--value <value>', 'Filter by field value')
    .option('--format <format>', 'Output format (json, table, csv)', 'json')
    .option('--limit <number>', 'Limit number of results', '100')
    .action((operation, options) => {
        try {
            const logs = logManager.queryLogs(operation, {
                date: options.date,
                level: options.level,
                startTime: options.startTime,
                endTime: options.endTime,
                field: options.field,
                value: options.value
            });

            const limitedLogs = logs.slice(0, parseInt(options.limit));

            switch (options.format) {
                case 'table':
                    displayLogsAsTable(limitedLogs);
                    break;
                case 'csv':
                    displayLogsAsCSV(limitedLogs);
                    break;
                case 'json':
                default:
                    console.log(JSON.stringify(limitedLogs, null, 2));
                    break;
            }

            console.log(chalk.gray(`\nFound ${logs.length} total logs, showing ${limitedLogs.length}`));
        } catch (error) {
            console.error(chalk.red('Error querying logs:'), error.message);
            process.exit(1);
        }
    });

program
    .command('stats')
    .description('Show log file statistics')
    .action(() => {
        try {
            const stats = logManager.getLogStats();

            console.log(chalk.cyan.bold('\n📊 Log File Statistics\n'));
            console.log(chalk.white('Total Files:'), chalk.yellow(stats.total_files));
            console.log(chalk.white('Total Size:'), chalk.yellow(formatBytes(stats.total_size)));

            if (stats.date_range) {
                console.log(chalk.white('Date Range:'));
                console.log(chalk.gray('  Oldest:'), chalk.yellow(stats.date_range.oldest));
                console.log(chalk.gray('  Newest:'), chalk.yellow(stats.date_range.newest));
            }

            if (Object.keys(stats.operations).length > 0) {
                console.log(chalk.white('\nOperations:'));
                for (const [op, data] of Object.entries(stats.operations)) {
                    console.log(chalk.gray(`  ${op}:`), chalk.yellow(`${data.file_count} files`), chalk.gray(`(${formatBytes(data.total_size)})`));
                }
            }

            console.log();
        } catch (error) {
            console.error(chalk.red('Error getting stats:'), error.message);
            process.exit(1);
        }
    });

program
    .command('analyze <operation>')
    .description('Analyze logs for trends and patterns')
    .option('--period <days>', 'Analysis period in days', '7')
    .action((operation, options) => {
        try {
            const analysis = logManager.analyzeLogs(operation, parseInt(options.period));

            console.log(chalk.cyan.bold(`\n📈 Log Analysis: ${operation}\n`));
            console.log(chalk.white('Period:'), chalk.yellow(`${analysis.period_days} days`));
            console.log(chalk.white('Total Entries:'), chalk.yellow(analysis.total_entries));

            if (Object.keys(analysis.by_level).length > 0) {
                console.log(chalk.white('\nBy Level:'));
                for (const [level, count] of Object.entries(analysis.by_level)) {
                    const color = level === 'ERROR' ? 'red' : level === 'WARN' ? 'yellow' : 'white';
                    console.log(chalk.gray(`  ${level}:`), chalk[color](count));
                }
            }

            if (analysis.trends.length > 0) {
                console.log(chalk.white('\nHourly Distribution:'));
                const maxCount = Math.max(...analysis.trends.map(t => t.count));
                for (const trend of analysis.trends) {
                    const barLength = Math.round((trend.count / maxCount) * 20);
                    const bar = '█'.repeat(barLength);
                    console.log(chalk.gray(`  ${String(trend.hour).padStart(2, '0')}:00`), chalk.cyan(bar), chalk.yellow(trend.count));
                }
            }

            if (analysis.errors.length > 0) {
                console.log(chalk.red(`\n❌ Errors (${analysis.errors.length}):`));
                analysis.errors.slice(0, 5).forEach((err, i) => {
                    console.log(chalk.red(`  ${i + 1}.`), chalk.gray(err.timestamp));
                    console.log(chalk.gray('     '), chalk.white(err.operation));
                });
                if (analysis.errors.length > 5) {
                    console.log(chalk.gray(`     ... and ${analysis.errors.length - 5} more`));
                }
            }

            console.log();
        } catch (error) {
            console.error(chalk.red('Error analyzing logs:'), error.message);
            process.exit(1);
        }
    });

program
    .command('clear <operation>')
    .description('Clear all logs for a specific operation')
    .option('--confirm', 'Skip confirmation prompt')
    .action((operation, options) => {
        if (!options.confirm) {
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.question(chalk.yellow(`Are you sure you want to clear all logs for '${operation}'? (yes/no): `), (answer) => {
                rl.close();
                if (answer.toLowerCase() !== 'yes') {
                    console.log(chalk.gray('Operation cancelled.'));
                    return;
                }
                performClear(operation);
            });
        } else {
            performClear(operation);
        }
    });

function performClear(operation) {
    try {
        const result = logManager.clearLogs(operation);
        if (result.success) {
            console.log(chalk.green(`✅ Cleared ${result.deleted} log files for '${operation}'`));
        } else {
            console.error(chalk.red('Error clearing logs:'), result.error);
            process.exit(1);
        }
    } catch (error) {
        console.error(chalk.red('Error clearing logs:'), error.message);
        process.exit(1);
    }
}

function displayLogsAsTable(logs) {
    if (logs.length === 0) {
        console.log(chalk.gray('No logs found.'));
        return;
    }

    const headers = ['Timestamp', 'Level', 'Operation', 'Data'];
    const rows = [headers];

    for (const log of logs) {
        const dataStr = JSON.stringify(log.data).substring(0, 50) + (JSON.stringify(log.data).length > 50 ? '...' : '');
        rows.push([
            log.timestamp.substring(0, 19),
            log.level,
            log.operation,
            dataStr
        ]);
    }

    console.log(table(rows));
}

function displayLogsAsCSV(logs) {
    if (logs.length === 0) {
        console.log('timestamp,level,operation,data');
        return;
    }

    console.log('timestamp,level,operation,data');
    for (const log of logs) {
        const dataStr = JSON.stringify(log.data).replace(/"/g, '""');
        console.log(`${log.timestamp},${log.level},${log.operation},"${dataStr}"`);
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

program.parse();