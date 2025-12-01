import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

console.log('=== Environment Check ===\n');

const checks = [
  { name: 'NEXT_PUBLIC_SUPABASE_URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', value: process.env.SUPABASE_SERVICE_ROLE_KEY },
  { name: 'OPENAI_API_KEY', value: process.env.OPENAI_API_KEY },
  { name: 'TEST_USER_ID', value: process.env.TEST_USER_ID },
  { name: 'TEST_JOB_ID', value: process.env.TEST_JOB_ID },
];

let allGood = true;
checks.forEach(check => {
  const status = check.value ? '✓' : '✗';
  const display = check.value 
    ? check.value.substring(0, 20) + '...' 
    : 'MISSING';
  console.log(`${status} ${check.name}: ${display}`);
  if (!check.value && check.name !== 'TEST_JOB_ID') {
    allGood = false;
  }
});

console.log('\n' + (allGood ? '✓ All required variables set!' : '✗ Some variables missing. Update .env.local'));
process.exit(allGood ? 0 : 1);
