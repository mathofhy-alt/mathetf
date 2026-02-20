import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function patchJoongdae() {
    // Found id from previous truncated output or similar search
    // Assuming the record is for '중앙대학교사범대학부속고등학교'

    const { data: record, error: findError } = await supabase
        .from('exam_materials')
        .select('id, file_path, school')
        .ilike('school', '%중앙대학교사범대학부속고등학교%')
        .limit(1)
        .single()

    if (findError || !record) {
        console.error('Could not find record for Joongdae:', findError)
        return
    }

    console.log(`Found record: ID=${record.id}, Current Path=${record.file_path}`)

    // Today's latest file found in storage
    const newPath = '0f1db267-e257-460b-9549-2fdd6e6ae988/1771077828033_w8yyea.pdf'

    if (record.file_path === newPath) {
        console.log('Record already matches the new path. No update needed.')
        return
    }

    console.log(`Patching record to NEW path: ${newPath}...`)
    const { error: patchError } = await supabase
        .from('exam_materials')
        .update({ file_path: newPath })
        .eq('id', record.id)

    if (patchError) {
        console.error('Patch failed:', patchError)
    } else {
        console.log('Success! Joongdae Bugoh record has been updated with the latest file.')
    }
}

patchJoongdae()
