import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getStats() {
    const { data, error } = await supabase
        .from('questions')
        .select('question_number, difficulty, unit')
        .ilike('school', '%숙명여자고등학교%')
        .eq('year', '2025')
        .eq('grade', '고1')
        .eq('semester', '1학기중간')
        .order('question_number', { ascending: true })

    if (error) {
        console.error(error)
        return
    }

    const stats: Record<string, number> = {}
    data.forEach(q => {
        const d = String(q.difficulty)
        stats[d] = (stats[d] || 0) + 1
    })

    console.log('--- DIFFICULTY STATS ---')
    console.log(JSON.stringify(stats, null, 2))
    console.log('--- FULL LIST ---')
    console.log(JSON.stringify(data.map(q => ({ n: q.question_number, d: q.difficulty, u: q.unit })), null, 2))
}

getStats()
