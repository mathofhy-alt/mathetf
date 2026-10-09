import { grantTypedFile } from '@/lib/typedGrant';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { REPORT_REWARD_POINTS } from '@/lib/report-reward';
import { sendNotice } from '@/lib/sms';

/**
 * 원본 제보 채택 (10/8 route 에서 옮김) — 관리자 화면 버튼(api/admin/approve-submission)과 등록 스크립트가 같은 코드를 쓴다.
 * 포인트 내역(멱등 열쇠) → 포인트 적립 → 판매용 한글 파일 0원 구매(있으면) → 제보자 문자(밤엔 오전 9시 예약).
 */
const REWARD_POINTS = REPORT_REWARD_POINTS;
const REWARD_TYPE = 'submission_reward';
export class ApproveError extends Error { constructor(msg: string, public status: number) { super(msg); } }

export async function approveSubmission(id: string, opts: { sms?: boolean } = {}) {
    const admin = createAdminClient();
        const { data: row, error: rowErr } = await admin
        .from('exam_materials')
        .select('id, school, title, content_type, uploader_id')
        .eq('id', id)
        .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row || row.content_type !== '원본제보') {
        throw new ApproveError('원본 제보 자료가 아닙니다.', 404);
    }
    const recipient = row.uploader_id;
    if (!recipient) throw new ApproveError('제보자 정보가 없습니다.', 400);

    // 멱등: 이미 이 제보로 지급된 이력이 있으면 차단
    const { data: dup } = await admin
        .from('point_transactions')
        .select('id')
        .eq('related_id', id)
        .eq('type', REWARD_TYPE)
        .limit(1)
        .maybeSingle();
    if (dup) throw new ApproveError('이미 보상이 지급된 제보입니다.', 409);

    // [10/5] 내역을 먼저 남긴다 — 내역이 중복 지급을 막는 열쇠라, 포인트부터 올리고 내역이 실패하면
    //   (point_transactions_type_check 에 submission_reward 가 없던 때처럼) 누를 때마다 포인트만 쌓였다.
    //   같은 제보 두 번째 기록은 유니크 인덱스(20261005_submission_reward.sql)가 막는다.
    const { data: tx, error: logErr } = await admin.from('point_transactions').insert({
        user_id: recipient,
        type: REWARD_TYPE,
        amount: REWARD_POINTS,
        description: `기출 제보 채택 보상: ${row.title || row.school}`,
        related_id: id,
    }).select('id').single();
    if (logErr) {
        if (logErr.code === '23505') throw new ApproveError('이미 보상이 지급된 제보입니다.', 409);
        throw logErr;
    }

    // 포인트 적립 (earned_points) — 실패하면 방금 남긴 내역을 지워 다시 채택할 수 있게 한다
    try {
        const { data: profile, error: pErr } = await admin
            .from('profiles')
            .select('earned_points')
            .eq('id', recipient)
            .maybeSingle();
        if (pErr) throw pErr;
        const { error: upErr } = profile
            ? await admin.from('profiles').update({ earned_points: (profile.earned_points || 0) + REWARD_POINTS }).eq('id', recipient)
            : await admin.from('profiles').insert({ id: recipient, earned_points: REWARD_POINTS, purchased_points: 0 });
        if (upErr) throw upErr;
    } catch (e) {
        await admin.from('point_transactions').delete().eq('id', tx.id);
        throw e;
    }

    // [10/8] 무료 타이핑 — 판매용 한글 파일이 이미 등록돼 있으면 바로 0원 구매로(없으면 회원이 마이페이지를 열 때 다시 확인)
    const typed = await grantTypedFile(id).catch(() => null);
    // [10/8] 채택 문자 — 회원 가입 때 인증한 번호로. 실패해도 채택은 그대로(관리자 화면에 결과만 알린다)
    const { data: au } = await admin.auth.admin.getUserById(recipient);
    const phone = (au?.user?.user_metadata as any)?.phone || au?.user?.phone;
    const points = REWARD_POINTS.toLocaleString();
    const text = typed?.status === 'ready'
        ? `[수학ETF] 제보 채택! ${points}P 적립. 한글파일은 마이페이지 구매내역에서(30일)`   // [10/9] 단문(90바이트) 안 — 장문 단가 회피
        : `[수학ETF] 제보 채택! ${points}P 적립. 한글파일은 완성되면 마이페이지에 드려요`;
    // [10/8] 등록 스크립트가 한 사람의 제보 여러 건을 한꺼번에 채택할 때는 문자를 끄고 한 통으로 합쳐 보낸다(sendAdoptionSummary)
    const sms = opts.sms === false ? 'skipped' : await sendNotice(phone, text, { quietHours: true });   // 밤에 누르면 오전 9시 예약
    return { ok: true as const, rewarded: REWARD_POINTS, typed: typed?.status ?? 'working', sms, recipient, phone: phone || null };
}

/** 한 사람에게 채택 n건을 문자 한 통으로 (10/8 사장님: "많이 하면 메세지는 한번만") */
export async function sendAdoptionSummary(phone: string | null, count: number, allReady: boolean) {
    const points = (REWARD_POINTS * count).toLocaleString();
    // [10/9] 단문(90바이트) 안 — 장문 단가 회피. 두 자리 건수·6자리 포인트여도 79바이트
    const head = count > 1 ? `제보 ${count}건 채택! 총 ${points}P 적립.` : `제보 채택! ${points}P 적립.`;
    const text = allReady
        ? `[수학ETF] ${head} 한글파일은 ${count > 1 ? '마이페이지 구매내역(30일)' : '마이페이지 구매내역에서(30일)'}`
        : `[수학ETF] ${head} 한글파일은 ${count > 1 ? '완성되면 마이페이지에' : '완성되면 마이페이지에 드려요'}`;
    return { text, sms: await sendNotice(phone, text, { quietHours: true }) };
}
