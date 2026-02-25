import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLatestDB() {
    const { data, error } = await supabase
        .from('exam_materials')
        .select('*')
        .eq('content_type', '개인DB')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error(error);
        return;
    }

    console.log('--- Latest Personal DB Entries ---');
    data.forEach(item => {
        console.log(`ID: ${item.id}`);
        console.log(`Title: ${item.title}`);
        console.log(`School: ${item.school}, Year: ${item.exam_year}, Grade: ${item.grade}`);
        console.log(`Created: ${item.created_at}`);
        console.log('---------------------------------');
    });
}

checkLatestDB();
