import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixData() {
    const materialId = 'f6bad34b-be14-40eb-af7e-9c52f0ff68d6';

    console.log(`Fixing exam_materials for ${materialId}...`);
    // 1. Update exam_materials
    const { error: emError } = await supabase
        .from('exam_materials')
        .update({
            title: '전국연합 2023 고1학년 11월 모의고사 [개인DB]',
            semester: 11
        })
        .eq('id', materialId);
        
    if (emError) {
        console.error('Error updating exam_materials:', emError);
        return;
    }
    console.log('Successfully updated exam_materials.');

    // 2. Discover question fields
    const { data: qSample } = await supabase.from('questions').select('*').limit(1);
    if (!qSample || qSample.length === 0) {
        console.log('No questions found in questions table??');
        return;
    }
    
    const columns = Object.keys(qSample[0]);
    console.log('Questions columns:', columns.join(', '));
    
    // Find the foreign key
    let fk = columns.find(c => c.includes('id') && (c.includes('file') || c.includes('material') || c.includes('exam')));
    console.log('Predicted FK:', fk);

    if (fk) {
        // Find if this specific exam has questions attached
        const { data: examQs } = await supabase
            .from('questions')
            .select('*')
            .eq(fk, materialId);
            
        if (examQs && examQs.length > 0) {
            console.log(`Found ${examQs.length} questions attached to this file.`);
            
            // Check what fields need updating. e.g. year, grade, month/semester
            const toUpdate: any = {};
            if (columns.includes('semester')) toUpdate.semester = 11;
            if (columns.includes('month')) toUpdate.month = 11;
            
            if (Object.keys(toUpdate).length > 0) {
                console.log('Updating questions table fields:', toUpdate);
                const { error: qError } = await supabase
                    .from('questions')
                    .update(toUpdate)
                    .eq(fk, materialId);
                if (qError) {
                    console.error('Error updating questions:', qError);
                } else {
                    console.log('Successfully updated questions metadata.');
                }
            } else {
                console.log('No metadata columns like "semester" or "month" found in questions table. Update complete.');
            }
        } else {
            console.log('No questions found linked to this material.');
        }
    }
}

fixData();
