const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // find one question in 경기고등학교
    const { data: qs } = await adminClient.from('questions').select('id, difficulty').eq('school', '경기고등학교').limit(1);
    if (!qs || qs.length === 0) return console.log('No q');
    const qId = qs[0].id;
    const oldDiff = qs[0].difficulty || '1';
    const newDiff = oldDiff === '1' ? '10' : '1';

    console.log(`Testing Patch. Changing diff of ${qId} from ${oldDiff} to ${newDiff}`);

    // Simulated PATCH logic
    const ids = [qId];
    const updates = { difficulty: newDiff };

    // 1. update question
    await adminClient.from('questions').update(updates).in('id', ids);
    
    // 2. logic
    const { data: updatedQs } = await adminClient.from('questions').select('school, year, grade, semester, subject').in('id', ids);
    console.log("UpdatedQs:", updatedQs);
    
    const uniqueGroups = Array.from(new Set(updatedQs.map((q) => 
        `${q.school}|${q.year}|${q.grade}|${q.semester}|${q.subject}`
    )));

    for (const groupKey of uniqueGroups) {
        console.log("groupKey:", groupKey);
        const [s_school, s_year, s_grade, s_sem, s_sub] = groupKey.split('|');
        
        const { data: allQs } = await adminClient
            .from('questions')
            .select('difficulty')
            .eq('school', s_school)
            .eq('year', s_year)
            .eq('grade', s_grade)
            .eq('semester', s_sem)
            .eq('subject', s_sub);
        
        console.log(`Found ${allQs.length} sibling questions`);
        let newPrice = 0;
        allQs.forEach((q) => {
            const diff = parseInt(String(q.difficulty)) || 1;
            if (diff <= 2) newPrice += 1000;
            else if (diff <= 4) newPrice += 2000;
            else if (diff <= 6) newPrice += 3000;
            else if (diff <= 8) newPrice += 4000;
            else newPrice += 5000;
        });
        console.log("Calculated new price:", newPrice);

        const gradeNum = Number(String(s_grade).replace(/[^0-9]/g, '')) || 0;
        const semNum = Number(String(s_sem).replace(/[^0-9]/g, '')) || 1;
        let examType = '';
        if (s_sem.includes('중간')) examType = '중간고사';
        else if (s_sem.includes('기말')) examType = '기말고사';

        let query = adminClient
            .from('exam_materials')
            .update({ price: newPrice })
            .eq('content_type', '개인DB')
            .eq('school', s_school)
            .eq('exam_year', Number(s_year))
            .eq('grade', gradeNum)
            .eq('subject', s_sub);
        
        if (examType) {
            query = query.eq('exam_type', examType);
        }

        const res = await query.select();
        console.log("Exam materials updated:", res.data);
    }
    process.exit(0);
}
run();
