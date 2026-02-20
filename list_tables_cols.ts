import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function listTables() {
    console.log('Listing tables via RPC/query...')

    // Try to query pg_catalog if we have permissions, or just check known tables
    const tables = ['questions', 'exam_materials', 'schools', 'purchases', 'user_points', 'embeddings', 'question_images']

    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*').limit(1)
        if (error) {
            console.log(`[X] Table "${table}" does not exist or error: ${error.message}`)
        } else {
            console.log(`[O] Table "${table}" exists. Columns: ${Object.keys(data[0] || {}).join(', ')}`)
        }
    }
}

listTables()
