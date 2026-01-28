
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
    console.log('--- HML Download Simulation (V2 Debug) ---');

    // 1. Fetch a known Manual Capture question (from previous debug run)
    // ID: 03d3b824-2bb4-4df3-b0dd-c4c37c215e5c
    const targetId = '03d3b824-2bb4-4df3-b0dd-c4c37c215e5c';
    console.log(`Fetching specific question: ${targetId}`);

    const { data: q, error: qError } = await supabase
        .from('questions')
        .select('*')
        .eq('id', targetId)
        .single();

    if (qError) { console.error(qError); return; }

    console.log(`Question Content XML Preview: ${q.content_xml?.substring(0, 100)}...`);

    // Check if it's the custom binary format
    if (q.content_xml && q.content_xml.startsWith('<?antigravity-binaries')) {
        console.log('!!! DETECTED CUSTOM BINARY FORMAT !!!');
        const match = q.content_xml.match(/data="([^"]+)"/);
        if (match) {
            const b64 = match[1];
            try {
                const decoded = Buffer.from(b64, 'base64').toString('utf-8');
                console.log('Decoded Data Structure:', decoded.substring(0, 200) + '...');
                try {
                    const json = JSON.parse(decoded);
                    // Print first item structure fully
                    if (Array.isArray(json) && json.length > 0) {
                        const item = json[0];
                        console.log('JSON Item Keys:', Object.keys(item));
                        // Print everything except data
                        const preview = { ...item, data: '...truncated...' };
                        console.log('JSON Item Preview:', JSON.stringify(preview, null, 2));
                    }
                } catch {
                    console.log('Decoded data is NOT JSON.');
                }
            } catch (e) {
                console.error('Failed to decode base64 data:', e);
            }
        }
    }

    const { data: images, error: imgError } = await supabase
        .from('question_images')
        .select('*')
        .eq('question_id', targetId);

    if (imgError) { console.error(imgError); return; }

    console.log(`Found ${images?.length} images.`);

    // 2. Simulate the Logic inside download-hml/route.ts
    const processedImages = await Promise.all((images || []).map(async (img) => {
        console.log(`Processing Image: ${img.original_bin_id}`);
        console.log(`Data Type: ${img.data.substring(0, 30)}...`);

        if (img.data && (img.data.startsWith('http://') || img.data.startsWith('https://'))) {
            try {
                console.log(`   -> Attempting Fetch: ${img.data}`);
                const response = await fetch(img.data);
                console.log(`   -> Fetch Status: ${response.status} ${response.statusText}`);

                if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);

                const buffer = await response.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');
                console.log(`   -> Conversion Success! Base64 Prefix: ${base64.substring(0, 20)}...`);
                return { ...img, data: base64 };
            } catch (e: any) {
                console.error(`   -> FETCH FAILED:`, e.message);
                // The current API code returns 'img' here, effectively leaving the URL in place.
                // This would reproduce the bug if fetch fails.
                return img;
            }
        } else {
            console.log(`   -> Already Base64 (or unrecognized)`);
        }
        return img;
    }));

    // 3. Simulate Logic: Transform antigravity-binaries into HML Body
    const { getImageDimensions } = await import('./src/lib/image-utils');
    let contentXml = q.content_xml || '';

    if (contentXml.includes('<?antigravity-binaries') || contentXml.startsWith('<?antigravity-binaries')) {
        console.log('\n[Sim] Transforming antigravity-binaries...');
        if (processedImages.length > 0) {
            processedImages.sort((a, b) => a.original_bin_id.localeCompare(b.original_bin_id));
            let newBodyXml = '';
            for (const img of processedImages) {
                let width = 10000;
                let height = 10000;
                try {
                    const buffer = Buffer.from(img.data, 'base64');
                    const dims = getImageDimensions(buffer);
                    if (dims) {
                        width = Math.round(dims.width * 75);
                        height = Math.round(dims.height * 75);
                        console.log(`[Sim] Measured Img ${img.original_bin_id}: ${dims.width}x${dims.height} (${width}x${height} HwpUnit)`);
                    }
                } catch (e) { console.error('Measure failed', e); }

                newBodyXml += `<P ParaShape="0" Style="0"><TEXT><CHAR><PICTURE BinItem="${img.original_bin_id}" Width="${width}" Height="${height}" TreatAsChar="true"><SHAPEOBJECT Width="${width}" Height="${height}"/></PICTURE></CHAR></TEXT></P>`;
            }
            contentXml = newBodyXml;
        } else {
            contentXml = `<P><TEXT><CHAR>No Images</CHAR></TEXT></P>`;
        }
    }
    console.log('[Sim] Transformed Content XML (Preview):', contentXml.substring(0, 200) + '...');

    // 4. Generate HML
    console.log('\nGenerating HML...');
    const { generateHmlFromTemplate } = await import('./src/lib/hml-v2/generator');

    // Minimal template
    const mockTemplate = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?><HWPML Style="embed" Version="2.11"><HEAD SecCnt="1"><DOCSETTING><BEGINNUMBER Endnote="1" Equation="1" Footnote="1" Page="1" Picture="0" Table="1"/></DOCSETTING><DOCSUMMARY></DOCSUMMARY><MAPPINGTABLE></MAPPINGTABLE></HEAD><BODY><SECTION>{{CONTENT_HERE}}</SECTION></BODY><TAIL></TAIL></HWPML>`;

    const result = generateHmlFromTemplate(mockTemplate, [{
        question: { ...q, content_xml: contentXml },
        images: processedImages
    }]);

    console.log('\n--- Generator Result Inspection ---');
    const binDataList = result.hmlContent.match(/<BINDATALIST[\s\S]*?<\/BINDATALIST>/);
    console.log('BINDATALIST:', binDataList ? binDataList[0] : 'MISSING');

    const binDataStorage = result.hmlContent.match(/<BINDATASTORAGE[\s\S]*?<\/BINDATASTORAGE>/);
    if (binDataStorage) {
        // Check content inside
        const content = binDataStorage[0];
        const hasUrl = content.includes('http://') || content.includes('https://');
        const hasBase64 = content.includes('iVBORw0KGgo'); // Common PNG header start
        console.log(`BINDATASTORAGE contains URL? ${hasUrl ? 'YES (FAILURE)' : 'NO'}`);
        console.log(`BINDATASTORAGE contains Base64? ${hasBase64 ? 'YES' : 'NO'}`);
        console.log('Snippet:', content.substring(0, 200));
    } else {
        console.log('BINDATASTORAGE: MISSING');
    }
}

run().catch(console.error);
