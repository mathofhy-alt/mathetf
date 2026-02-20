import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function applyMigration() {
    const sql = fs.readFileSync('supabase/migrations/20260214_add_exam_year.sql', 'utf8')
    console.log('Applying migration...')

    // Note: Supabase JS client doesn't have a direct 'sql' method. 
    // We should use an RPC if defined, or if not, the user might need to run it manually.
    // However, I can try to use a temporary table/function trick or just advise the user.
    // Actually, I have the ability to run SQL via the dashboard if I had a browser, 
    // but here I can try to use the 'postgres' RPC if available in common setups.

    console.log('MIGRATION SQL:')
    console.log(sql)

    // Since I cannot run raw SQL via the JS client easily without a pre-defined RPC,
    // I will check if there's a 'postgres' rpc.
    const { data, error } = await supabase.rpc('postgres', { query: sql }).catch(() => ({ data: null, error: 'RPC postgres not found' }))

    if (error) {
        console.error('Migration failed via RPC:', error)
        console.log('Please run the SQL manually in the Supabase SQL Editor.')
    } else {
        console.log('Migration applied successfully!')
    }
}

applyMigration()
