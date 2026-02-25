
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function fixYears() {
    console.log('Searching for exam_materials with year discrepancy...')

    // Find records where exam_year is 2024 but title contains 2025
    const { data, error } = await supabase
        .from('exam_materials')
        .select('id, title, exam_year')
        .eq('exam_year', 2024)
        .ilike('title', '%2025%')

    if (error) {
        console.error('Error fetching records:', error)
        return
    }

    if (!data || data.length === 0) {
        console.log('No records found with 2024 exam_year and 2025 in title.')
        return
    }

    console.log(`Found ${data.length} records to fix.`)

    for (const item of data) {
        console.log(`Fixing item [${item.id}]: ${item.title}`)
        const { error: updateError } = await supabase
            .from('exam_materials')
            .update({ exam_year: 2025 })
            .eq('id', item.id)

        if (updateError) {
            console.error(`Failed to update item [${item.id}]:`, updateError)
        } else {
            console.log(`Successfully updated item [${item.id}] to 2025`)
        }
    }

    console.log('Migration completed.')
}

fixYears()
