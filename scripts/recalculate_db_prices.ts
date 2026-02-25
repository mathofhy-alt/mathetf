
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function recalculatePrices() {
    console.log('Fetching exam_materials with price 20,000 (potential fallback)...')

    const { data: materials, error: fetchError } = await supabase
        .from('exam_materials')
        .select('*')
        .eq('price', 20000)
        .eq('file_type', 'DB')

    if (fetchError) {
        console.error('Error fetching materials:', fetchError)
        return
    }

    if (!materials || materials.length === 0) {
        console.log('No records found with price 20,000.')
        return
    }

    console.log(`Found ${materials.length} records to evaluate.`)

    for (const item of materials) {
        console.log(`\nEvaluating record [${item.id}]: ${item.title}`)

        // Normalize Grade
        let gradeVal = String(item.grade);
        if (['1', '2', '3'].includes(gradeVal.replace(/[^0-9]/g, ''))) {
            gradeVal = `고${gradeVal.replace(/[^0-9]/g, '')}`;
        }

        // Normalize Semester
        const semNum = String(item.semester).replace(/[^0-9]/g, '');
        const typeShort = item.exam_type.includes('중간') ? '중간' : (item.exam_type.includes('기말') ? '기말' : '');
        const semesterVal = typeShort ? `${semNum}학기${typeShort}` : `${semNum}학기`;

        console.log(`Searching questions for: ${item.school} | ${item.exam_year} | ${gradeVal} | ${semesterVal} | ${item.subject}`)

        const { data: questions, error: qError } = await supabase
            .from('questions')
            .select('difficulty')
            .ilike('school', `%${item.school}%`)
            .eq('year', String(item.exam_year))
            .eq('grade', gradeVal)
            .eq('semester', semesterVal)
            .eq('subject', item.subject)

        if (qError) {
            console.error(`Error fetching questions for [${item.id}]:`, qError)
            continue
        }

        if (questions && questions.length > 0) {
            console.log(`Found ${questions.length} questions. Recalculating price...`)
            let newPrice = 0;
            questions.forEach(q => {
                const diff = parseInt(String(q.difficulty)) || 1;
                if (diff <= 2) newPrice += 1000;
                else if (diff <= 4) newPrice += 2000;
                else if (diff <= 6) newPrice += 3000;
                else if (diff <= 8) newPrice += 4000;
                else newPrice += 5000;
            });

            if (newPrice !== item.price) {
                console.log(`Price change: ${item.price} -> ${newPrice}. Updating...`)
                const { error: updateError } = await supabase
                    .from('exam_materials')
                    .update({ price: newPrice })
                    .eq('id', item.id)

                if (updateError) {
                    console.error(`Failed to update price for [${item.id}]:`, updateError)
                } else {
                    console.log(`Successfully updated price for [${item.id}]`)
                }
            } else {
                console.log(`Price is already correct (${newPrice}). No update needed.`)
            }
        } else {
            console.log(`No questions found for [${item.id}]. Skipping (might be correct fallback).`)
        }
    }

    console.log('\nPrice recalculation completed.')
}

recalculatePrices()
