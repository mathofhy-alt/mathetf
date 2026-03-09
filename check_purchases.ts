import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // use service key to bypass RLS
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkQuestions() {
    const { data: questions, error } = await supabase
        .from('questions')
        .select(`id, school, grade, year, semester, subject`)
        .ilike('school', '%중앙대학교사범대학부속%')
        .limit(3);

    if (error) {
        console.error(error);
        return;
    }

    console.log("Questions Metadata:", JSON.stringify(questions, null, 2));
}

checkQuestions();
