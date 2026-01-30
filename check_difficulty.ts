
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkDifficulty() {
    console.log("Fetching recent sorted questions...");
    const { data, error } = await supabase
        .from('questions')
        .select('id, question_number, school, grade, unit, difficulty, work_status')
        .eq('work_status', 'sorted')
        .eq('school', '영동일고등학교')
        .is('difficulty', null)
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("Recent Sorted Questions:");
    console.table(data);
}

checkDifficulty();
