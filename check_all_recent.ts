import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkEntireStorage() {
    console.log('Fetching latest objects from entire "exam-materials" bucket...')

    // List folders at root
    const { data: folders, error: fError } = await supabase.storage.from('exam-materials').list('', { limit: 100 })
    if (fError) {
        console.error('Error listing root:', fError)
        return
    }

    const allRecentFiles: any[] = []
    const today = new Date().toISOString().split('T')[0]

    for (const item of folders) {
        if (!item.id) { // It's a folder
            console.log(`Checking folder: ${item.name}...`)
            const { data: files } = await supabase.storage.from('exam-materials').list(item.name, {
                limit: 50,
                sortBy: { column: 'created_at', order: 'desc' }
            })
            if (files) {
                files.forEach(f => {
                    if (f.created_at?.startsWith(today)) {
                        allRecentFiles.push({ ...f, fullPath: `${item.name}/${f.name}` })
                    }
                })
            }
        } else { // It's a file at root
            if (item.created_at?.startsWith(today)) {
                allRecentFiles.push({ ...item, fullPath: item.name })
            }
        }
    }

    console.log(`Found ${allRecentFiles.length} files uploaded today.`)
    allRecentFiles.sort((a, b) => b.created_at.localeCompare(a.created_at))
    console.table(allRecentFiles.slice(0, 10))
}

checkEntireStorage()
