
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkFormats() {
    console.log('Checking recent questions...');

    // Fetch a question that has a MANUAL reference in its XML
    // This is the best way to see how they are stored
    const { data: questions, error } = await supabase
        .from('questions')
        .select('id, content_xml')
        .ilike('content_xml', '%MANUAL_%')
        .limit(1);

    if (error) {
        console.error('Error fetching question:', error);
        return;
    }

    if (!questions || questions.length === 0) {
        console.log('No questions found with "MANUAL_" in content_xml.');

        // Fallback: Just get ANY question and dump its XML
        const { data: anyQ } = await supabase
            .from('questions')
            .select('id, content_xml')
            .limit(1);

        if (anyQ && anyQ.length > 0) {
            console.log('\n--- Random Question Dump ---');
            console.log(anyQ[0].content_xml.slice(0, 1000));
        }
        return;
    }

    const question = questions[0];
    console.log(`\nFound Question: ${question.id}`);

    // Check for BinItem attributes
    console.log('--- BINITEM DUMP ---');
    const binItemRegex = /(BinItem|BinData|data-hml-bin-id)=["']?([^"'\s>]+)["']?/gi;
    let match;
    while ((match = binItemRegex.exec(question.content_xml)) !== null) {
        console.log(`Found: ${match[0]}`);
    }

    // Check for Manual ID specifically
    console.log('--- MANUAL ID CONTEXT ---');
    const manualIndex = question.content_xml.indexOf('MANUAL_');
    if (manualIndex !== -1) {
        console.log(question.content_xml.substring(manualIndex - 50, manualIndex + 100));
    }
}

checkFormats();
