
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function inspectPricing() {
    const materialId = '98b0cfc3-8cc6-4997-8c7a-ccbde640340d'
    console.log(`Inspecting material: ${materialId}`)

    const { data: item, error: itemError } = await supabase
        .from('exam_materials')
        .select('*')
        .eq('id', materialId)
        .single()

    if (itemError) {
        console.error('Error fetching material:', itemError)
        return
    }

    console.log('Material Details:', JSON.stringify(item, null, 2))

    const { school, exam_year, grade, semester, subject } = item

    // Exact criteria used in activate-db
    console.log(`\nSearching for questions matching:`)
    console.log(`School: ${school}`)
    console.log(`Year: ${exam_year}`)
    console.log(`Grade: ${grade}`)
    console.log(`Semester: ${semester}`)
    console.log(`Subject: ${subject}`)

    const { data: questions, error: qError } = await supabase
        .from('questions')
        .select('id, difficulty, school, year, grade, semester, subject')
        .ilike('school', `%${school}%`)
        .eq('year', String(exam_year))
        .eq('grade', String(grade)) // Note: check types here
        .eq('semester', String(semester))
        .eq('subject', subject)

    if (qError) {
        console.error('Error fetching questions:', qError)
    } else {
        console.log(`\nFound ${questions?.length || 0} questions.`)
        if (questions && questions.length > 0) {
            console.log('Sample question difficulties:', questions.slice(0, 5).map(q => q.difficulty))
        } else {
            // Check why it failed. Maybe types?
            console.log('\nChecking available questions for this school regardless of year/grade...')
            const { data: allSchoolQs } = await supabase
                .from('questions')
                .select('school, year, grade, semester, subject')
                .ilike('school', `%${school}%`)
                .limit(5)
            console.log('Sample school questions:', allSchoolQs)
        }
    }
}

inspectPricing()
