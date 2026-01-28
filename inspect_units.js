
const { createClient } = require('@supabase/supabase-js');

// Hardcoded for debug
const supabaseUrl = "https://eupclfzfouxzzmipjchz.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1cGNsZnpmb3V4enptaXBqY2h6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njk5Njc5NCwiZXhwIjoyMDgyNTcyNzk0fQ.SynMUk_1VU1LPFCp8jXCFE9UfqpLx6RUghrTuWO086k";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    console.log("--- Inspecting '유리함수' (Rational Function) Questions ---");
    const { data: uriData, error: uriError } = await supabase
        .from('questions')
        .select('id, question_number, unit, plain_text')
        .like('unit', '%유리함수%')
        .limit(5);

    if (uriError) console.error(uriError);
    else {
        uriData.forEach(q => {
            console.log(`[ID: ${q.id}] Unit: ${q.unit}`);
            console.log(`Text: ${q.plain_text.slice(0, 50).replace(/\n/g, ' ')}...`);
            console.log("---------------------------------------------------");
        });
    }

    console.log("\n--- Inspecting '명제' (Proposition) Questions ---");
    const { data: propData, error: propError } = await supabase
        .from('questions')
        .select('id, question_number, unit, plain_text')
        .like('unit', '%명제%')
        .limit(5);

    if (propError) console.error(propError);
    else {
        propData.forEach(q => {
            console.log(`[ID: ${q.id}] Unit: ${q.unit}`);
            console.log(`Text: ${q.plain_text.slice(0, 50).replace(/\n/g, ' ')}...`);
            console.log("---------------------------------------------------");
        });
    }
}

inspectData();
