
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
    console.log('--- HML Image Flow Debugger ---');

    // 1. Check recent questions
    console.log('Fetching most recent 3 questions...');
    const { data: questions, error: qError } = await supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);

    if (qError) {
        console.error('Failed to fetch questions:', qError);
        return;
    }

    if (!questions || questions.length === 0) {
        console.warn('No questions found in DB.');
        return;
    }

    for (const q of questions) {
        console.log(`\nQuestion ID: ${q.id} (Created: ${q.created_at})`);
        console.log(`  Content XML (Start): ${q.content_xml?.substring(0, 100)}...`);

        // 2. Check images for this question
        const { data: images, error: imgError } = await supabase
            .from('question_images')
            .select('*')
            .eq('question_id', q.id);

        if (imgError) {
            console.error('  Failed to fetch images:', imgError);
            continue;
        }

        console.log(`  Image Count: ${images?.length}`);

        if (images && images.length > 0) {
            for (const img of images) {
                console.log(`    Image ID: ${img.id}`);
                console.log(`    Original BinID: ${img.original_bin_id}`);
                console.log(`    Format: ${img.format}`);
                console.log(`    Size: ${img.size_bytes} bytes`);

                const dataPreview = img.data.substring(0, 50);
                const isZlib = dataPreview.startsWith('eJ') || dataPreview.includes('base64,eJ');
                console.log(`    Data Start: ${dataPreview}...`);
                console.log(`    Is Zlib Detected (eJ): ${isZlib}`);
            }
        } else {
            console.warn('  [WARNING] No images found for this question! Ingest might still be failing.');
        }

        // 3. Simulate Generator Output (Snippet)
        if (images && images.length > 0) {
            const { generateHmlFromTemplate } = await import('./src/lib/hml-v2/generator');
            // Mock template
            const mockTemplate = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<HWPML Style="embed" Version="2.11">
<HEAD SecCnt="1">
<DOCSETTING>
<BEGINNUMBER Endnote="1" Equation="1" Footnote="1" Page="1" Picture="0" Table="1"/>
</DOCSETTING>
<DOCSUMMARY>
</DOCSUMMARY>
<MAPPINGTABLE>
</MAPPINGTABLE>
</HEAD>
<BODY>
<SECTION>
{{CONTENT_HERE}}
</SECTION>
</BODY>
<TAIL>
</TAIL>
</HWPML>`;

            const result = generateHmlFromTemplate(mockTemplate, [{
                question: q,
                images: images
            }]);

            console.log('\n  [Generator Output Snippet - HEAD]');
            const headMatch = result.hmlContent.match(/<BINDATALIST[\s\S]*?<\/BINDATALIST>/);
            console.log(headMatch ? headMatch[0] : '  NO BINDATALIST FOUND');

            console.log('\n  [Generator Output Snippet - TAIL]');
            const tailMatch = result.hmlContent.match(/<BINDATASTORAGE[\s\S]*?<\/BINDATASTORAGE>/);
            if (tailMatch) {
                // Truncate long data
                const snippet = tailMatch[0].replace(/>([^<]{50})[^<]+<\/BINDATA>/g, '>$1...<\/BINDATA>');
                console.log(snippet);
            } else {
                console.log('  NO BINDATASTORAGE FOUND');
            }
        }
    }
}

run().catch(console.error);
