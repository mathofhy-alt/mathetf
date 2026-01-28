
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    console.log("Checking latest question data...");

    // Get latest question
    const { data, error } = await supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        console.error("Error fetching question:", error);
        return;
    }

    console.log(`ID: ${data.id}`);
    console.log(`Content XML Length: ${data.content_xml ? data.content_xml.length : 'NULL'}`);
    console.log(`Plain Text Length: ${data.plain_text ? data.plain_text.length : 'NULL'}`);
    console.log(`Embedding: ${data.embedding ? 'Exists' : 'NULL'}`);

    // Check match_questions RPC
    console.log("\nTesting match_questions RPC...");
    if (data.embedding) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('match_questions', {
            query_embedding: data.embedding,
            match_threshold: 0.1,
            match_count: 2,
            target_grade: null,
            target_unit: null,
            filter_exclude_id: null
        });

        if (rpcError) {
            console.error("RPC Error:", rpcError);
        } else {
            console.log("RPC Success. Returned Columns:");
            if (rpcData && rpcData.length > 0) {
                console.log(Object.keys(rpcData[0]));
                console.log("First Row content_xml:", rpcData[0].content_xml ? "Exists" : "Missing/Null");
                console.log("First Row image_data:", rpcData[0].image_data ? "Exists" : "Missing/Null");
            } else {
                console.log("RPC returned no rows.");
            }
        }
    } else {
        console.log("Skipping RPC test (no embedding)");
    }
}

checkData();
