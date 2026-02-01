
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function inspectSchema() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    // Check user_items columns (by selecting * limit 1 and checking keys)
    const { data: userItems, error: uiError } = await supabase.from('user_items').select('*').limit(1);
    if (uiError) console.error('user_items error:', uiError);
    else if (userItems && userItems.length > 0) console.log('user_items keys:', Object.keys(userItems[0]));
    else console.log('user_items empty');

    // Check questions columns
    const { data: questions, error: qError } = await supabase.from('questions').select('*').limit(1);
    if (qError) console.error('questions error:', qError);
    else if (questions && questions.length > 0) console.log('questions keys:', Object.keys(questions[0]));
}

inspectSchema();
