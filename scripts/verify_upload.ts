
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
    console.log("--- Verifying WHOLE_QUESTION_V28 Entries ---");

    const { count, error } = await supabase
        .from('question_images')
        .select('*', { count: 'exact', head: true })
        .eq('original_bin_id', 'WHOLE_QUESTION_V28');

    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log(`Found ${count} entries with original_bin_id='WHOLE_QUESTION_V28'.`);
    }

    // Check mapping for one question
    const { data: samples } = await supabase
        .from('question_images')
        .select('question_id, original_bin_id, format')
        .eq('original_bin_id', 'WHOLE_QUESTION_V28')
        .limit(3);

    console.log("Samples:", samples);
}

run();
