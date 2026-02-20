import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkStorage() {
    console.log('Checking "exam-materials" bucket for recent file uploads...')

    // Storage API doesn't have a direct "order by created_at" for list() in all versions, 
    // but we can list all files and sort manually for a specific user folder if we know the user.
    // Since we don't know the exact user folder (id), let's list the root or common folders.

    const { data: list, error } = await supabase.storage.from('exam-materials').list('', {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
    })

    if (error) {
        console.error('Error listing storage:', error)
        return
    }

    if (list && list.length > 0) {
        console.log('Latest 10 folders/files in storage root:')
        console.table(list.slice(0, 10))
    }
}

checkStorage()
