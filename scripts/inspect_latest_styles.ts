
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectLatest() {
    console.log("Fetching latest question...");
    const { data, error } = await supabase
        .from('questions')
        .select('id, content_xml, created_at')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error("DB Error:", error);
        return;
    }

    if (!data || data.length === 0) {
        console.log("No questions found.");
        return;
    }

    const q = data[0];
    console.log(`Latest Question ID: ${q.id} (Created: ${q.created_at})`);

    // Check for ANTIGRAVITY_STYLES
    const styleMatch = q.content_xml.match(/<!-- ANTIGRAVITY_STYLES: ([\s\S]*?) -->/);
    if (styleMatch) {
        console.log("✅ ANTIGRAVITY_STYLES tag FOUND.");
        try {
            const styles = JSON.parse(styleMatch[1]);
            console.log(`Count: ${styles.length}`);
            styles.forEach((s: any, i: number) => {
                console.log(`[Style #${i}] ID: ${s.id}`);
                console.log(`   XML Prefix: ${s.xml.substring(0, 100)}...`);
            });
        } catch (e) {
            console.error("❌ JSON Parse Failed for Styles.");
        }
    } else {
        console.log("❌ ANTIGRAVITY_STYLES tag NOT FOUND.");
        // Dump a snippet of content to see if we missed it
        console.log("Content Snippet (Head):", q.content_xml.substring(0, 500));
    }

    // Check for ANTIGRAVITY_BINARIES
    const binMatch = q.content_xml.match(/<!-- ANTIGRAVITY_BINARIES: ([\s\S]*?) -->/);
    if (binMatch) {
        console.log("✅ ANTIGRAVITY_BINARIES tag FOUND.");
    } else {
        console.log("⚠️ ANTIGRAVITY_BINARIES tag NOT FOUND (Might be normal if no images).");
    }
}

inspectLatest();
