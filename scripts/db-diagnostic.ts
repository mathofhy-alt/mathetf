
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

if (!supabaseUrl || !supabaseKey) {
    console.error("Failed to load Supabase credentials from .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("--- DB Diagnostic: Searching for problematic question ---");

    const { data: questions, error } = await supabase
        .from('questions')
        .select('id, file_id, equation_scripts, content_xml, school')
        .ilike('school', '%영동일고%')
        .limit(10);

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${questions?.length} questions for 영동일고.`);
    questions?.forEach((q, i) => {
        console.log(`\n[${i}] ID: ${q.id}`);
        console.log(`    School: ${q.school}`);
        console.log(`    Scripts Count: ${q.equation_scripts?.length || 0}`);
        if (q.equation_scripts && q.equation_scripts.length > 0) {
            console.log(`    First Script: ${q.equation_scripts[0]}`);
        }
    });
}

run();
