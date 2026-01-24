import { createClient } from '@supabase/supabase-js';
import { renderMathToSvg } from './src/lib/math-renderer.ts';
import * as dotenv from 'dotenv';
import { DOMParser } from 'xmldom';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function repairExistingQuestions() {
    console.log("=== AUTO-REPAIR MODE: Equation Restoration (V23) ===");

    // 1. Fetch questions that might have equations but no SVG records
    const { data: questions, error } = await supabase
        .from('questions')
        .select('id, content_xml')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error || !questions) {
        console.error("DB Fetch Error:", error);
        return;
    }

    console.log(`Checking ${questions.length} recent questions...`);

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

            const binId = `MATH_${i}`;
            console.log(`- Rendering Eq[${i}] -> ${binId}`);

            try {
                const svg = await renderMathToSvg(script);
                const b64 = Buffer.from(svg).toString('base64');

                // Upsert into question_images
                const { error: insErr } = await supabase
                    .from('question_images')
                    .upsert({
                        question_id: q.id,
                        original_bin_id: binId,
                        format: 'svg',
                        data: b64,
                        size_bytes: svg.length
                    }, { onConflict: 'question_id,original_bin_id' });

                if (insErr) console.error(`  - Update Error for ${binId}:`, insErr.message);
                else console.log(`  - SUCCESS: ${binId} restored.`);
            } catch (e) {
                console.error(`  - Crash for ${binId}:`, e.message);
            }
        }
    }

    console.log("\n=== REPAIR COMPLETE ===");
}

repairExistingQuestions();
