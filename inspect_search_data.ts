
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function inspectData() {
    console.log("--- Checking Questions for 경기여자고등학교 ---");
    const { data: qData, error: qError } = await supabase
        .from('questions')
        .select('id, school, semester, work_status, source_db_id')
        .eq('school', '경기여자고등학교')
        .limit(5);

    if (qError) console.error("Questions Error:", qError);
    else console.table(qData);

    console.log("\n--- Checking Exam Materials for 경기여자고등학교 ---");
    const { data: mData, error: mError } = await supabase
        .from('exam_materials')
        .select('id, title, school, semester, file_type')
        .eq('school', '경기여자고등학교')
        .eq('file_type', 'DB')
        .limit(5);

    if (mError) console.error("Materials Error:", mError);
    else console.table(mData);
}

inspectData();
