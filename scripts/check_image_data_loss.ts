
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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
    console.log("Checking DB for Image Data...");

    // Fetch ANY question that has 'BINITEM' in its content
    const { data: questions, error } = await supabase
        .from('questions')
        .select('*')
        .ilike('content_xml', '%BINITEM%')
        .limit(1);

    if (error) {
        console.error("DB Error:", error);
        return;
    }

    if (!questions || questions.length === 0) {
        console.log("No questions found with images (BINITEM).");
        return;
    }

    const q = questions[0];
    console.log(`[QID: ${q.id}] Found BINITEM tag.`);

    // Check for binaries storage
    if ('binaries' in q) {
        console.log(`Has 'binaries' column: YES. Value:`, q['binaries']);
    } else {
        console.log(`Has 'binaries' column: NO.`);
    }

    // Check content_xml for embedded stowed data
    if (q.content_xml.includes('ANTIGRAVITY_BINARIES')) {
        console.log("Has Embedded Binaries: YES");
    } else {
        console.log("Has Embedded Binaries: NO");
    }

    // Check if any blob data is visible in XML?
    // Usually BINDATASTORAGE is stripped.
    if (q.content_xml.includes('<BINDATASTORAGE')) {
        console.log("Has BINDATASTORAGE in XML: YES");
    } else {
        console.log("Has BINDATASTORAGE in XML: NO");
    }
}

run();
