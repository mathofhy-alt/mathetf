
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load env
try {
    const envPath = path.join(process.cwd(), '.env.local');
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
    });
} catch (e) { }

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    const qid = 'b040946c-737b-48ef-8fab-91eaf6e3baf2';
    const { data, error } = await supabase
        .from('questions')
        .select('content_xml')
        .eq('id', qid)
        .single();

    if (error) {
        console.error('DB Error:', error);
        return;
    }

    const xml = data.content_xml;
    console.log('Fetched XML length:', xml.length);
    fs.writeFileSync('question_raw.xml', xml);
    console.log('Saved to question_raw.xml');

    // Quick regex check for SHAPEOBJECT
    const shapes = xml.match(/<SHAPEOBJECT[^>]*>/g);
    if (shapes) {
        console.log('--- Shape Objects ---');
        shapes.forEach(s => console.log(s));
    }
}

main();
