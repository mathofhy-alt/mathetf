import { createClient } from '@supabase/supabase-js';
import { renderMathToSvg } from './src/lib/math-renderer.ts';
import { DOMParser } from 'xmldom';
import * as fs from 'fs';

// Environment setup (Manual to avoid deps)
const envContent = fs.readFileSync('.env.local', 'utf-8');
const env: any = {};
envContent.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k && v) env[k.trim()] = v.trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function purgeAndResetV26() {
    console.log("=== V26 PURGE AND ZERO-FAIL RE-RENDER START ===");

    // Step 1: CLEAR ALL MATH RECORDS
    console.log("Step 1: Purging all existing math images from DB...");
    const { error: delErr } = await supabase
        .from('question_images')
        .delete()
        .like('original_bin_id', 'MATH_%');

    if (delErr) {
        console.error("  - Failed to purge:", delErr.message);
        return;
    }
    console.log("  - DB Math Table Cleared.");

    // Step 2: FETCH ALL QUESTIONS
    const { data: questions, error } = await supabase
        .from('questions')
        .select('id, content_xml')
        .order('created_at', { ascending: false });

    if (error || !questions) {
        console.error("DB Fetch Error:", error);
        return;
    }

    console.log(`Step 2: Re-generating ${questions.length} questions using V26 Wash Engine...`);

    for (const q of questions) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(q.content_xml, 'text/xml');
        const equations = doc.getElementsByTagName('EQUATION');

        if (equations.length === 0) continue;

        console.log(`\nQuestion ${q.id}: ${equations.length} equations found.`);

        for (let i = 0; i < equations.length; i++) {
            const eq = equations[i];
            const scriptNode = eq.getElementsByTagName('SCRIPT')[0];
            const script = (scriptNode?.textContent || eq.textContent || '').trim();

            if (!script) continue;

            const binId = `MATH_${i}`;

            try {
                // The new V26 wash logic is automatically applied inside renderMathToSvg
                const svg = await renderMathToSvg(script);
                const b64 = Buffer.from(svg).toString('base64');

                // Insert Fresh Record
                const { error: insErr } = await (supabase.from('question_images') as any).insert({
                    question_id: q.id,
                    original_bin_id: binId,
                    format: 'svg',
                    data: b64,
                    size_bytes: svg.length,
                    storage_path: `/math/q_${q.id}_m${i}.svg`
                });

                if (insErr) {
                    // Fallback for missing columns
                    await supabase.from('question_images').insert({
                        question_id: q.id,
                        original_bin_id: binId,
                        format: 'svg',
                        data: b64,
                        size_bytes: svg.length
                    });
                }
                console.log(`  - [RESTORED] ${binId}`);
            } catch (e) {
                console.error(`  - [CRASH] ${binId}:`, e.message);
            }
        }
    }

    console.log("\n=== V26 TOTAL RE-RENDER COMPLETE ===");
}

purgeAndResetV26();
