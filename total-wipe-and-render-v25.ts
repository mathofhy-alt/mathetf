import { createClient } from '@supabase/supabase-js';
import { renderMathToSvg } from './src/lib/math-renderer.ts';
import { DOMParser } from 'xmldom';
import * as fs from 'fs';

// Environment setup
const envContent = fs.readFileSync('.env.local', 'utf-8');
const env: any = {};
envContent.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k && v) env[k.trim()] = v.trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function totalWipeAndRenderV25() {
    console.log("=== TOTAL WIPE AND RE-RENDER: V25 User-Wash Engine ===");

    // 1. Clear ALL math images from question_images (where original_bin_id starts with MATH_)
    console.log("Step 1: Clearing existing math images...");
    const { error: delErr } = await supabase
        .from('question_images')
        .delete()
        .like('original_bin_id', 'MATH_%');

    if (delErr) {
        console.error("  - Failed to clear images:", delErr.message);
        return;
    }
    console.log("  - Math images cleared.");

    // 2. Fetch all questions to re-render
    const { data: questions, error } = await supabase
        .from('questions')
        .select('id, content_xml')
        .order('created_at', { ascending: false });

    if (error || !questions) {
        console.error("DB Fetch Error:", error);
        return;
    }

    console.log(`Step 2: Re-rendering ${questions.length} questions...`);

    for (const q of questions) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(q.content_xml, 'text/xml');
        const equations = doc.getElementsByTagName('EQUATION');

        if (equations.length === 0) continue;

        console.log(`\nRendering Q_ID: ${q.id} (${equations.length} eq)`);

        for (let i = 0; i < equations.length; i++) {
            const eq = equations[i];
            const scriptNode = eq.getElementsByTagName('SCRIPT')[0];
            const script = (scriptNode?.textContent || eq.textContent || '').trim();

            if (!script) continue;

            const binId = `MATH_${i}`;

            try {
                // The new wash function is already inside renderMathToSvg (via hwp-to-latex.ts)
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
                    await supabase.from('question_images').insert({
                        question_id: q.id,
                        original_bin_id: binId,
                        format: 'svg',
                        data: b64,
                        size_bytes: svg.length
                    });
                }
                console.log(`  - [DONE] ${binId}`);
            } catch (e) {
                console.error(`  - [FAIL] ${binId}:`, e.message);
            }
        }
    }

    console.log("\n=== V25 RE-RENDER COMPLETE ===");
}

totalWipeAndRenderV25();
