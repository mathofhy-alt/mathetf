const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data } = await supabase
    .from('questions')
    .select('id, subject, school, year, grade, semester, created_at, embedding')
    .is('unit', null)
    .order('created_at', { ascending: false });
    
  console.log('--- Unit 없는 문제들 ---');
  for(let q of data) {
    console.log(`[${q.created_at.slice(0,10)}] ${q.school || '연합'} | ${q.subject} | Embed: ${q.embedding ? 'O' : 'X'} | ID: ${q.id.slice(0,8)}`);
  }
}
main();
