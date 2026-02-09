const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://eupclfzfouxzzmipjchz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1cGNsZnpmb3V4enptaXBqY2h6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Njk5Njc5NCwiZXhwIjoyMDgyNTcyNzk0fQ.SynMUk_1VU1LPFCp8jXCFE9UfqpLx6RUghrTuWO086k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Fetching all questions for Sukmyung 2025 1학기중간 공통수학1...');
    const { data, error } = await supabase
        .from('questions')
        .select('id, question_number, school, year, semester, subject, unit, created_at')
        .eq('school', '숙명여자고등학교')
        .eq('year', '2025')
        .eq('semester', '1학기중간')
        .eq('subject', '공통수학1')
        .order('question_number', { ascending: true });

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}

run();
