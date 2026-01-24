import { createClient } from '@supabase/supabase-js';
import { renderMathToSvg } from './src/lib/math-renderer.ts';
import { DOMParser } from 'xmldom';
import * as fs from 'fs';
import * as path from 'path';

// Manual env parsing to avoid library dependency
const envContent = fs.readFileSync('.env.local', 'utf-8');
const env: any = {};
envContent.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k && v) env[k.trim()] = v.trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function repairExistingQuestions() {
    console.log("=== AUTO-REPAIR MODE: Total Equation Restoration (V23) ===");

    const { data: questions, error } = await supabase
        .from('questions')
        .select('id, content_xml')
        .order('created_at', { ascending: false })
        .limit(100);

    if (error || !questions) {
        console.error("DB Fetch Error:", error);
        return;
    }

    console.log(`Checking ${questions.length} questions...`);

    for (const q of questions) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(q.content_xml, 'text/xml');
        const equations = doc.getElementsByTagName('EQUATION');

        if (equations.length === 0) continue;

        console.log(`\nRepairing Q_ID: ${q.id} (${equations.length} eq templates found)`);

        for (let i = 0; i < equations.length; i++) {
            const eq = equations[i];
            const scriptNode = eq.getElementsByTagName('SCRIPT')[0];
            const script = (scriptNode?.textContent || eq.textContent || '').trim();

            if (!script) continue;

            // IMPORTANT: V23 Mapping is MATH_IDX
            const binId = `MATH_${i}`;

            try {
                const svg = await renderMathToSvg(script);
                const b64 = Buffer.from(svg).toString('base64');

                // V23 Bulletproof: Delete old record first to avoid conflict/duplication
                await supabase
                    .from('question_images')
                    .delete()
                    .eq('question_id', q.id)
                    .eq('original_bin_id', binId);

                const { error: insErr } = await supabase
                    .from('question_images')
                    .insert({
                        question_id: q.id,
                        original_bin_id: binId,
                        format: 'svg',
                        data: b64,
                        size_bytes: svg.length,
                        storage_path: `/math/q_${q.id}_m${i}.svg`
                    });

                if (insErr) {
                    // Fallback for missing storage_path column
                    await supabase
                        .from('question_images')
                        .insert({
                            question_id: q.id,
                            original_bin_id: binId,
                            format: 'svg',
                            data: b64,
                            size_bytes: svg.length
                        });
                }
                console.log(`  - RESTORED: ${binId}`);
            } catch (e) {
                console.error(`  - CRASH ${binId}:`, e.message);
            }
        }
    }

    console.log("\n=== TOTAL RESTORATION COMPLETE ===");
}

repairExistingQuestions();
