import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getColumns() {
    console.log('Fetching columns for exam_materials...')
    const { data, error } = await supabase.rpc('inspect_table', { table_name: 'exam_materials' })

    if (error) {
        // If inspect_table RPC doesn't exist, try a simple query and check the first record's keys
        console.log('RPC failed, trying query inspection...')
        const { data: qData, error: qError } = await supabase
            .from('exam_materials')
            .select('*')
            .limit(1)

        if (qError) {
            console.error('Query failed:', qError)
            return
        }

        if (qData && qData.length > 0) {
            console.log('Columns found:', Object.keys(qData[0]))
        } else {
            console.log('No data found to inspect columns.')
        }
        return
    }

    console.log('Columns:', data)
}

getColumns()
