// fix_subject_mieokbun.js
// 전국연합(모의고사) 레코드에서 "미적분1"/"미적분2" → "미적분II" 로 일괄 수정
// 고2 내신의 "미적분1"은 건드리지 않음

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixSubject(fromSubject) {
    const { count } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('school', '전국연합')
        .eq('subject', fromSubject);

    if (!count || count === 0) {
        console.log(`[SKIP] 전국연합 subject="${fromSubject}" 레코드 없음`);
        return;
    }

    const { error } = await supabase
        .from('questions')
        .update({ subject: '미적분II' })
        .eq('school', '전국연합')
        .eq('subject', fromSubject);

    if (error) {
        console.error(`[ERROR] "${fromSubject}" 업데이트 실패:`, error.message);
    } else {
        console.log(`[OK] 전국연합 "${fromSubject}" → "미적분II" : ${count}개 수정 완료`);
    }
}

async function main() {
    console.log('=== 미적분 과목명 정규화 시작 ===\n');
    await fixSubject('미적분1');
    await fixSubject('미적분2');
    console.log('\n=== 완료 ===');
}

main();
