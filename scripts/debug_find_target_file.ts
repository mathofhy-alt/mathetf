
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
    console.log("--- Searching for Target File in Database ---");

    const { data: files, error } = await supabase
        .from('files')
        .select('id, name, created_at')
        .or('name.ilike.%테스트%,name.ilike.%test%')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching files:", error);
        return;
    }

    if (files.length === 0) {
        console.warn("No files found matching '테스트' or 'test'.");
    } else {
        console.log(`Found ${files.length} matching files:`);
        files.forEach(f => {
            console.log(`- ID: ${f.id} | Name: ${f.name} | Created: ${f.created_at}`);
        });
    }

    // Also check for recent files in general
    console.log("\n--- Most Recent 5 Files ---");
    const { data: recentFiles } = await supabase
        .from('files')
        .select('id, name, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    recentFiles?.forEach(f => {
        console.log(`- ID: ${f.id} | Name: ${f.name} | Created: ${f.created_at}`);
    });
}

run();
