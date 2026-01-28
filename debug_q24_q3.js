
const { createClient } = require('@supabase/supabase-js');

// Hardcoded for debug
const supabaseUrl = "https://eupclfzfouxzzmipjchz.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1cGNsZnpmb3V4enptaXBqY2h6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njk5Njc5NCwiZXhwIjoyMDgyNTcyNzk0fQ.SynMUk_1VU1LPFCp8jXCFE9UfqpLx6RUghrTuWO086k";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkQuestions() {
    console.log("--- Checking Q24 and Q3 ---");

    // Fetch Q24 and Q3 (assuming only one of each exists, or pick latest)
    const { data, error } = await supabase
        .from('questions')
        .select('id, question_number, unit, plain_text')
        .in('question_number', [24, 3])
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error:", error);
        return;
    }

    if (!data || data.length === 0) {
        console.log("Questions not found.");
        return;
    }

    data.forEach(q => {
        console.log(`\nQuestion ${q.question_number} [ID: ${q.id}]`);
        // Show exact unit value
        if (q.unit === null) console.log("Unit: NULL (This disables the filter!)");
        else console.log(`Unit: '${q.unit}' (Type: ${typeof q.unit}, Len: ${q.unit.length})`);

        console.log(`Text Preview: ${q.plain_text.slice(0, 30)}...`);
    });
}

checkQuestions();
