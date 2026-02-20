import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugStorage() {
    console.log('Listing all storage buckets...')
    const { data: buckets, error: bError } = await supabase.storage.listBuckets()
    if (bError) {
        console.error('Error listing buckets:', bError)
        return
    }
    console.log('Buckets:', buckets.map(b => b.name))

    const userId = '0f1db267-e257-460b-9549-2fdd6e6ae988'
    const fileName = '1771077828033_w8yyea.pdf'

    for (const bucket of buckets) {
        console.log(`\nSearching in bucket: ${bucket.name}...`)
        const { data: files } = await supabase.storage.from(bucket.name).list(userId)
        if (files) {
            const found = files.find(f => f.name === fileName)
            if (found) {
                console.log(`FOUND! File exists in bucket "${bucket.name}" at path "${userId}/${fileName}"`)
                console.log('File details:', found)
            } else {
                console.log(`Not found in ${bucket.name}/${userId}`)
            }
        }
    }
}

debugStorage()
