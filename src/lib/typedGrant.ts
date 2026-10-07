import { createAdminClient } from '@/utils/supabase/server-admin';

/**
 * 무료 타이핑 (10/8) — 채택된 제보의 신청자에게 그 시험의 판매용 한글 파일([문제+해설] HWP)을 0원 구매로 넣어 준다.
 * 사용자: "어차피 내가 한글 작업해서 등록할 텐데, 2,000원짜리 파일을 한 달간 받을 수 있게 붙여 주는 게 편하다"
 *   → 따로 올리지 않는다. 등록이 끝나 판매 파일이 생기면, 마이페이지 › 구매 내역에서 30일 받기(기존 규칙).
 * 조건: 채택(submission_reward 지급) + 같은 학교·연도·학년·학기·시험·과목의 HWP 판매 자료가 있음. 여러 번 불러도 한 번만 넣는다.
 */
export type TypedGrant = { status: 'ready'; title: string; grantedAt: string } | { status: 'working' } | { status: 'none' };

export async function grantTypedFile(reportId: string): Promise<TypedGrant> {
    const sb = createAdminClient();
    const { data: r } = await sb.from('exam_materials')
        .select('id, uploader_id, school, exam_year, grade, semester, exam_type, subject, content_type').eq('id', reportId).maybeSingle();
    if (!r || r.content_type !== '원본제보' || !r.uploader_id) return { status: 'none' };
    const { data: reward } = await sb.from('point_transactions').select('id').eq('type', 'submission_reward').eq('related_id', reportId).limit(1);
    if (!reward?.length) return { status: 'none' };   // 아직 채택 전
    const { data: mats } = await sb.from('exam_materials').select('id, title, price')
        .eq('school', r.school).eq('exam_year', r.exam_year).eq('grade', r.grade).eq('semester', r.semester)
        .eq('exam_type', r.exam_type).eq('subject', r.subject).eq('content_type', '해설').eq('file_type', 'HWP').limit(1);
    const mat = mats?.[0];
    if (!mat) return { status: 'working' };   // 채택은 했고, 한글 작업·등록 중
    const { data: have } = await sb.from('purchased_items').select('created_at').eq('user_id', r.uploader_id).eq('item_id', mat.id).order('created_at', { ascending: false }).limit(1);
    if (have?.length) return { status: 'ready', title: mat.title, grantedAt: have[0].created_at };
    const { data: ins, error } = await sb.from('purchased_items').insert({
        user_id: r.uploader_id, payment_id: `typing-${reportId}`, item_type: 'HWP_DOC', item_id: mat.id, title: mat.title, price_paid: 0,
    }).select('created_at').single();
    if (error) { console.error('[typedGrant]', error.code, error.message); return { status: 'working' }; }
    // 동시에 두 번 불리면(화면이 목록을 두 번 읽는 등) 둘 다 '없음'으로 보고 넣을 수 있다 → 같은 신청 줄은 가장 이른 것 하나만 남긴다
    const { data: dup } = await sb.from('purchased_items').select('id, created_at').eq('user_id', r.uploader_id).eq('item_id', mat.id).eq('payment_id', `typing-${reportId}`).order('created_at', { ascending: true }).order('id', { ascending: true });
    if ((dup || []).length > 1) await sb.from('purchased_items').delete().eq('user_id', r.uploader_id).in('id', dup!.slice(1).map(d => d.id));
    return { status: 'ready', title: mat.title, grantedAt: dup?.[0]?.created_at || ins.created_at };
}
