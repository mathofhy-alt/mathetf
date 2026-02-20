import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkColumns() {
    console.log('Checking columns for exam_materials...')
    const { data, error } = await supabase
        .from('exam_materials')
        .select('*')
        .limit(1)

    if (error) {
        console.error('Error fetching data:', error)
        return
    }

    if (data && data.length > 0) {
        console.log('Available columns:', Object.keys(data[0]))
    } else {
        console.log('No data found in exam_materials, checking table info via RPC or system tables is limited.')
        // Try to get one row even if it's empty to see if the query fails with specific columns
    }
}

checkColumns()
