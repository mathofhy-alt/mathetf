import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function findNewPaths() {
    const newPaths = [
        '0f1db267-e257-460b-9549-2fdd6e6ae988/1771077828033_w8yyea.pdf',
        '0f1db267-e257-460b-9549-2fdd6e6ae988/1771077796228_cypat6.pdf'
    ]

    console.log('Searching for records with these NEW file_paths...')
    const { data, error } = await supabase
        .from('exam_materials')
        .select('id, title, school, file_path, created_at')
        .in('file_path', newPaths)

    if (error) {
        console.error('Error:', error)
        return
    }

    if (data && data.length > 0) {
        console.log('Found records linked to new paths:')
        console.table(data)
    } else {
        console.log('NO records found linked to these new paths in DB.')

        // Check if there are ANY records for this user created today
        const { data: userData } = await supabase
            .from('exam_materials')
            .select('id, title, school, file_path, created_at')
            .eq('uploader_id', '0f1db267-e257-460b-9549-2fdd6e6ae988')
            .gte('created_at', '2026-02-14')

        if (userData && userData.length > 0) {
            console.log('User created these records today:')
            console.table(userData)
        } else {
            console.log('User has NO records created today in DB.')
        }
    }
}

findNewPaths()
