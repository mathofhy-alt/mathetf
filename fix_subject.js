require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fix() {
    // 먼저 미분류 중 미적분II인 문제들을 찾습니다.
    const { data: questions, error: fetchError } = await supabase
        .from('questions')
        .select('id, subject')
        .or('work_status.neq.sorted,work_status.is.null')
        .eq('subject', '미적분II');

    if (fetchError) {
        console.error("Fetch Error:", fetchError);
        return;
    }

    if (!questions || questions.length === 0) {
        console.log("업데이트할 문제가 없습니다.");
        return;
    }

    const ids = questions.map(q => q.id);
    console.log(`업데이트할 대상 ID (${ids.length}개):`, ids);

    // subject를 '확률과통계'로 업데이트합니다.
    const { data: updateData, error: updateError } = await supabase
        .from('questions')
        .update({ subject: '확률과통계' })
        .in('id', ids)
        .select();

    if (updateError) {
        console.error("Update Error:", updateError);
        return;
    }

    console.log(`✅ 성공적으로 ${updateData.length}개의 문제를 '확률과통계'로 업데이트했습니다!`);
}

fix();
