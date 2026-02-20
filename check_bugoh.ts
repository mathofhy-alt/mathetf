import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function findBugoh() {
    console.log('Searching for "부속고" or "중앙" in school names...')
    const { data, error } = await supabase
        .from('exam_materials')
        .select('id, title, school, file_path, created_at')
        .or('school.ilike.%부속고%,school.ilike.%중앙%')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error:', error)
        return
    }

    if (data && data.length > 0) {
        console.log(`Found ${data.length} records:`)
        console.table(data)
    } else {
        console.log('No matching records found.')
    }
}

findBugoh()
