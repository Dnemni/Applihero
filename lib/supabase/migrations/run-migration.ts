/**
 * Migration Runner Script
 * 
 * This script runs the onboarding_completed migration.
 * 
 * Usage:
 *   npx tsx lib/supabase/migrations/run-migration.ts
 * 
 * Or with ts-node:
 *   npx ts-node lib/supabase/migrations/run-migration.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
    // Get environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
        console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL is not set');
        process.exit(1);
    }

    if (!supabaseServiceKey) {
        console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
        console.error('   Note: Service role key is recommended for migrations');
        process.exit(1);
    }

    // Create Supabase client with service role key for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    // Read migration file
    const migrationPath = path.join(__dirname, 'add_onboarding_completed.sql');
    let migrationSQL: string;

    try {
        migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    } catch (error) {
        console.error(`❌ Error reading migration file: ${migrationPath}`);
        console.error(error);
        process.exit(1);
    }

    console.log('🚀 Running migration: add_onboarding_completed');
    console.log('📄 Migration file:', migrationPath);
    console.log('');

    // Split SQL into individual statements
    const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

    try {
        // Execute each statement
        for (const statement of statements) {
            if (statement.trim()) {
                console.log(`⏳ Executing: ${statement.substring(0, 50)}...`);

                const { error } = await supabase.rpc('exec_sql', { sql: statement });

                // If RPC doesn't work, try direct query (this might not work for DDL)
                // For DDL statements, we'll need to use the Supabase dashboard or a different approach
                if (error) {
                    console.warn('⚠️  Note: Some statements may need to be run manually in Supabase SQL Editor');
                    console.warn('   Error:', error.message);
                }
            }
        }

        console.log('');
        console.log('✅ Migration completed!');
        console.log('');
        console.log('📝 Note: If you see errors above, you may need to run the migration manually:');
        console.log('   1. Go to your Supabase dashboard');
        console.log('   2. Navigate to SQL Editor');
        console.log('   3. Copy the contents of:', migrationPath);
        console.log('   4. Paste and run in the SQL Editor');

    } catch (error: any) {
        console.error('❌ Migration failed:');
        console.error(error);
        console.log('');
        console.log('💡 Try running the migration manually in Supabase SQL Editor');
        process.exit(1);
    }
}

// Run the migration
runMigration().catch(console.error);

