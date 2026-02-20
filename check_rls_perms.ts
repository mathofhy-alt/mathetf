import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role to check internal status if needed
)

async function checkRLSPolicies() {
    console.log('Checking RLS policies for "questions" table...')

    // We can try to update a test record as 'anon' to see if it fails
    const anonSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get a test ID
    const { data: qlist } = await anonSupabase.from('questions').select('id, question_number').limit(1)
    if (!qlist || qlist.length === 0) return

    const q = qlist[0]
    console.log(`Testing UPDATE as ANON on ID: ${q.id}`)

    const { data, error } = await anonSupabase
        .from('questions')
        .update({ question_number: q.question_number }) // No-op update to test permission
        .eq('id', q.id)
        .select()

    if (error) {
        console.error('Update Error (ANON):', error.message)
    } else if (data && data.length === 0) {
        console.error('Update Failed (ANON): No rows affected. Likely missing Update Policy.')
    } else {
        console.log('Update Success (ANON): Policy seems correct.')
    }
}

checkRLSPolicies()
