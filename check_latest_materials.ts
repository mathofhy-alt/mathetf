import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkLatestMaterials() {
    console.log('Fetching latest 5 exam_materials...')
    const { data, error } = await supabase
        .from('exam_materials')
        .select('id, title, school, file_path, created_at')
        .neq('school', 'DELETED')
        .order('created_at', { ascending: false })
        .limit(5)

    if (error) {
        console.error('Error:', error)
        return
    }

    console.table(data)
}

checkLatestMaterials()
