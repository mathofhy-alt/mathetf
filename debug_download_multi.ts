
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
    console.log('--- HML Download Simulation (Multi-Question) ---');

    // 1. Fetch 6 Manual Capture questions
    const { data: questions, error: qError } = await supabase
        .from('questions')
        .select('*')
        .ilike('content_xml', '%<?antigravity-binaries%')
        .order('created_at', { ascending: false })
        .limit(6);

    if (qError) { console.error(qError); return; }
    console.log(`Fetched ${questions?.length} manual capture questions.`);

    if (!questions || questions.length === 0) return;

    const ids = questions.map(q => q.id);

    // 2. Fetch images
    const { data: images, error: imgError } = await supabase
        .from('question_images')
        .select('*')
        .in('question_id', ids);

    if (imgError) { console.error(imgError); return; }
    console.log(`Fetched ${images?.length} images total.`);

    // 3. Simulate Sequential Fetch Logic
    const imageList = images || [];
    const processedImages: any[] = [];

    console.log('Starting Sequential Fetch...');
    const start = Date.now();

    for (const img of imageList) {
        if (img.data && (img.data.startsWith('http://') || img.data.startsWith('https://'))) {
            try {
                // console.log(`[Sim] Fetching: ${img.original_bin_id}`);
                const response = await fetch(img.data);

                if (!response.ok) {
                    console.error(`[Sim] Failed to fetch ${img.data}: ${response.status}`);
                    continue;
                }

                const contentType = response.headers.get('content-type');
                if (contentType && !contentType.startsWith('image/')) {
                    console.error(`[Sim] Invalid content-type for ${img.data}: ${contentType}`);
                    continue;
                }

                const buffer = await response.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');

                if (base64.length < 100) {
                    console.warn(`[Sim] Image data too short: ${img.original_bin_id}`);
                    continue;
                }

                processedImages.push({ ...img, data: base64 });
                process.stdout.write('.'); // Progress dot
            } catch (e: any) {
                console.error(`[Sim] Exception fetching ${img.original_bin_id}:`, e.message);
                continue;
            }
        } else {
            processedImages.push(img);
        }
    }

    const duration = Date.now() - start;
    console.log(`\n\nFetched ${processedImages.length}/${imageList.length} images in ${duration}ms`);

    // Group
    const imagesByQuestion = new Map<string, any[]>();
    for (const img of processedImages) {
        const qId = img.question_id;
        if (!imagesByQuestion.has(qId)) {
            imagesByQuestion.set(qId, []);
        }
        imagesByQuestion.get(qId)?.push(img);
    }

    // 4. Simulate Helper Imports (Mocking)
    const { getImageDimensions } = await import('./src/lib/image-utils');

    // 5. Transformation Logic
    console.log('\nStarting Transformation...');
    for (const q of questions) {
        let contentXml = q.content_xml || '';
        const qImages = imagesByQuestion.get(q.id) || [];

        console.log(`Question ${q.id} (Images: ${qImages.length})`);

        if (contentXml.includes('<?antigravity-binaries') || contentXml.startsWith('<?antigravity-binaries')) {
            // [FALLBACK SIMULATION]
            if (qImages.length === 0) {
                const match = contentXml.match(/data="([^"]+)"/);
                if (match) {
                    try {
                        const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
                        const json = JSON.parse(decoded);
                        if (Array.isArray(json)) {
                            console.log(`   [Sim] Fallback: Extracted ${json.length} embedded images from XML`);
                            json.forEach((item: any) => {
                                qImages.push({
                                    id: `embed_${q.id}_${item.id}`,
                                    original_bin_id: `EMBED_${item.id}`,
                                    data: item.data
                                });
                            });
                        }
                    } catch (e) {
                        console.error('Fallback failed', e);
                    }
                }
            }

            if (qImages.length > 0) {
                // Logic...
                console.log('   -> Transformation ACTIVE. Building Body...');
                let newBodyXml = '';
                for (const img of qImages) {
                    let buffer = Buffer.from(img.data, 'base64');
                    const dims = getImageDimensions(buffer);
                    if (dims) {
                        console.log(`      Img ${img.id}: ${dims.width}x${dims.height}`);
                    } else {
                        console.log(`      Img ${img.id}: Dims FAIL`);
                    }
                }
                console.log('   -> DONE');
            } else {
                console.log('   -> NO IMAGES! Result: "No Images"');
            }
        } else {
            console.log('   -> Not custom format. Skipping.');
        }
    }
}

run().catch(console.error);
