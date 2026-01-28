
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load env
const envLocal = fs.readFileSync('.env.local', 'utf-8');
const envConfig = dotenv.parse(envLocal);

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    const ids = [
        'b040946c-737b-48ef-8fab-91eaf6e3baf2',
        '6e38dd9d-d62f-4fc9-823c-65b58b7993bb'
    ];

    console.log(`Inspecting ${ids.length} questions...`);

    const { data: questions, error } = await supabase
        .from('questions')
        .select('id, content_xml, fragment_xml')
        .in('id', ids);

    if (error) {
        console.error('Error:', error);
        return;
    }

    questions.forEach(q => {
        console.log(`\n=== Question ${q.id} ===`);
        console.log('Starts with antigravity?', q.content_xml?.startsWith('<?antigravity'));
        console.log('Includes antigravity?', q.content_xml?.includes('<?antigravity'));
        console.log('Content XML Preview:', q.content_xml?.substring(0, 200));
        if (q.content_xml && q.content_xml.length > 200) console.log('... (truncated)');
    });
}

inspect();
