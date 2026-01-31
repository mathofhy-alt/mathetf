
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

async function inspectSookmyung() {
    console.log('Searching for Sookmyung Girls High School questions...');

    // Search for school name containing '숙명'
    const { data, error } = await supabase
        .from('questions')
        .select('id, school, difficulty, work_status, created_at')
        .ilike('school', '%숙명%')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('Error fetching questions:', error);
        return;
    }

    console.log(`Found ${data.length} questions.`);
    if (data.length > 0) {
        console.table(data);
    }
}

inspectSookmyung();
