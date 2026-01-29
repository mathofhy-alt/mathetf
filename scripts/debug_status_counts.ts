
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
    console.log("--- Checking work_status Distribution ---");

    // Check for 'sorted'
    const { count: sortedCount, error: err1 } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('work_status', 'sorted');

    // Check for 'unsorted'
    const { count: unsortedCount, error: err2 } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('work_status', 'unsorted');

    // Check for NULL
    const { count: nullCount, error: err3 } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .is('work_status', null);

    // Check Total
    const { count: totalCount, error: errTotal } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true });

    if (err1 || err2 || err3 || errTotal) {
        console.error("Error querying DB. Column might not exist?");
        console.error(err1 || err2 || err3 || errTotal);
    } else {
        console.log(`Total: ${totalCount}`);
        console.log(`Sorted: ${sortedCount}`);
        console.log(`Unsorted: ${unsortedCount}`);
        console.log(`NULL: ${nullCount}`);
    }

    // Test the OR query used in API
    console.log("\n--- Testing API Query Logic ---");
    const { count: orCount, error: orError } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .or('work_status.eq.unsorted,work_status.is.null');

    if (orError) console.error("OR Query Error:", orError);
    else console.log(`OR Query (unsorted + null) Count: ${orCount}`);
}

run();
