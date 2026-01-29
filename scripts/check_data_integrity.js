
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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
    console.log("--- Data Integrity Check ---");

    // 1. Check Total Count
    const { count, error } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error("DB Error:", error.message);
    } else {
        console.log(`[TOTAL QUESTIONS]: ${count}`);
    }

    // 2. Check a few actual rows to see if columns exist
    const { data, error: dataError } = await supabase
        .from('questions')
        .select('id, work_status, created_at')
        .limit(5);

    if (dataError) {
        console.error("Data Fetch Error:", dataError.message);
        // If error suggests 'work_status' column missing, that's the answer.
    } else {
        console.log("\n[Sample Rows]:");
        data.forEach(row => {
            console.log(`ID: ${row.id} | status: ${row.work_status}`);
        });
    }
}

run();
