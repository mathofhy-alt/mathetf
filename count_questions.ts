import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
    const { count, error } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })

    if (error) {
        console.error('Error counting questions:', error)
        return
    }

    console.log('Total questions in DB:', count)
}

main()
