import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixDBYear() {
    const targetId = 'd7ba1c8e-8826-4090-8e1f-0d42af993af2';
    const newYear = 2025;
    const newTitle = '중앙대학교사범대학부속고등학교 2025 고1학년 1학기 중간고사 공통수학1 [개인DB]';

    const { data, error } = await supabase
        .from('exam_materials')
        .update({
            exam_year: newYear,
            title: newTitle
        })
        .eq('id', targetId)
        .select();

    if (error) {
        console.error('Update Error:', error);
        return;
    }

    console.log('Update Success:', data);
}

fixDBYear();
