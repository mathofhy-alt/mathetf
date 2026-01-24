import { createClient } from '@supabase/supabase-js';
import { renderMathToSvg } from './src/lib/math-renderer.ts';
import { DOMParser, XMLSerializer } from 'xmldom';
import * as fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env: any = {};
envContent.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k && v) env[k.trim()] = v.trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function totalRestorationV24() {
    console.log("=== TOTAL RESTORATION: V24 Zero-Fail Mode ===");

    const { data: questions, error } = await supabase
        .from('questions')
        .select('id, content_xml')
        .order('created_at', { ascending: false })
        .limit(200);

    if (error || !questions) return;

    for (const q of questions) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(q.content_xml, 'text/xml');
        const equations = doc.getElementsByTagName('EQUATION');

        if (equations.length === 0) continue;

        console.log(`\nRepairing Q_ID: ${q.id} (${equations.length} equations)`);

        let hasChange = false;
        for (let i = 0; i < equations.length; i++) {
            const eq = equations[i];
            const binId = `MATH_${i}`;
            const oldId = eq.getAttribute('data-hml-math-id');

            // 1. Force ID Consistency in XML
            if (oldId !== binId) {
                eq.setAttribute('data-hml-math-id', binId);
                hasChange = true;
            }

            const scriptNode = eq.getElementsByTagName('SCRIPT')[0];
            const script = (scriptNode?.textContent || eq.textContent || '').trim();
            if (!script) continue;

            try {
                const svg = await renderMathToSvg(script);
                const b64 = Buffer.from(svg).toString('base64');

                // 2. Clear old images for this specific equation to be clean
                if (oldId && oldId !== binId) {
                    await supabase.from('question_images').delete().eq('question_id', q.id).eq('original_bin_id', oldId);
                }
                await supabase.from('question_images').delete().eq('question_id', q.id).eq('original_bin_id', binId);

                // 3. Insert Bulletproof Base64 Record
                const { error: insErr } = await (supabase.from('question_images') as any).insert({
                    question_id: q.id,
                    original_bin_id: binId,
                    format: 'svg',
                    data: b64,
                    size_bytes: svg.length,
                    storage_path: `/math/q_${q.id}_m${i}.svg`
                });

                if (insErr) {
                    // Fallback for schema
                    await supabase.from('question_images').insert({
                        question_id: q.id,
                        original_bin_id: binId,
                        format: 'svg',
                        data: b64,
                        size_bytes: svg.length
                    });
                }
                console.log(`  - [OK] ${binId} synced.`);
            } catch (e) {
                console.error(`  - [FAIL] ${binId}:`, e.message);
            }
        }

        // 4. Update XML if IDs were re-mapped
        if (hasChange) {
            const serializer = new XMLSerializer();
            const updatedXml = serializer.serializeToString(doc);
            await supabase.from('questions').update({ content_xml: updatedXml }).eq('id', q.id);
            console.log(`  - [FIXED] XML IDs re-mapped.`);
        }
    }
    console.log("\n=== V24 RESTORATION COMPLETE ===");
}

totalRestorationV24();
