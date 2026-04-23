const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('questions')
    .select('id, subject, unit, key_concepts, difficulty, content_xml')
    // Get questions that were processed but don't have unit or difficulty
    .is('unit', null)
    .neq('embedding', null)
    .limit(10);

  if (error) console.error(error);
  else {
    for (const q of data) {
      console.log(`ID: ${q.id} | Subject: ${q.subject} | Unit: ${q.unit} | Diff: ${q.difficulty} | Tags: ${q.key_concepts}`);
    }
    console.log(`Found ${data.length} questions missing unit despite having embeddings.`);
  }
}
main();
