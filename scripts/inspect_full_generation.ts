
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { buildBody } from '../src/lib/hml/body-builder';
import { mergeIntoTemplate } from '../src/lib/hml/template-manager';

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

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("--- Inspecting Full HML Generation ---");

    // Fetch 'Stowaway' question
    const { data: questions } = await supabase
        .from('questions')
        .select('*')
        .ilike('content_xml', '%ANTIGRAVITY_BINARIES%')
        .limit(1);

    if (!questions || questions.length === 0) {
        console.log("No DB Data found.");
        return;
    }
    const q = questions[0];

    // Build Body
    console.log(`Building Body for Q${q.id}...`);
    const built = buildBody([q], 0); // StartBinID = 0 so next is 1

    // Check Extraction
    console.log(`Extracted BinItems: ${built.binDataItems.length}`);
    if (built.binDataItems.length > 0) {
        console.log(`First Item ID: ${built.binDataItems[0].id}`);
    }

    // Merge
    const templatePath = path.join(process.cwd(), 'template.hml');
    const templateXml = fs.readFileSync(templatePath, 'utf-8');
    const finalHml = mergeIntoTemplate(templateXml, built);

    // INSPECT HEAD
    console.log("--- HEAD INSPECTION ---");
    const headMatch = finalHml.match(/<HEAD[^>]*>([\s\S]*?)<\/HEAD>/i);
    if (headMatch) {
        const headContent = headMatch[1];

        // 1. Check BINDATALIST
        const binList = headContent.match(/<BINDATALIST[^>]*>([\s\S]*?)<\/BINDATALIST>/i);
        if (binList) {
            console.log("✅ <BINDATALIST> Found in HEAD.");
            const items = binList[1].match(/<BINITEM\b[^>]*>/g);
            console.log(`   Contains ${items?.length || 0} items.`);
            if (items && items.length > 0) {
                console.log(`   First Item: ${items[0]}`);
            }
        } else {
            console.log("❌ <BINDATALIST> MISSING in HEAD.");
        }

        // 2. Check BORDERFILL
        const borderFillCount = (headContent.match(/<BORDERFILL\b/gi) || []).length;
        console.log(`   Contains ${borderFillCount} <BORDERFILL> definitions.`);

        // Check if ID 15 exists (Example)
        if (headContent.includes('Id="15"')) {
            console.log("   ID 15 exists.");
        } else {
            console.log("   ID 15 NOT found.");
        }

    } else {
        console.log("❌ <HEAD> NOT FOUND.");
    }

    // INSPECT BODY REFS
    console.log("--- BODY INSPECTION ---");
    const bodyRefs = built.combinedBodyPs.match(/BinItem="\d+"/g);
    console.log(`Body references: ${bodyRefs ? bodyRefs.slice(0, 3).join(', ') : 'None'}`);

    const borderRefs = built.combinedBodyPs.match(/BorderFill="\d+"/g);
    console.log(`BorderFill refs: ${borderRefs ? borderRefs.slice(0, 3).join(', ') : 'None'}`);
}

run();
