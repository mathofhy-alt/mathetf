import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function repairMockExamTitles() {
    console.log('--- Fixing Mock Exam Titles in exam_materials ---');
    const { data: materials, error } = await supabase
        .from('exam_materials')
        .select('id, title, exam_type')
        .or('exam_type.eq.모의고사,exam_type.eq.수능,title.ilike.%모의고사%,title.ilike.%수능%');

    if (error) {
        console.error('Error fetching materials:', error);
        return;
    }

    if (!materials || materials.length === 0) {
        console.log('No mock exams found.');
        return;
    }

    let fixCount = 0;
    for (const item of materials) {
        if (item.title && item.title.includes('학기')) {
            // "3학기 모의고사" -> "3월 모의고사"
            // "6학기 수능" -> "6월 수능"
            const fixedTitle = item.title
                .replace(/(\d+)학기\s*모의고사/g, '$1월 모의고사')
                .replace(/(\d+)학기\s*수능/g, '$1월 수능');

            if (fixedTitle !== item.title) {
                console.log(`Fixing: ${item.title}`);
                console.log(`     -> ${fixedTitle}`);
                
                const { error: updateError } = await supabase
                    .from('exam_materials')
                    .update({ title: fixedTitle })
                    .eq('id', item.id);
                
                if (updateError) {
                    console.error(`Error updating id ${item.id}:`, updateError);
                } else {
                    fixCount++;
                }
            }
        }
    }
    console.log(`\\nCompleted repairing ${fixCount} titles in exam_materials.`);
}

repairMockExamTitles();
