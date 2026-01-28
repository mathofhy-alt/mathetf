
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
    console.error("Failed to load Supersbase credentials from .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Checking Latest 30 DB Questions for Injection Status...");

    const { data: questions, error } = await supabase
        .from('questions')
        .select('id, created_at, is_sorted')
        .order('created_at', { ascending: false })
        .limit(30);

    if (error) {
        console.error("Error fetching questions:", error);
        return;
    }

    if (!questions || questions.length === 0) {
        console.log("No questions found.");
        return;
    }

    console.log(`Found ${questions.length} recent questions.`);
    console.table(questions.map(q => ({
        id: q.id,
        created: new Date(q.created_at).toLocaleString(),
        is_sorted: q.is_sorted,
        school: 'N/A'
    })));
}

run();
