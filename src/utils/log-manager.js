const fs = require('fs');
const path = require('path');
const os = require('os');

class LogManager {
    constructor(options = {}) {
        this.logDir = options.logDir || path.join(os.homedir(), '.llm-checker', 'logs');
        this.maxLogFiles = options.maxLogFiles || 30;
        this.maxLogSize = options.maxLogSize || 10 * 1024 * 1024; // 10MB
        this.ensureLogDirectory();
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            try {
                fs.mkdirSync(this.logDir, { recursive: true });
            } catch (error) {
                console.error('Failed to create log directory:', error.message);
            }
        }
    }

    getStructuredLogPath(operation) {
        const date = new Date().toISOString().split('T')[0];
        return path.join(this.logDir, `${operation}_${date}.jsonl`);
    }

    rotateLogsIfNeeded() {
        try {
            const files = fs.readdirSync(this.logDir);
            const logFiles = files.filter(f => f.endsWith('.jsonl'));

            // Check file sizes and rotate if needed
            for (const file of logFiles) {
                const filePath = path.join(this.logDir, file);
                const stats = fs.statSync(filePath);

                if (stats.size > this.maxLogSize) {
                    this.rotateLogFile(filePath);
                }
            }

            // Delete old logs if exceeding maxLogFiles
            if (logFiles.length > this.maxLogFiles) {
                const sortedFiles = logFiles
                    .map(f => ({
                        name: f,
                        path: path.join(this.logDir, f),
                        mtime: fs.statSync(path.join(this.logDir, f)).mtime
                    }))
                    .sort((a, b) => a.mtime - b.mtime);

                const filesToDelete = sortedFiles.slice(0, logFiles.length - this.maxLogFiles);
                for (const file of filesToDelete) {
                    fs.unlinkSync(file.path);
                }
            }
        } catch (error) {
            console.error('Failed to rotate logs:', error.message);
        }
    }

    rotateLogFile(filePath) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const rotatedFile = filePath + '.' + timestamp;
            fs.renameSync(filePath, rotatedFile);
        } catch (error) {
            console.error('Failed to rotate log file:', error.message);
        }
    }

    queryLogs(operation, filters = {}) {
        const results = [];
        const date = filters.date || new Date().toISOString().split('T')[0];
        const logPath = path.join(this.logDir, `${operation}_${date}.jsonl`);

        if (!fs.existsSync(logPath)) {
            return results;
        }

        try {
            const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);

                    // Apply filters
                    if (filters.level && entry.level !== filters.level.toUpperCase()) {
                        continue;
                    }

                    if (filters.startTime && new Date(entry.timestamp) < new Date(filters.startTime)) {
                        continue;
                    }

                    if (filters.endTime && new Date(entry.timestamp) > new Date(filters.endTime)) {
                        continue;
                    }

                    // Safe field-based filtering
                    if (filters.field && filters.value) {
                        const fieldValue = this.getNestedValue(entry.data, filters.field);
                        if (fieldValue !== filters.value) {
                            continue;
                        }
                    }

                    results.push(entry);
                } catch (parseError) {
                    console.error('Failed to parse log line:', parseError.message);
                }
            }
        } catch (error) {
            console.error('Failed to read log file:', error.message);
        }

        return results;
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj);
    }

    getLogStats() {
        const stats = {
            total_files: 0,
            total_size: 0,
            operations: {},
            date_range: null
        };

        try {
            const files = fs.readdirSync(this.logDir);
            const logFiles = files.filter(f => f.endsWith('.jsonl'));

            stats.total_files = logFiles.length;

            let oldestDate = null;
            let newestDate = null;

            for (const file of logFiles) {
                const filePath = path.join(this.logDir, file);
                const fileStats = fs.statSync(filePath);
                stats.total_size += fileStats.size;

                // Extract operation name from filename
                const match = file.match(/^(.+?)_\d{4}-\d{2}-\d{2}\.jsonl$/);
                if (match) {
                    const operation = match[1];
                    if (!stats.operations[operation]) {
                        stats.operations[operation] = {
                            file_count: 0,
                            total_size: 0
                        };
                    }
                    stats.operations[operation].file_count++;
                    stats.operations[operation].total_size += fileStats.size;
                }

                // Track date range
                if (!oldestDate || fileStats.mtime < oldestDate) {
                    oldestDate = fileStats.mtime;
                }
                if (!newestDate || fileStats.mtime > newestDate) {
                    newestDate = fileStats.mtime;
                }
            }

            if (oldestDate && newestDate) {
                stats.date_range = {
                    oldest: oldestDate.toISOString(),
                    newest: newestDate.toISOString()
                };
            }
        } catch (error) {
            console.error('Failed to get log stats:', error.message);
        }

        return stats;
    }

    analyzeLogs(operation, periodDays = 7) {
        const results = {
            operation,
            period_days: periodDays,
            total_entries: 0,
            by_level: {},
            by_hour: {},
            trends: [],
            errors: []
        };

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        try {
            const files = fs.readdirSync(this.logDir);
            const logFiles = files.filter(f => f.startsWith(`${operation}_`) && f.endsWith('.jsonl'));

            for (const file of logFiles) {
                const filePath = path.join(this.logDir, file);
                const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const entry = JSON.parse(line);
                        const entryDate = new Date(entry.timestamp);

                        // Filter by date range
                        if (entryDate < startDate || entryDate > endDate) {
                            continue;
                        }

                        results.total_entries++;

                        // Count by level
                        if (!results.by_level[entry.level]) {
                            results.by_level[entry.level] = 0;
                        }
                        results.by_level[entry.level]++;

                        // Count by hour
                        const hour = entryDate.getHours();
                        if (!results.by_hour[hour]) {
                            results.by_hour[hour] = 0;
                        }
                        results.by_hour[hour]++;

                        // Track errors
                        if (entry.level === 'ERROR') {
                            results.errors.push({
                                timestamp: entry.timestamp,
                                operation: entry.operation,
                                data: entry.data
                            });
                        }
                    } catch (parseError) {
                        console.error('Failed to parse log line:', parseError.message);
                    }
                }
            }

            // Calculate trends (hourly distribution)
            const hours = Object.keys(results.by_hour).map(Number).sort((a, b) => a - b);
            results.trends = hours.map(hour => ({
                hour,
                count: results.by_hour[hour]
            }));

        } catch (error) {
            console.error('Failed to analyze logs:', error.message);
        }

        return results;
    }

    clearLogs(operation) {
        try {
            const files = fs.readdirSync(this.logDir);
            const logFiles = files.filter(f => f.startsWith(`${operation}_`) && f.endsWith('.jsonl'));

            for (const file of logFiles) {
                const filePath = path.join(this.logDir, file);
                fs.unlinkSync(filePath);
            }

            return { success: true, deleted: logFiles.length };
        } catch (error) {
            console.error('Failed to clear logs:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = LogManager;