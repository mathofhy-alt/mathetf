import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDifficulty() {
    const { data, error } = await supabase
        .from('questions')
        .select('id, question_number, school, difficulty, work_status')
        .ilike('school', '%문정고%')
        .eq('work_status', 'unsorted');

    if (error) {
        console.error("Error fetching data:", error);
        return;
    }

    console.log(`Found ${data.length} unsorted questions for 문정고`);

    const difficultyCounts: Record<string, number> = {};
    data.forEach(q => {
        const diff = q.difficulty === null ? 'null' : String(q.difficulty);
        difficultyCounts[diff] = (difficultyCounts[diff] || 0) + 1;
        console.log(`Q#${q.question_number} | ID: ${q.id} | Difficulty: ${diff}`);
    });

    console.log("\nSummary of difficulties:");
    console.log(difficultyCounts);
}

checkDifficulty();
