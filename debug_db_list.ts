import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPersonalDBs() {
    console.log('--- Checking all exam_materials records ---');
    const { data, error } = await supabase
        .from('exam_materials')
        .select('id, title, content_type, school, exam_year, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching exam_materials:', error);
        return;
    }

    console.log('Recent exam_materials count:', data.length);
    data.forEach(item => {
        console.log(`ID: ${item.id} | Title: ${item.title} | ContentType: ${item.content_type} | School: ${item.school} | Year: ${item.exam_year}`);
    });

    console.log('\n--- Checking records with "개인" or "DB" in title or content_type ---');
    const { data: searchData, error: searchError } = await supabase
        .from('exam_materials')
        .select('id, title, content_type, school, exam_year')
        .or('content_type.ilike.%개인%,content_type.ilike.%DB%,title.ilike.%개인%,title.ilike.%DB%');

    if (searchError) {
        console.error('Error searching records:', searchError);
        return;
    }

    console.log('Search match count:', searchData.length);
    searchData.forEach(item => {
        console.log(`ID: ${item.id} | Title: ${item.title} | ContentType: ${item.content_type} | School: ${item.school} | Year: ${item.exam_year}`);
    });
}

checkPersonalDBs();
