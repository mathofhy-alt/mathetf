import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugSpecificQuestion() {
    console.log('Searching for Joongdae Bugoh 2025 Grade 1 question...')
    const { data, error } = await supabase
        .from('questions')
        .select('id, question_number, question_index, school, year, grade, subject, work_status')
        .ilike('school', '%중앙대학교사범대학부속고등학교%')
        .eq('year', '2025')
        .eq('grade', '고1')
        .order('question_number', { ascending: true })

    if (error) {
        console.error('Error:', error)
        return
    }

    console.log(`Found ${data.length} questions.`)
    console.table(data.slice(0, 5))
}

debugSpecificQuestion()
