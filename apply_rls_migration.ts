import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function applyMigration() {
    const sql = fs.readFileSync('supabase/migrations/20260216_add_update_policy.sql', 'utf8')
    console.log('Applying RLS migration...')

    // Use supabase.rpc to execute raw SQL if enabled, otherwise we might need to use a different method.
    // Many Supabase setups have an 'exec_sql' or similar RPC for migrations.
    // If not, we'll try to use the UI or tell the user.
    // However, often we can run this via the SQL editor if we have access.
    // Let's try to see if we can use a helper if available, or just use the management API if configured.

    console.log('Please run the following SQL in your Supabase SQL Editor:')
    console.log(sql)

    // Actually, I will try to use the rpc('exec_sql') if it exists.
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql })
    if (error) {
        console.warn('RPC exec_sql failed (might not exist):', error.message)
        console.log('Manual intervention required: Copy the SQL above to Supabase Dashboards.')
    } else {
        console.log('Migration applied successfully via RPC.')
    }
}

applyMigration()
