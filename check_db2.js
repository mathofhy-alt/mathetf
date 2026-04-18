const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('questions')
  .select('question_number, subject, unit, key_concepts, plain_text, embedding')
  .ilike('source_db_id', '%경기여자고등학교_2024_1%대수')
  .in('question_number', [6, 7])
  .then(res => {
    console.log("DB RESULTS:");
    console.log(JSON.stringify(res.data, null, 2));
    process.exit(0);
  });
