
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

async function fixSookmyungNulls() {
    console.log('Fixing NULL difficulty for Sookmyung Girls High School...');

    // Update questions where difficulty is NULL to '1'
    const { data, error, count } = await supabase
        .from('questions')
        .update({ difficulty: '1' })
        .eq('school', '숙명여자고등학교')
        .is('difficulty', null) // Filter for NULL
        .select();

    if (error) {
        console.error('Error updating questions:', error);
        return;
    }

    console.log(`Successfully updated ${data.length} NULL questions to difficulty '1'.`);
}

fixSookmyungNulls();
