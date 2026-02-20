import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function doubleCheckIdType() {
    console.log('--- Double Checking Question ID Type ---')
    const { data, error } = await supabase.from('questions').select('*').limit(5)

    if (error) {
        console.error('Error:', error)
        return
    }

    if (data && data.length > 0) {
        data.forEach((q, idx) => {
            console.log(`Record ${idx}:`)
            console.log(`  id: ${q.id} (type: ${typeof q.id})`)
            console.log(`  question_number: ${q.question_number} (type: ${typeof q.question_number})`)
        })
    } else {
        console.log('No data found.')
    }
}

doubleCheckIdType()
