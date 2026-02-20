import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function exhaustTest() {
    const bucketName = 'exam-materials'
    const folder = '0f1db267-e257-460b-9549-2fdd6e6ae988'

    console.log(`Listing files in [${bucketName}] / [${folder}]...`)
    const { data: files, error: lError } = await supabase.storage.from(bucketName).list(folder)

    if (lError) {
        console.error('List error:', lError)
        return
    }

    if (!files || files.length === 0) {
        console.log('No files found in folder.')
        return
    }

    for (const file of files) {
        const fullPath = `${folder}/${file.name}`
        console.log(`Testing: ${fullPath}...`)
        const { data, error } = await supabase.storage.from(bucketName).createSignedUrl(fullPath, 60)
        if (error) {
            console.error(`  FAILED: ${error.message}`)
        } else {
            console.log(`  SUCCESS: ${data.signedUrl}`)
        }
    }
}

exhaustTest()
