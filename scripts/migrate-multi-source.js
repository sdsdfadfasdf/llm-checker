#!/usr/bin/env node
/**
 * Database Migration Script
 *
 * Adds multi-source support columns to existing databases.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

// Default database path
const DEFAULT_DB_PATH = path.join(os.homedir(), '.llm-checker', 'models.db');

console.log('🔄 Database Migration: Multi-Source Support');
console.log('============================================\n');

async function migrateDatabase(dbPath = DEFAULT_DB_PATH) {
    if (!fs.existsSync(dbPath)) {
        console.log(`❌ Database not found: ${dbPath}`);
        console.log('   Run llm-checker sync first to create the database.');
        process.exit(1);
    }

    console.log(`📁 Database: ${dbPath}`);

    try {
        // Load sql.js
        let initSqlJs;
        try {
            initSqlJs = require('sql.js');
        } catch (e) {
            throw new Error('sql.js is not installed. Install it with: npm install sql.js');
        }
        const SQL = await initSqlJs();

        // Load existing database
        const buffer = fs.readFileSync(dbPath);
        const db = new SQL.Database(buffer);

        // Check current schema
        console.log('\n🔍 Checking current schema...');
        const schema = db.exec('PRAGMA table_info(models)');
        const columns = schema[0].values.map(row => row[1]);

        console.log(`   Current columns: ${columns.length}`);

        // Check if migration is needed
        const needsMigration = !columns.includes('source');

        if (!needsMigration) {
            console.log('✅ Database already has multi-source support');
            console.log('   No migration needed.');
            return;
        }

        console.log('⚠️  Migration needed...');

        // Add new columns
        console.log('\n📝 Adding new columns...');

        const migrations = [
            'ALTER TABLE models ADD COLUMN source TEXT DEFAULT \'ollama\'',
            'ALTER TABLE models ADD COLUMN hf_model_id TEXT',
            'ALTER TABLE models ADD COLUMN hf_author TEXT',
            'ALTER TABLE models ADD COLUMN hf_likes INTEGER',
            'ALTER TABLE models ADD COLUMN hf_downloads INTEGER',
            'ALTER TABLE models ADD COLUMN hf_pipeline_tag TEXT'
        ];

        for (const migration of migrations) {
            try {
                db.run(migration);
                console.log(`   ✓ ${migration}`);
            } catch (error) {
                if (error.message.includes('duplicate column')) {
                    console.log(`   ⊘ ${migration} (already exists)`);
                } else {
                    throw error;
                }
            }
        }

        // Create indexes for better performance
        console.log('\n📊 Creating indexes...');

        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_models_source ON models(source)',
            'CREATE INDEX IF NOT EXISTS idx_models_hf_pipeline_tag ON models(hf_pipeline_tag)'
        ];

        for (const index of indexes) {
            try {
                db.run(index);
                console.log(`   ✓ ${index}`);
            } catch (error) {
                console.log(`   ⊘ ${index} (already exists)`);
            }
        }

        // Update existing models with default source
        console.log('\n🔄 Updating existing models...');
        const updateResult = db.run('UPDATE models SET source = \'ollama\' WHERE source IS NULL');
        console.log(`   ✓ Updated ${updateResult} models with source='ollama'`);

        // Save migrated database
        console.log('\n💾 Saving migrated database...');
        const data = db.export();
        const bufferOut = Buffer.from(data);
        fs.writeFileSync(dbPath, bufferOut);

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📊 New schema:');
        const newSchema = db.exec('PRAGMA table_info(models)');
        newSchema[0].values.forEach(row => {
            const [cid, name, type, notnull, dflt_value, pk] = row;
            console.log(`   ${name}: ${type}${notnull ? ' NOT NULL' : ''}${dflt_value ? ` DEFAULT ${dflt_value}` : ''}${pk ? ' PRIMARY KEY' : ''}`);
        });

        db.close();

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        if (process.env.DEBUG) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run migration
const dbPath = process.argv[2] || DEFAULT_DB_PATH;
migrateDatabase(dbPath).catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});
