import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function findRecords() {
    console.log('Searching for "중앙대" in exam_materials...')
    const { data: keywordData } = await supabase
        .from('exam_materials')
        .select('id, title, school, file_path, created_at, exam_year')
        .or('school.ilike.%중앙대%,title.ilike.%중앙대%')
        .order('created_at', { ascending: false })

    if (keywordData && keywordData.length > 0) {
        console.log('Found records with "중앙대":')
        console.table(keywordData)
    }

    console.log('\nFetching latest 20 materials in the database...')
    const { data: latestData, error } = await supabase
        .from('exam_materials')
        .select('id, title, school, file_path, created_at, exam_year')
        .order('created_at', { ascending: false })
        .limit(20)

    if (error) {
        console.error('Error:', error)
        return
    }

    console.table(latestData)
}

findRecords()
