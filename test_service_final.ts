import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function finalVerification() {
    console.log('--- Final Verification with Service Role ---')

    // Find the specific question ID from previous search (f6c2ae36-915f-4134-ae8e-f9055e715f2c)
    const targetId = 'f6c2ae36-915f-4134-ae8e-f9055e715f2c'
    const newNum = 999 // Test value

    const { data, error } = await supabase
        .from('questions')
        .update({ question_number: newNum })
        .eq('id', targetId)
        .select()

    if (error) {
        console.error('Final Test Error:', error.message)
    } else if (data && data.length > 0) {
        console.log(`Success! Fixed ID ${targetId} to number ${data[0].question_number}`)

        // Revert to something sensible like 101 or back to 1
        await supabase.from('questions').update({ question_number: 1 }).eq('id', targetId)
        console.log('Reverted back to 1 for user to test manually.')
    } else {
        console.error('Final Test Failed: No rows returned even with Service Role.')
    }
}

finalVerification()
