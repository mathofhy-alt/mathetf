import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function findLatest() {
    console.log('Fetching the absolute latest 10 materials...')
    const { data, error } = await supabase
        .from('exam_materials')
        .select('id, title, school, file_path, created_at, exam_year')
        .order('created_at', { ascending: false })
        .limit(10)

    if (error) {
        console.error('Error:', error)
        return
    }

    console.table(data)

    // Also check if there's any record modified today
    const today = new Date().toISOString().split('T')[0]
    console.log(`\nChecking for records created since ${today}...`)
    const { data: todayData } = await supabase
        .from('exam_materials')
        .select('id, title, school, created_at')
        .gte('created_at', today)

    if (todayData && todayData.length > 0) {
        console.log('Records created today:')
        console.table(todayData)
    } else {
        console.log('No records created today.')
    }
}

findLatest()
