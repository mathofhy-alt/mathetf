
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
let supabaseUrl = '';
let serviceKey = '';

if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            const cleanVal = value.trim().replace(/^["']|["']$/g, '');
            if (key.trim() === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = cleanVal;
            if (key.trim() === 'SUPABASE_SERVICE_ROLE_KEY') serviceKey = cleanVal;
        }
    });
}

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
    console.log("--- Heavy Data Analysis ---");

    const { data: images, error } = await supabase
        .from('question_images')
        .select('id, size_bytes, original_bin_id')
        .order('size_bytes', { ascending: false })
        .limit(20);

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("Top 20 Heaviest Images:");
    images?.forEach(img => {
        console.log(`ID: ${img.id} | Size: ${(img.size_bytes / 1024).toFixed(2)} KB | BinID: ${img.original_bin_id}`);
    });

    const { data: questions, error: qErr } = await supabase
        .from('questions')
        .select('id, school, year, semester')
        .limit(5);

    console.log("\nSample Questions for Context:");
    questions?.forEach(q => console.log(`${q.school} ${q.year}-${q.semester}`));
}

run();
