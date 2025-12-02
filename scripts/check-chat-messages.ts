import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { supabaseAdmin } from '../lib/supabase/client';
import { ChatMessage } from '../lib/supabase/types';

async function checkChatMessages() {
  const jobSessionId = '1e77fa12-4cae-480f-9b26-f84f1c0ace78';
  
  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('*')
    .eq('job_id', jobSessionId)
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (error) {
    console.error('Error fetching messages:', error);
    return;
  }
  
  console.log(`\nFound ${data.length} recent messages for job session ${jobSessionId}:\n`);
  data.forEach((msg: ChatMessage, i: number) => {
    console.log(`${i + 1}. [${msg.role}] ${msg.content.substring(0, 80)}...`);
    console.log(`   Created: ${new Date(msg.created_at).toLocaleString()}\n`);
  });
}

checkChatMessages().catch(console.error);
