import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixSeptMock() {
    // 1. 먼저 대상 레코드 확인
    const { data: preview, error: previewError } = await supabase
        .from('questions')
        .select('id, school, year, semester, subject, grade, source_db_id, question_number')
        .eq('year', '2025')
        .eq('semester', '3월 모의고사')
        .eq('subject', '미적분II')
        .eq('grade', '고3');

    if (previewError) {
        console.error('조회 오류:', previewError);
        return;
    }

    console.log(`=== 수정 대상 레코드 (총 ${preview?.length ?? 0}개) ===`);
    preview?.forEach(q => {
        console.log(`  ID: ${q.id} | Q${q.question_number} | ${q.school} | ${q.semester} | source_db_id: ${q.source_db_id}`);
    });

    if (!preview || preview.length === 0) {
        console.log('수정할 레코드가 없습니다.');
        return;
    }

    const ids = preview.map(q => q.id);

    // 2. semester 수정
    const { error: updateError } = await supabase
        .from('questions')
        .update({
            semester: '9월 모의고사',
            source_db_id: '전국연합_2025_9월 모의고사_미적분II'
        })
        .in('id', ids);

    if (updateError) {
        console.error('업데이트 오류:', updateError);
        return;
    }

    console.log(`\n✅ ${preview.length}개 레코드 수정 완료: 3월 모의고사 → 9월 모의고사`);

    // 3. 결과 확인
    const { data: verify } = await supabase
        .from('questions')
        .select('id, semester, source_db_id')
        .in('id', ids);
    
    console.log('\n=== 수정 후 확인 ===');
    verify?.slice(0, 3).forEach(q => {
        console.log(`  ID: ${q.id} | semester: ${q.semester} | source_db_id: ${q.source_db_id}`);
    });
}

fixSeptMock();
