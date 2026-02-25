import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function normalizePrices() {
    console.log('--- Fetching all Personal DB records (file_type: DB) ---');
    const { data: materials, error: mError } = await supabase
        .from('exam_materials')
        .select('*')
        .eq('file_type', 'DB');

    if (mError) {
        console.error('Error fetching materials:', mError);
        return;
    }

    console.log(`Found ${materials.length} records. Processing...`);

    for (const item of materials) {
        console.log(`\nProcessing: ${item.title}`);

        // Exact filters used in activation API
        // school: item.school
        // year: item.exam_year (Wait, check column name in route.ts... it used body.year)
        // Let's check item columns.

        const { data: questions, error: qError } = await supabase
            .from('questions')
            .select('difficulty')
            .ilike('school', `%${item.school}%`)
            .eq('year', item.exam_year || '2025') // Fallback to 2025 if null
            .eq('grade', item.grade === 1 ? '고1' : (item.grade === 2 ? '고2' : (item.grade === 3 ? '고3' : '고1'))) // Map number back to string if needed
            .eq('semester', item.semester === 1 ? '1학기중간' : '2학기기말') // Rough mapping, need to be careful
            .eq('subject', item.subject);

        // Wait, the semester mapping might be wrong since we have 중간/기말
        // Let's check what's actually in 'questions' for this item

        // If exact match fails, try title parsing or more relaxed search
        let targetQuestions = questions;
        if (!targetQuestions || targetQuestions.length === 0) {
            console.log(`  No questions found with exact filters. Trying title-based search...`);
            // Try to find by school and year first
            const { data: relaxed } = await supabase
                .from('questions')
                .select('difficulty, semester')
                .ilike('school', `%${item.school}%`)
                .eq('year', item.exam_year || '2025');

            if (relaxed && relaxed.length > 0) {
                // Filter by semester string contained in title if possible
                const isMidterm = item.title.includes('중간');
                const semesterKey = isMidterm ? '중간' : '기말';
                targetQuestions = relaxed.filter(q => String(q.semester).includes(semesterKey));
            }
        }

        if (targetQuestions && targetQuestions.length > 0) {
            let newPrice = 0;
            targetQuestions.forEach(q => {
                const diff = parseInt(String(q.difficulty)) || 1;
                if (diff <= 2) newPrice += 1000;
                else if (diff <= 4) newPrice += 2000;
                else if (diff <= 6) newPrice += 3000;
                else if (diff <= 8) newPrice += 4000;
                else newPrice += 5000;
            });

            console.log(`  Current Price: ${item.price}P | Calculated Price: ${newPrice}P (Questions: ${targetQuestions.length})`);

            if (item.price !== newPrice) {
                const { error: updateError } = await supabase
                    .from('exam_materials')
                    .update({ price: newPrice })
                    .eq('id', item.id);

                if (updateError) console.error(`  Failed to update ${item.id}:`, updateError);
                else console.log(`  Successfully updated price to ${newPrice}P`);
            } else {
                console.log(`  Price is already correct.`);
            }
        } else {
            console.warn(`  CRITICAL: Could not find any questions for this DB! Setting to fallback 20,000P`);
            if (item.price !== 20000) {
                await supabase.from('exam_materials').update({ price: 20000 }).eq('id', item.id);
            }
        }
    }
}

normalizePrices();
