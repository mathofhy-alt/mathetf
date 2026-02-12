
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
            // Use Service Role Key for diagnostic if available, otherwise Anon
            if (key.trim() === 'SUPABASE_SERVICE_ROLE_KEY') supabaseKey = cleanVal;
            else if (key.trim() === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' && !supabaseKey) supabaseKey = cleanVal;
        }
    });
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("=== DB Heavy Diagnostic ===");

    // 1. Total Counts
    const { count: totalCount } = await supabase.from('questions').select('*', { count: 'exact', head: true });
    console.log(`Total Questions: ${totalCount}`);

    // 2. Counts by status
    const { count: sortedCount } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('work_status', 'sorted');
    const { count: unsortedCount } = await supabase.from('questions').select('*', { count: 'exact', head: true }).neq('work_status', 'sorted');
    console.log(`Sorted: ${sortedCount}`);
    console.log(`Unsorted (include null): ${unsortedCount}`);

    // 3. Average Content Size
    const { data: sample } = await supabase.from('questions').select('content_xml').limit(20);
    if (sample) {
        const avgSize = sample.reduce((acc, q) => acc + (q.content_xml?.length || 0), 0) / sample.length;
        console.log(`Average content_xml size: ${(avgSize / 1024).toFixed(2)} KB`);
    }

    // 4. Index Check (via RPC if exists, or just query performance)
    const start = Date.now();
    await supabase.from('questions').select('id').eq('work_status', 'sorted').limit(10);
    console.log(`Query (sorted filter) time: ${Date.now() - start}ms`);

    const start2 = Date.now();
    await supabase.from('questions').select('id').neq('work_status', 'sorted').limit(10);
    console.log(`Query (unsorted filter) time: ${Date.now() - start2}ms`);
}

run();
