import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testSignedUrl() {
    const filePath = '0f1db267-e257-460b-9549-2fdd6e6ae988/1771077828033_w8yyea.pdf'
    const bucketName = 'exam-materials'

    console.log(`Attempting to generate signed URL for: [${bucketName}] / [${filePath}]`)

    const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, 3600)

    if (error) {
        console.error('Error generating signed URL:', error)

        // Try without folder prefix just in case (though unlikely)
        const fileNameOnly = '1771077828033_w8yyea.pdf'
        console.log(`Retrying with filename only: ${fileNameOnly}...`)
        const { data: data2, error: error2 } = await supabase.storage
            .from(bucketName)
            .createSignedUrl(fileNameOnly, 3600)

        if (error2) console.error('Error 2:', error2)
        else console.log('Success with filename only (unexpected):', data2.signedUrl)

    } else {
        console.log('Success! Signed URL:', data.signedUrl)
    }
}

testSignedUrl()
