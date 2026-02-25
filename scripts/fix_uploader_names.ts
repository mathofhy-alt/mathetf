
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function fixUploaderNames() {
    console.log('Fetching exam_materials with uploader_name "관리자"...')

    const { data: materials, error: fetchError } = await supabase
        .from('exam_materials')
        .select('id, uploader_id, uploader_name')
        .eq('uploader_name', '관리자')

    if (fetchError) {
        console.error('Error fetching materials:', fetchError)
        return
    }

    if (!materials || materials.length === 0) {
        console.log('No records found with uploader_name "관리자".')
        return
    }

    console.log(`Found ${materials.length} records to fix.`)

    // Get unique uploader_ids
    const uploaderIds = Array.from(new Set(materials.map(m => m.uploader_id))).filter(Boolean) as string[]

    for (const userId of uploaderIds) {
        // Try to get user email from auth
        const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId)

        if (userError || !user || !user.email) {
            console.error(`Could not find email for user [${userId}]:`, userError?.message)
            continue
        }

        const emailPrefix = user.email.split('@')[0]
        console.log(`Updating records for user [${userId}] to uploader_name: ${emailPrefix}`)

        const { error: updateError } = await supabase
            .from('exam_materials')
            .update({ uploader_name: emailPrefix })
            .eq('uploader_id', userId)
            .eq('uploader_name', '관리자')

        if (updateError) {
            console.error(`Failed to update records for user [${userId}]:`, updateError)
        } else {
            console.log(`Successfully updated records for user [${userId}]`)
        }
    }

    console.log('Uploader name migration completed.')
}

fixUploaderNames()
