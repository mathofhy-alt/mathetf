
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
    console.error("Failed to load Supabase credentials from .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const qId = '36d67021-925b-45f2-8c05-9b17759ed0ff'; // From prev diagnostic
    console.log(`Checking question_images for ID: ${qId}`);

    const { data: images, error } = await supabase
        .from('question_images')
        .select('*')
        .eq('question_id', qId);

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${images?.length} images.`);
    images?.forEach((img, i) => {
        console.log(`[${i}] ID: ${img.id}, BinID: ${img.original_bin_id}, Format: ${img.format}, Size: ${img.size_bytes}`);
    });
}

run();
