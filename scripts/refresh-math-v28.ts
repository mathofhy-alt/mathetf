
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { parseQuestionsFromHwpx } from '../src/lib/hwpx/parser.ts';
import { renderMathToSvg } from '../src/lib/math-renderer.ts';

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
const STORAGE_BUCKET = 'hwpx';

async function run() {
    console.log("--- V28 Math Refresh Migration (Optimized) ---");

    // 1. Fetch questions that NEED refresh (either missing scripts OR missing images OR force)
    // For now, let's fetch questions that have scripts but potentially old images.
    // Or just fetch ALL HWPX questions.

    const { data: questions, error: qErr } = await supabase
        .from('questions')
        .select('id, file_id, question_index, equation_scripts')
        .order('id', { ascending: true }); // Process ALL questions

    if (qErr) {
        console.error("Error fetching questions:", qErr);
        return;
    }

    console.log(`Processing ${questions.length} questions for 300 DPI Full Refresh...`);
    const BATCH_SIZE = 10;

    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
        const batch = questions.slice(i, i + BATCH_SIZE);
        console.log(`\n--- Processing Batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} questions) ---`);

        for (const q of batch) {
            if (!q.equation_scripts || q.equation_scripts.length === 0) continue;

            console.log(`[Q ${q.id}] Refreshing ${q.equation_scripts.length} math images (300 DPI)...`);

            for (let j = 0; j < q.equation_scripts.length; j++) {
                const script = q.equation_scripts[j];
                try {
                    const svg = await renderMathToSvg(script);
                    const binId = `MATH_${j}`;
                    const b64Data = Buffer.from(svg).toString('base64');

                    // Explicit Select-then-Update/Insert
                    const { data: existingImg } = await supabase
                        .from('question_images')
                        .select('id')
                        .eq('question_id', q.id)
                        .eq('original_bin_id', binId)
                        .single();

                    if (existingImg) {
                        await supabase.from('question_images')
                            .update({
                                data: b64Data,
                                size_bytes: svg.length,
                                format: 'svg'
                            })
                            .eq('id', existingImg.id);
                    } else {
                        await supabase.from('question_images')
                            .insert({
                                question_id: q.id,
                                original_bin_id: binId,
                                format: 'svg',
                                data: b64Data,
                                size_bytes: svg.length
                            });
                    }

                    if (binId === "MATH_1" || binId === "MATH_2") {
                        console.log(`  [Sample Check] ${binId} re-rendered successfully (${svg.length} bytes)`);
                    }
                } catch (renderError) {
                    console.error(`  [Q ${q.id}] Render Error (M${j}):`, renderError);
                }
            }
        }

        // Delay between batches to let HWP/System breathe
        console.log(`  Waiting 3 seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log("\n--- Batch Migration Complete ---");
}

run();
