import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkDifficultySookmyung() {
    console.log('Searching for 2025 Sookmyung Girls\' High School, Grade 1, 1st Semester Midterm questions...')

    const { data, error } = await supabase
        .from('questions')
        .select('id, question_number, difficulty, subject, unit, work_status')
        .ilike('school', '%숙명여자고등학교%')
        .eq('year', '2025')
        .eq('grade', '고1')
        .eq('semester', '1학기중간')
        .order('question_number', { ascending: true })

    if (error) {
        console.error('Error:', error.message)
        return
    }

    if (!data || data.length === 0) {
        console.log('No questions found for the given criteria.')
        // Let's try to search without semester to see what we have
        const { data: allSookmyung } = await supabase
            .from('questions')
            .select('id, question_number, year, grade, semester, difficulty, school')
            .ilike('school', '%숙명여자고등학교%')
            .limit(5)
        console.log('Sample Sookmyung records in DB:', allSookmyung)
        return
    }

    console.log(`Found ${data.length} questions.`)
    console.table(data.map(q => ({
        '번호': q.question_number,
        '난이도': q.difficulty,
        '단원': q.unit,
        '과목': q.subject,
        '상태': q.work_status
    })))
}

checkDifficultySookmyung()
