
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkStats() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('--- Checking Subjects ---');
    const { data: questions, error } = await supabase.from('questions').select('subject, difficulty, unit').limit(1000); // Sample 1000

    if (error) {
        console.error(error);
        return;
    }

    const subjects: Record<string, number> = {};
    const difficulties: Record<string, number> = {};
    const units: Record<string, number> = {};

    questions.forEach(q => {
        subjects[q.subject] = (subjects[q.subject] || 0) + 1;
        difficulties[q.difficulty] = (difficulties[q.difficulty] || 0) + 1;
        units[q.unit] = (units[q.unit] || 0) + 1;
    });

    console.log('Subjects:', subjects);
    console.log('Difficulties:', difficulties);
    // console.log('Units:', units); // Too many
}

checkStats();
