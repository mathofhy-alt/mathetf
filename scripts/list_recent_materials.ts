
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function listRecent() {
    console.log('Listing recent exam_materials...')
    const { data, error } = await supabase
        .from('exam_materials')
        .select('id, title, exam_year, created_at')
        .order('created_at', { ascending: false })
        .limit(10)

    if (error) {
        console.error('Error:', error)
        return
    }

    console.log('Recent Entries:')
    data.forEach(item => {
        console.log(`- [${item.id}] [${item.exam_year}] ${item.title} (${item.created_at})`)
    })
}

listRecent()
