import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkIds() {
    console.log('Checking for large IDs in questions table...')
    const { data, error } = await supabase.from('questions').select('id').order('id', { ascending: false }).limit(10)

    if (error) {
        console.error('Error:', error)
        return
    }

    console.log('Max IDs found:')
    console.table(data)

    const maxSafe = Number.MAX_SAFE_INTEGER
    console.log('Number.MAX_SAFE_INTEGER:', maxSafe)

    const hasTooLarge = data.some(q => q.id > maxSafe)
    console.log('Has IDs > MAX_SAFE_INTEGER?', hasTooLarge)
}

checkIds()
