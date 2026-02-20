import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function migratePrices() {
    console.log('--- Starting Personal DB Price Migration (V111) ---')

    // 1. Fetch all existing Personal DB materials
    const { data: materials, error: mError } = await supabase
        .from('exam_materials')
        .select('*')
        .eq('content_type', '개인DB')

    if (mError) {
        console.error('Error fetching materials:', mError)
        return
    }

    console.log(`Found ${materials.length} Personal DB records to recalculate.`)

    for (const material of materials) {
        console.log(`\nProcessing: ${material.title}`)

        // 2. Fetch questions for this material
        // Note: We use ilike for school because activate-db does the same
        const { data: questions, error: qError } = await supabase
            .from('questions')
            .select('difficulty')
            .ilike('school', `%${material.school}%`)
            // Match year from title if not explicitly in material? 
            // Actually material has grade, semester, subject, school.
            // We'll try to find year from title or assume 2025 as a baseline or try to match what's there.
            // Looking at previous patterns, year is often in the title.
            .eq('school', material.school)
            .eq('subject', material.subject)
            // grade in material is Number (e.g. 1), in questions it's string (e.g. '고1')
            .ilike('grade', `%${material.grade}%`)

        if (qError) {
            console.error(`  Error fetching questions for ${material.id}:`, qError)
            continue
        }

        let calculatedPrice = 0; // No Base
        if (questions && questions.length > 0) {
            questions.forEach(q => {
                const diff = parseInt(String(q.difficulty)) || 1;
                if (diff <= 2) calculatedPrice += 1000;
                else if (diff <= 4) calculatedPrice += 2000;
                else if (diff <= 6) calculatedPrice += 3000;
                else if (diff <= 8) calculatedPrice += 4000;
                else calculatedPrice += 5000;
            });
            console.log(`  Calculated Price: ${calculatedPrice}p based on ${questions.length} questions.`)
        } else {
            console.log(`  No questions found for criteria. Skipping or setting default.`)
            calculatedPrice = 20000; // Keep current default if no questions found
        }

        // 3. Update the material price
        const { error: uError } = await supabase
            .from('exam_materials')
            .update({ price: calculatedPrice })
            .eq('id', material.id)

        if (uError) {
            console.error(`  Error updating price for ${material.id}:`, uError)
        } else {
            console.log(`  Successfully updated price to ${calculatedPrice}p.`)
        }
    }

    console.log('\n--- Migration Completed ---')
}

migratePrices()
