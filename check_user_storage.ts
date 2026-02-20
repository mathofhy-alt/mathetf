import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkUserStorage() {
    const userId = '0f1db267-e257-460b-9549-2fdd6e6ae988'
    console.log(`Checking storage for user: ${userId}...`)

    const { data: list, error } = await supabase.storage.from('exam-materials').list(userId, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
    })

    if (error) {
        console.error('Error listing storage:', error)
        return
    }

    if (list && list.length > 0) {
        console.log(`Latest 10 files in user folder:`)
        console.table(list.slice(0, 10))

        // Check if any file was created today (2026-02-14)
        const today = '2026-02-14'
        const todayFiles = list.filter(f => f.created_at?.startsWith(today))
        if (todayFiles.length > 0) {
            console.log('Files uploaded today:')
            console.table(todayFiles)
        } else {
            console.log('No files uploaded today in this folder.')
        }
    } else {
        console.log('No files found in this user folder.')
    }
}

checkUserStorage()
