
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnose() {
    console.log('Searching for Question 32...');

    // List 5 most recent questions to find it manually
    const { data: questions, error } = await supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching questions:', error);
        return;
    }

    if (!questions || questions.length === 0) {
        console.log('No matching questions found.');
        return;
    }

    console.log(`Found ${questions.length} candidate questions.`);

    for (const q of questions) {
        console.log(`\n--------------------------------------------------`);
        console.log(`Question ID: ${q.id}`);
        console.log(`Excerpt: ${q.content_xml.substring(0, 100)}...`);

        // Fetch Images
        const { data: images, error: imgError } = await supabase
            .from('question_images')
            .select('id, original_bin_id, format, size_bytes')
            .eq('question_id', q.id);

        if (imgError) {
            console.error('Error fetching images:', imgError);
            continue;
        }

        console.log(`Images (${images?.length || 0}):`);
        images?.forEach(img => {
            console.log(`  - DB_ID: ${img.id}`);
            console.log(`    BinID: ${img.original_bin_id}`);
            console.log(`    Format: ${img.format}`);
            console.log(`    Size: ${img.size_bytes} bytes`);
        });

        // Check for "Manual Capture" with BinID="1" anomaly
        const suspicious = images?.filter(i => i.original_bin_id === '1' && i.size_bytes > 50000); // Guessing manual capture is large
        if (suspicious && suspicious.length > 0) {
            console.log('  [ALERT] Found large image with BinID="1" - Potential Corruption Candidate');
        }
    }
}

diagnose();
