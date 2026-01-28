
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
    const id = '36ac177a-dd62-40db-9212-c2c09bc60a58';
    console.log(`Inspecting Question: ${id}`);

    const { data: q, error: qError } = await supabase
        .from('questions')
        .select('*')
        .eq('id', id)
        .single();

    if (qError) { console.error('Question Fetch Error:', qError); return; }
    console.log('Created At:', q.created_at);
    console.log('Content XML:', q.content_xml);

    const { data: images, error: imgError } = await supabase
        .from('question_images')
        .select('*')
        .eq('question_id', id);

    if (imgError) console.error('Image Fetch Error:', imgError);
    console.log(`Images found in DB: ${images?.length}`);

    if (images && images.length > 0) {
        images.forEach(img => {
            console.log(` - Img ${img.id} (BinID: ${img.original_bin_id}) Data len: ${img.data?.length}`);
        });
    } else {
        console.log('!!! NO IMAGES FOUND IN DB !!!');
        // Check if maybe format is different in content_xml
        const match = q.content_xml?.match(/data="([^"]+)"/);
        if (match) {
            try {
                const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
                console.log('Decoded content_xml internal data:', decoded.substring(0, 300));
            } catch (e) {
                console.log('Failed to decode internal data');
            }
        }
    }
}

run().catch(console.error);
