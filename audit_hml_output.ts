// @ts-nocheck
const fs = require('fs');
const path = require('path');
// Import generator.ts using require (ts-node should handle)
const { generateHmlFile } = require('./src/lib/hml-v2/generator');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
// Rename to avoid conflict
const { DOMParser: XDOMParser, XMLSerializer: XXMLSerializer } = require('xmldom');

// Polyfill
global.DOMParser = XDOMParser;
global.XMLSerializer = XXMLSerializer;

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
    console.log('[AUDIT] Starting HML Generation Audit (CJS)...');

    // 1. Fetch REAL Data
    const { data: questions } = await supabase
        .from('questions')
        .select('*')
        .limit(2);

    if (!questions || questions.length === 0) {
        console.error('[AUDIT] No questions found.');
        return;
    }

    const { data: images } = await supabase
        .from('question_images')
        .select('*')
        .in('question_id', questions.map(q => q.id));

    console.log(`[AUDIT] Fetched ${questions.length} Questions, ${images?.length} Images.`);

    // 2. Prepare Map
    const imagesByQuestion = new Map();
    questions.forEach(q => {
        const qImages = images?.filter(img => img.question_id === q.id) || [];
        const processedImages = qImages.map(img => {
            if (!img.image_data) {
                img.image_data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKwMTQAAAABJRU5ErkJggg==';
                img.image_size = 100;
                img.format = img.format || 'png';
            }
            return img;
        });
        imagesByQuestion.set(q.id, processedImages);
    });

    // 3. Load Template
    const templatePath = path.join(process.cwd(), 'hml v2-test-tem.hml');
    if (!fs.existsSync(templatePath)) {
        console.error('[AUDIT] Template not found:', templatePath);
        return;
    }
    const templateContent = fs.readFileSync(templatePath, 'utf8');

    // 4. Generate
    console.log('[AUDIT] Generating HML...');
    try {
        const result = await generateHmlFile(templateContent, questions, imagesByQuestion);

        let finalHml = '';
        if (typeof result === 'string') finalHml = result;
        else if (result && result.hml) finalHml = result.hml;
        else {
            console.error('[AUDIT] Unknown result format:', result);
            return;
        }

        const dumpPath = path.join(process.cwd(), 'audit_output.hml');
        fs.writeFileSync(dumpPath, finalHml, 'utf8');
        console.log(`[AUDIT] Wrote output to ${dumpPath}`);

        console.log('--- ANALYSIS ---');

        const mappingTable = finalHml.match(/<MAPPINGTABLE[^>]*>([\s\S]*?)<\/MAPPINGTABLE>/);
        if (mappingTable) {
            console.log('[PASS] MAPPINGTABLE found.');
            const bindataList = mappingTable[1].match(/<BINDATALIST[^>]*>([\s\S]*?)<\/BINDATALIST>/);
            if (bindataList) {
                console.log('[PASS] BINDATALIST found inside MAPPINGTABLE.');
                const listSnippet = bindataList[1].substring(0, 500).replace(/\n/g, ' ');
                console.log('  List Snippet:', listSnippet);

                const binItems = bindataList[1].match(/<BINITEM[^>]*>/g);
                binItems?.forEach((bi, i) => { if (i < 5) console.log('  Item:', bi); });
            } else {
                console.error('[FAIL] BINDATALIST NOT inside MAPPINGTABLE!');
                const looseList = finalHml.match(/<BINDATALIST[^>]*>/);
                if (looseList) console.log('  [INFO] BINDATALIST exists loosely:', looseList[0]);
            }
        } else {
            console.error('[FAIL] MAPPINGTABLE NOT FOUND!');
        }

        const storageMatch = finalHml.match(/<BINDATASTORAGE[^>]*>([\s\S]*?)<\/BINDATASTORAGE>/);
        if (storageMatch) {
            console.log('[PASS] BINDATASTORAGE found.');
            console.log('  Attributes:', finalHml.match(/<BINDATASTORAGE[^>]*>/)?.[0]);
            if (storageMatch[0].includes('Encoding=')) {
                console.error('[FAIL] STORAGE has Encoding attribute!');
            }
            const binDatas = storageMatch[1].match(/<BINDATA[^>]*>/g);
            binDatas?.forEach((bd, i) => {
                if (i < 5) console.log('  Data:', bd);
            });
        }

        const imageTags = finalHml.match(/<IMAGE[^>]*>/g);
        console.log(`[AUDIT] Found ${imageTags?.length} IMAGE tags.`);
        imageTags?.forEach((tag, i) => {
            if (i < 5) console.log(`  Image ${i + 1}: ${tag}`);
        });

    } catch (e) {
        console.error('[AUDIT] Generation Failed:', e);
    }
}

runAudit();
