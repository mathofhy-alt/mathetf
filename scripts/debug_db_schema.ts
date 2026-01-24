
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manually parse env
const envPath = path.resolve(process.cwd(), '.env.local');
let supabaseUrl = '';
let supabaseKey = '';

if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            const cleanVal = value.trim().replace(/^["']|["']$/g, '');
            if (key.trim() === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = cleanVal;
            if (key.trim() === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') supabaseKey = cleanVal;
        }
    });
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("--- Real DB Schema Diagnostic ---");

    // Try to fetch ONE record from questions and question_images to see columns
    console.log("\n[questions] Sample:");
    const { data: qSample, error: qErr } = await supabase.from('questions').select('*').limit(1);
    if (qErr) {
        console.error("  Error fetching questions:", qErr.message);
    } else {
        console.log("  Columns:", Object.keys(qSample[0] || {}));
    }

    console.log("\n[question_images] Sample:");
    const { data: iSample, error: iErr } = await supabase.from('question_images').select('*').limit(1);
    if (iErr) {
        console.error("  Error fetching question_images:", iErr.message);
    } else {
        console.log("  Columns:", Object.keys(iSample[0] || {}));
    }

    // List recent questions to identify target file_id
    console.log("\n--- Recent Questions ---");
    const { data: recentQs } = await supabase
        .from('questions')
        .select('*')
        .order('id', { ascending: false })
        .limit(10);

    recentQs?.forEach(q => {
        console.log(`- ID: ${q.id} | FileID: ${q.file_id || q.source_db_id} | Index: ${q.question_index || q.question_number} | Text: ${q.plain_text?.slice(0, 50)}...`);
    });
}

run();
