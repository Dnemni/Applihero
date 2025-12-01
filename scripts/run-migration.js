/**
 * Migration Runner
 * 
 * This script helps you run the onboarding_completed migration.
 * 
 * Since Supabase requires DDL statements to be run through the SQL Editor,
 * this script will:
 * 1. Validate the migration file exists
 * 2. Display the SQL to run
 * 3. Provide instructions
 * 
 * For automated execution, you'll need to use Supabase CLI or Management API.
 */

const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '../lib/supabase/migrations/add_onboarding_completed.sql');

console.log('🚀 Migration Runner for: add_onboarding_completed\n');

// Check if migration file exists
if (!fs.existsSync(migrationPath)) {
    console.error('❌ Migration file not found:', migrationPath);
    process.exit(1);
}

// Read and display the migration
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

console.log('📄 Migration SQL:');
console.log('─'.repeat(60));
console.log(migrationSQL);
console.log('─'.repeat(60));
console.log('');

console.log('📝 To run this migration:');
console.log('');
console.log('Option 1: Supabase Dashboard (Recommended)');
console.log('  1. Go to your Supabase project dashboard');
console.log('  2. Navigate to SQL Editor');
console.log('  3. Click "New Query"');
console.log('  4. Copy and paste the SQL above');
console.log('  5. Click "Run"');
console.log('');

console.log('Option 2: Supabase CLI');
console.log('  If you have Supabase CLI installed:');
console.log('  supabase db push');
console.log('');

console.log('✅ Migration file is ready to run!');

