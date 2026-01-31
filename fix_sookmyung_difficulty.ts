
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixSookmyungDifficulty() {
    console.log('Fixing difficulty for Sookmyung Girls High School questions...');

    // Update relevant questions to difficulty '1'
    // Targeting 'sorted' questions to be safe, as user mentioned clicking "Sorting Completed"
    const { data, error, count } = await supabase
        .from('questions')
        .update({ difficulty: '1' })
        .eq('school', '숙명여자고등학교')
        .eq('work_status', 'sorted')
        .select();

    if (error) {
        console.error('Error updating questions:', error);
        return;
    }

    console.log(`Successfully updated ${data.length} questions to difficulty '1'.`);
}

fixSookmyungDifficulty();
