
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Config
const FILE_ID = '4eee3c21-616e-412d-9c57-5aea732bb9c8';
const BASE_IMAGE_DIR = 'hwpx-python-tool/question_images_v29';

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

async function uploadImage(qId: string, binId: string, filePath: string) {
    if (!fs.existsSync(filePath)) return;

    const buffer = fs.readFileSync(filePath);
    const b64 = buffer.toString('base64');

    const { data: existing } = await supabase
        .from('question_images')
        .select('id')
        .eq('question_id', qId)
        .eq('original_bin_id', binId)
        .single();

    if (existing) {
        await supabase
            .from('question_images')
            .update({ data: b64, size_bytes: buffer.length, format: 'png' })
            .eq('id', existing.id);
    } else {
        await supabase
            .from('question_images')
            .insert({
                question_id: qId,
                original_bin_id: binId,
                data: b64,
                size_bytes: buffer.length,
                format: 'png'
            });
    }
}

async function migrate() {
    console.log(`--- V29 Dual Image Migration (Main & Comment) ---`);

    const { data: questions } = await supabase
        .from('questions')
        .select('id, question_index')
        .eq('file_id', FILE_ID);

    if (!questions) return;

    for (const q of questions) {
        const qStr = String(q.question_index).padStart(3, '0');
        const mainPath = path.join(BASE_IMAGE_DIR, 'main', `q_${qStr}.png`);
        const commentPath = path.join(BASE_IMAGE_DIR, 'comment', `q_${qStr}.png`);

        if (fs.existsSync(mainPath)) {
            console.log(`Uploading Main: Q${q.question_index}...`);
            await uploadImage(q.id, 'WHOLE_V29_MAIN', mainPath);
        }

        if (fs.existsSync(commentPath)) {
            console.log(`Uploading Comment: Q${q.question_index}...`);
            await uploadImage(q.id, 'WHOLE_V29_COMMENT', commentPath);
        }
    }

    console.log(`\n--- V29 Migration Complete ---`);
}

migrate();
