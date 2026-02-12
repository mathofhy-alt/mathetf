
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
    console.log("--- RLS & Policy Diagnostic ---");

    // We can check if RPC can fetch policy info or if we can test performance difference

    const startService = Date.now();
    await supabase.from('questions').select('id').limit(10);
    const serviceTime = Date.now() - startService;
    console.log(`Service Role Index Fetch: ${serviceTime}ms`);

    // Note: I can't easily test Anon without a token, but let's check the schema if possible
    console.log("Checking if there are any obvious heavy subqueries in select...");
}

run();
