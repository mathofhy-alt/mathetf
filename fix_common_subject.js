// fix_common_subject.js
// 2026 고3 3월 모의고사 공통(1~22번) 중 "미적분II"로 잘못 저장된 문제를 "미적분I"로 수정
// 선택과목(23~30번)은 미적분II 유지

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    // 현황 먼저 확인
    const { data: preview } = await supabase
        .from('questions')
        .select('id, question_number, subject, semester, grade, year')
        .eq('school', '전국연합')
        .eq('year', '2026')
        .ilike('semester', '3월%')
        .eq('grade', '고3')
        .eq('subject', '미적분II')
        .order('question_number');

    if (!preview || preview.length === 0) {
        console.log('[INFO] 해당 조건의 미적분II 레코드 없음');
        return;
    }

    console.log('\n[현재 상태] 2026 고3 3월 모의고사 subject=미적분II 목록:');
    preview.forEach(q => console.log(`  Q${q.question_number}: id=${q.id}`));

    // 문항번호 <= 22 → 공통 영역 → 미적분I 로 수정
    const commonIds = preview.filter(q => q.question_number <= 22).map(q => q.id);
    const selectIds = preview.filter(q => q.question_number >= 23).map(q => q.id);

    console.log(`\n공통(1~22번) 중 미적분II: ${commonIds.length}개 → "미적분I" 로 변경`);
    console.log(`선택(23~30번) 미적분II: ${selectIds.length}개 → 유지`);

    if (commonIds.length === 0) {
        console.log('[OK] 변경할 공통 문제 없음');
        return;
    }

    const { error } = await supabase
        .from('questions')
        .update({ subject: '미적분I' })
        .in('id', commonIds);

    if (error) {
        console.error('[ERROR]', error.message);
    } else {
        console.log(`\n[SUCCESS] ${commonIds.length}개 "미적분II" → "미적분I" 변경 완료`);
    }
}

main();
