import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function patchWithHwp() {
    const recordId = 'bce2da58-5660-42ad-b48a-4ee9b8a8b12d'

    // verified path from exhaust_storage_test.ts
    const hwpPath = '0f1db267-e257-460b-9549-2fdd6e6ae988/1771078100500_d3nl2.hwp'

    console.log(`Patching record ${recordId} with HWP path: ${hwpPath}...`)

    const { error } = await supabase
        .from('exam_materials')
        .update({
            file_path: hwpPath,
            file_type: 'HWP' // Explicitly set to HWP
        })
        .eq('id', recordId)

    if (error) {
        console.error('Patch failed:', error)
    } else {
        console.log('Success! Path updated to HWP.')
    }
}

patchWithHwp()
