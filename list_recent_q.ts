
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual env parsing
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) envVars[key.trim()] = val.trim();
});

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('--- Listing Recent 10 Questions ---');

    const { data: questions, error: qError } = await supabase
        .from('questions')
        .select('id, content_xml, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    if (qError) { console.error(qError); return; }

    questions.forEach((q, idx) => {
        const isCustom = q.content_xml?.includes('<?antigravity-binaries');
        console.log(`[${idx}] ID: ${q.id} | CustomXML: ${isCustom} | ContentLen: ${q.content_xml?.length}`);
    });
}

run().catch(console.error);
