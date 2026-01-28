
const { createClient } = require('@supabase/supabase-js');

// Hardcoded for debug
const supabaseUrl = "https://eupclfzfouxzzmipjchz.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1cGNsZnpmb3V4enptaXBqY2h6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njk5Njc5NCwiZXhwIjoyMDgyNTcyNzk0fQ.SynMUk_1VU1LPFCp8jXCFE9UfqpLx6RUghrTuWO086k";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRpc() {
    console.log("--- Testing match_questions_v2 with Strict Filter ---");

    // 1. Get an embedding for a "Rational Function" (유리함수) question
    // We use ID e956... which we saw earlier was '유리함수'
    const sourceId = 'e956a7b3-1787-471c-b642-94fd7a6b4b48';

    const { data: source, error: srcErr } = await supabase
        .from('questions')
        .select('embedding, unit')
        .eq('id', sourceId)
        .single();

    if (srcErr) {
        console.error("Failed to fetch source:", srcErr);
        return;
    }

    console.log(`Source Unit: '${source.unit}'`);

    // 2. Call RPC with target_unit = '유리함수'
    const targetUnit = '유리함수';
    console.log(`Calling RPC with target_unit: '${targetUnit}'`);

    const { data: results, error: rpcErr } = await supabase.rpc('match_questions_v2', {
        query_embedding: source.embedding,
        match_threshold: 0.1,
        match_count: 5,
        target_grade: null, // Don't filter grade for now, just unit
        target_unit: targetUnit,
        filter_exclude_id: sourceId
    });

    if (rpcErr) {
        console.error("RPC Error:", rpcErr);
        return;
    }

    console.log(`\nResults (${results.length}):`);
    results.forEach((r, i) => {
        const isMatch = r.unit === targetUnit;
        console.log(`${i + 1}. [${r.unit}] ${r.plain_text.slice(0, 30)}... (${isMatch ? 'PASS' : 'FAIL!'})`);
    });
}

testRpc();
