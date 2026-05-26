// check_march_mock.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    const { data, error } = await supabase
        .from('questions')
        .select('subject, semester, grade, year, work_status, question_number')
        .eq('school', '전국연합')
        .eq('year', '2026')
        .ilike('semester', '3월%')
        .order('question_number', { ascending: true });

    if (error) {
        console.error('오류:', error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.log('[결과] 2026년 3월 모의고사 레코드가 없습니다.');
        return;
    }

    // subject별 집계
    const subjectCount = {};
    const statusCount = {};
    data.forEach(q => {
        subjectCount[q.subject] = (subjectCount[q.subject] || 0) + 1;
        statusCount[q.work_status] = (statusCount[q.work_status] || 0) + 1;
    });

    console.log(`\n[2026 3월 모의고사 전국연합] 총 ${data.length}개 문항`);
    console.log('\n-- subject별 --');
    Object.entries(subjectCount).forEach(([s, c]) => console.log(`  "${s}": ${c}개`));
    console.log('\n-- work_status별 --');
    Object.entries(statusCount).forEach(([s, c]) => console.log(`  "${s}": ${c}개`));
    console.log('\n-- 샘플 (첫 5개) --');
    data.slice(0, 5).forEach(q => {
        console.log(`  Q${q.question_number}: subject="${q.subject}", grade="${q.grade}", status="${q.work_status}"`);
    });
}

main();
