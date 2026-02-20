import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function inspectQuestionsTable() {
    console.log('Inspecting "questions" table columns...')
    const { data, error } = await supabase.from('questions').select('*').limit(1)

    if (error) {
        console.error('Error fetching questions:', error)
        return
    }

    if (data && data.length > 0) {
        console.log('Sample record keys:', Object.keys(data[0]))
        console.log('Sample values:', data[0])

        // Explicitly check question_number type
        console.log('question_number type:', typeof data[0].question_number)
        console.log('question_index type:', typeof data[0].question_index)
    } else {
        console.log('No data found in questions table.')
    }
}

inspectQuestionsTable()
