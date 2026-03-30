const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
    const s_school = "경기고등학교";
    const s_year = "2025";
    const s_grade = "고1";
    const s_sem = "1학기중간";
    const s_sub = "공통수학1";

    const gradeNum = Number(String(s_grade).replace(/[^0-9]/g, '')) || 0;
    const semNum = Number(String(s_sem).replace(/[^0-9]/g, '')) || 1;
    let examType = '';
    if (s_sem.includes('중간')) examType = '중간고사';
    else if (s_sem.includes('기말')) examType = '기말고사';

    let query = sb
        .from('exam_materials')
        .select('*')
        .eq('content_type', '개인DB')
        .eq('school', s_school)
        .eq('exam_year', Number(s_year))
        .eq('grade', gradeNum)
        .eq('subject', s_sub);
    
    if (examType) {
        query = query.eq('exam_type', examType);
    }

    const { data, error } = await query;
    console.log("Matched Rows:", data?.length);
    if (error) console.error(error);
    process.exit(0);
}
test();
