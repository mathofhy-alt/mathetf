
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { buildBody } from '../src/lib/hml/body-builder.ts';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager.ts';

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
    console.error("Failed to load Supersbase credentials from .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Checking Latest DB Question for Stowaway Style Data...");

    // Fetch LATEST question regardless of content
    const { data: questions, error } = await supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error || !questions || questions.length === 0) {
        console.log("No questions found.");
        return;
    }

    const q = questions[0];
    console.log(`Analyzing Question ID: ${q.id} (Created: ${q.created_at})`);

    // Check raw XML for tags
    const hasStyles = q.content_xml.includes('ANTIGRAVITY_STYLES');
    console.log(`Raw XML has ANTIGRAVITY_STYLES? ${hasStyles ? '✅ YES' : '❌ NO'}`);
    if (hasStyles) {
        const m = q.content_xml.match(/<!-- ANTIGRAVITY_STYLES: ([\s\S]*?) -->/);
        console.log(`   Style Comment Length: ${m ? m[1].length : 0}`);
        if (m) {
            try {
                const rawStyles = JSON.parse(m[1]);
                const rawIds = rawStyles.map((s: any) => s.id).join(', ');
                console.log(`   [DIAGNOSTIC] Raw Source Style IDs: ${rawIds}`);
            } catch (e) { }
        }
    }

    // SIMULATE BUILD BODY
    console.log("--- Running buildBody on real DB data ---");
    const mockQ = {
        question_number: 1,
        content_xml: q.content_xml,
        binaries: []
    };

    const built = buildBody([mockQ], 0);

    const extractedCount = built.binDataItems.length;
    console.log(`Extracted Images: ${extractedCount}`);

    // [STYLE DIAGNOSTICS]
    const extractedStyles = built.borderFills || [];
    const extractedIds = new Set(extractedStyles.map(s => s.id)); // These are NEW IDs (e.g. 11, 12)
    // Wait. The extractedStyles in built.borderFills have NEW IDs.
    // But we need to know if the OLD IDs were mapped.
    // 'buildBody' does the mapping.
    // We can't easily see the Old IDs here unless we log inside buildBody or reverse engineer.
    // However, we can check the *Resulting* Body IDs.
    // If we see IDs > 4 and NOT in extractedIds, that's a problem?
    // Actually, 'buildBody' forces unknown > 4 to "4".
    // So if we see "4", it might be a fallback (or original 4).
    // If we see ID=11, it is a custom style.

    console.log(`Extracted Styles Count: ${extractedStyles.length}`);
    console.log(`Extracted New IDs: ${Array.from(extractedIds).join(', ')}`);

    // Verify Body References
    const bodyXml = built.combinedBodyPs;
    const usedRefRegex = /(?:BorderFill|BorderFillId)="(\d+)"/gi;
    const usedIds = new Set<string>();
    let m;
    while ((m = usedRefRegex.exec(bodyXml)) !== null) {
        usedIds.add(m[1]);
    }

    console.log(`Used BorderFill IDs in Body: ${Array.from(usedIds).sort((a, b) => Number(a) - Number(b)).join(', ')}`);

    // Analyze Fallback
    const fallbackCount = (bodyXml.match(/(?:BorderFill|BorderFillId)="4"/gi) || []).length;
    console.log(`Total References to ID="4" (Possible Fallback): ${fallbackCount}`);

    // Check for IDs that are NOT 4 and NOT within Extracted Set (and not 0-3)
    const unexplainedIds = Array.from(usedIds).filter(id => {
        const n = Number(id);
        return n > 4 && !extractedIds.has(id);
    });

    if (unexplainedIds.length > 0) {
        console.log(`❌ CRITICAL: Body references IDs that are neither Template (0-4) nor Extracted! IDs: ${unexplainedIds.join(', ')}`);
    } else {
        console.log("✅ All Body IDs are either Template (0-4) or Valid Extracted Custom Styles.");
    }


    // [STYLE INSPECTION DUMP]

    // Dump IDs 11, 16, 17
    const targets = ['11', '16', '17'];
    targets.forEach(tid => {
        const s = extractedStyles.find(k => k.id === tid);
        if (s) {
            console.log(`\n--- Style ID ${tid} ---`);
            console.log(s.xml); // Full dump
            console.log("-----------------------");
        } else {
            console.log(`Style ID ${tid} not found in collection.`);
        }
    });

    // SIMULATE MERGE
    console.log("--- Running mergeIntoTemplate ---");
    const templatePath = path.join(process.cwd(), 'template.hml');
    const templateXml = fs.readFileSync(templatePath, 'utf-8');

    const finalHml = mergeIntoTemplate(templateXml, built);

    console.log(`Final HML Length: ${finalHml.length} bytes`);

    // Check HEAD for new styles
    const headChunk = finalHml.match(/<HEAD[\s\S]*?<\/HEAD>/);
    if (headChunk) {
        const bfList = headChunk[0].match(/<BORDERFILLLIST[\s\S]*?<\/BORDERFILLLIST>/);
        if (bfList) {
            console.log("Found BORDERFILLLIST in HEAD.");
            // Check for ID 11
            const hasId11 = bfList[0].includes('Id="11"');
            console.log(`   Contains Custom ID="11"? ${hasId11 ? '✅ YES' : '❌ NO'}`);
            if (hasId11) {
                // Print that line
                const line = bfList[0].match(/<BORDERFILL Id="11"[^>]*>/);
                console.log(`   ID 11 Definition: ${line ? line[0] : 'Not matched'}`);
            }
        }
    }
}

run();
