import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkAllJoongdae() {
    console.log('Fetching ALL records for 중앙대학교사범대학부속고등학교...')
    const { data, error } = await supabase
        .from('exam_materials')
        .select('*')
        .ilike('school', '%중앙대학교사범대학부속고등학교%')

    if (error) {
        console.error('Error:', error)
        return
    }

    console.table(data.map(r => ({
        id: r.id,
        title: r.title,
        file_path: r.file_path,
        created_at: r.created_at
    })))
}

checkAllJoongdae()
