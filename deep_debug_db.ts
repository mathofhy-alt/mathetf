import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function deepCheck() {
    console.log('--- Checking all records with file_type === "DB" ---');
    const { data: dbTypeData, error: dbTypeError } = await supabase
        .from('exam_materials')
        .select('*')
        .eq('file_type', 'DB');

    if (dbTypeError) {
        console.error('Error fetching file_type DB:', dbTypeError);
    } else {
        console.log(`Found ${dbTypeData.length} records with file_type === "DB"`);
        dbTypeData.forEach(item => {
            console.log(`ID: ${item.id} | Title: ${item.title} | ContentType: ${item.content_type} | FilePath: ${item.file_path}`);
        });
    }

    console.log('\n--- Checking all records containing "[개인DB]" in title ---');
    const { data: titleData, error: titleError } = await supabase
        .from('exam_materials')
        .select('*')
        .ilike('title', '%[개인DB]%');

    if (titleError) {
        console.error('Error fetching title with [개인DB]:', titleError);
    } else {
        console.log(`Found ${titleData.length} records with "[개인DB]" in title`);
        titleData.forEach(item => {
            console.log(`ID: ${item.id} | Title: ${item.title} | ContentType: ${item.content_type}`);
        });
    }

    console.log('\n--- Checking records created today ---');
    const today = new Date().toISOString().split('T')[0];
    const { data: todayData, error: todayError } = await supabase
        .from('exam_materials')
        .select('*')
        .gte('created_at', today);

    if (todayError) {
        console.error('Error fetching today records:', todayError);
    } else {
        console.log(`Found ${todayData.length} records created today`);
        todayData.forEach(item => {
            console.log(`ID: ${item.id} | Title: ${item.title} | ContentType: ${item.content_type} | FileType: ${item.file_type}`);
        });
    }
}

deepCheck();
