import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function listAllFiles() {
    const userId = '0f1db267-e257-460b-9549-2fdd6e6ae988'
    console.log(`Listing ALL files in ${userId}...`)

    const { data: files, error } = await supabase.storage.from('exam-materials').list(userId, {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' }
    })

    if (error) {
        console.error('Error:', error)
        return
    }

    console.table(files.map(f => ({
        name: f.name,
        created_at: f.created_at,
        size: f.metadata?.size
    })))
}

listAllFiles()
