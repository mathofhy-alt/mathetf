import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function updateDbPrice() {
    console.log('Updating Personal DB prices from 10000 to 20000...')

    const { data, error } = await supabase
        .from('exam_materials')
        .update({ price: 20000 })
        .eq('content_type', '개인DB')
        .eq('price', 10000)
        .select()

    if (error) {
        console.error('Error updating prices:', error)
        return
    }

    console.log(`Successfully updated ${data?.length || 0} records.`)
    if (data && data.length > 0) {
        console.table(data.map(item => ({
            id: item.id,
            title: item.title,
            price: item.price
        })))
    }
}

updateDbPrice()
