import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getFullRecord() {
    console.log('Fetching full record for 중앙대학교사범대학부속고등학교...')
    const { data, error } = await supabase
        .from('exam_materials')
        .select('*')
        .ilike('school', '%중앙대학교사범대학부속고등학교%')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error:', error)
        return
    }

    console.table(data)
}

getFullRecord()
