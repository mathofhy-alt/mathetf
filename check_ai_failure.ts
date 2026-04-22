import { createClient } from '@supabase/supabase-js'; 
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); 

async function check() { 
  const { data, error } = await supabase.from('questions')
      .select('id, subject, unit, key_concepts')
      .not('embedding', 'is', null)
      .or('subject.in.("전과목","수학"),unit.is.null,key_concepts.is.null'); 

  console.log('Failed AI questions (Has embedding but missing tags/subject):', data?.length); 
  
  if (data && data.length > 0) {
    const ids = data.map(d=>d.id);
    console.log('Resetting the following IDs to null embedding:', ids);
    const {error: upErr} = await supabase.from('questions').update({embedding: null}).in('id', ids);
    console.log('Reset embeddings for retry:', upErr ? upErr : 'Success!');
  } else {
    console.log('No failed questions found. All good!');
  }
} 
check();
