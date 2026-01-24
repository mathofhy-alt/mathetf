
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Config
const FILE_ID = '4eee3c21-616e-412d-9c57-5aea732bb9c8';
const IMAGE_DIR = 'hwpx-python-tool/question_images_v28';
const TARGET_BIN_ID = 'WHOLE_QUESTION_V28';

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

async function migrate() {
    console.log(`--- Whole-Question Image Migration (V28) ---`);
    console.log(`Target File ID: ${FILE_ID}`);

    // 1. Fetch questions for this file to map index -> id
    const { data: questions, error: qErr } = await supabase
        .from('questions')
        .select('id, question_index')
        .eq('file_id', FILE_ID);

    if (qErr) {
        console.error("Error fetching questions:", qErr);
        return;
    }

    console.log(`Found ${questions.length} questions in DB for this file.`);

    // 2. Loop through local PNG images
    const files = fs.readdirSync(IMAGE_DIR).filter(f => f.startsWith('q_') && f.endsWith('.png') && !f.includes('fail') && !f.includes('debug'));
    console.log(`Found ${files.length} valid images to upload.`);

    for (const fileName of files) {
        const indexMatch = fileName.match(/q_(\d+)\.png/);
        if (!indexMatch) continue;

        const qIndex = parseInt(indexMatch[1], 10);
        const targetQ = questions.find(q => q.question_index === qIndex);

        if (!targetQ) {
            console.warn(`  [Skip] No DB entry for Q_Index ${qIndex} (File: ${fileName})`);
            continue;
        }

        console.log(`  [Processing] Q${qIndex} -> ID: ${targetQ.id}...`);

        try {
            const filePath = path.join(IMAGE_DIR, fileName);
            const imageBuffer = fs.readFileSync(filePath);
            const b64Data = imageBuffer.toString('base64');

            // 3. Upsert into question_images
            // We search by (question_id, original_bin_id)
            const { data: existingImg } = await supabase
                .from('question_images')
                .select('id')
                .eq('question_id', targetQ.id)
                .eq('original_bin_id', TARGET_BIN_ID)
                .single();

            if (existingImg) {
                const { error: upErr } = await supabase
                    .from('question_images')
                    .update({
                        data: b64Data,
                        size_bytes: imageBuffer.length,
                        format: 'png'
                    })
                    .eq('id', existingImg.id);

                if (upErr) throw upErr;
                console.log(`    Updated existing WHOLE_QUESTION entry.`);
            } else {
                const { error: insErr } = await supabase
                    .from('question_images')
                    .insert({
                        question_id: targetQ.id,
                        original_bin_id: TARGET_BIN_ID,
                        format: 'png',
                        data: b64Data,
                        size_bytes: imageBuffer.length
                    });

                if (insErr) throw insErr;
                console.log(`    Inserted new WHOLE_QUESTION entry.`);
            }
        } catch (err) {
            console.error(`    [Error] Q${qIndex}:`, err);
        }
    }

    console.log(`\n--- Migration Complete ---`);
}

migrate();
