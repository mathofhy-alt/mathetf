import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testPatchUpdate() {
    // Find a test question (latest unsorted)
    const { data: qlist } = await supabase.from('questions').select('id, question_number').limit(1)
    if (!qlist || qlist.length === 0) {
        console.log('No questions found.')
        return
    }

    const q = qlist[0]
    const oldNum = q.question_number
    const newNum = oldNum + 100 // Temporarily change it

    console.log(`Current ID: ${q.id}, Old Number: ${oldNum}, Target New Number: ${newNum}`)

    // Try update via Supabase directly (simulating service role power)
    const { error: sError } = await supabase
        .from('questions')
        .update({ question_number: newNum })
        .eq('id', q.id)

    if (sError) {
        console.error('Supabase direct update failed:', sError)
    } else {
        console.log('Supabase direct update success.')

        // Verify
        const { data: verifyQ } = await supabase.from('questions').select('question_number').eq('id', q.id).single()
        console.log('Verified Number:', verifyQ?.question_number)

        // Revert
        await supabase.from('questions').update({ question_number: oldNum }).eq('id', q.id)
        console.log('Reverted to old number.')
    }
}

testPatchUpdate()
