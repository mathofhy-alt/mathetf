import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { REPORT_REWARD_POINTS } from '@/lib/report-reward';

export const dynamic = 'force-dynamic';

const REWARD_POINTS = REPORT_REWARD_POINTS;
const REWARD_TYPE = 'submission_reward';

// 원본 제보 채택 → 제보자에게 보상 지급(금액은 lib/report-reward.ts) (멱등 — 같은 제보에 중복 지급 불가)
export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const admin = createAdminClient();

    try {
        const { id } = await req.json().catch(() => ({}));
        if (!id) return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });

        // [10/5] 예전엔 없는 칸(submitter_id)까지 읽어 조회가 늘 실패했고, 그걸 '원본 제보가 아님'으로 보고했다
        //   → 채택이 한 번도 성공하지 못했다. 제보자는 uploader_id 에 있다. 조회 실패는 따로 알린다.
        const { data: row, error: rowErr } = await admin
            .from('exam_materials')
            .select('id, school, title, content_type, uploader_id')
            .eq('id', id)
            .maybeSingle();
        if (rowErr) throw rowErr;
        if (!row || row.content_type !== '원본제보') {
            return NextResponse.json({ error: '원본 제보 자료가 아닙니다.' }, { status: 404 });
        }
        const recipient = row.uploader_id;
        if (!recipient) return NextResponse.json({ error: '제보자 정보가 없습니다.' }, { status: 400 });

        // 멱등: 이미 이 제보로 지급된 이력이 있으면 차단
        const { data: dup } = await admin
            .from('point_transactions')
            .select('id')
            .eq('related_id', id)
            .eq('type', REWARD_TYPE)
            .limit(1)
            .maybeSingle();
        if (dup) return NextResponse.json({ error: '이미 보상이 지급된 제보입니다.' }, { status: 409 });

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
            if (logErr.code === '23505') return NextResponse.json({ error: '이미 보상이 지급된 제보입니다.' }, { status: 409 });
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

        return NextResponse.json({ ok: true, rewarded: REWARD_POINTS });
    } catch (e: any) {
        console.error('[approve-submission]', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// 지급 완료된 제보 id 목록 (관리자 화면 배지용)
export async function GET() {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const admin = createAdminClient();
    const { data } = await admin
        .from('point_transactions')
        .select('related_id')
        .eq('type', REWARD_TYPE)
        .limit(1000);
    return NextResponse.json({ ids: (data || []).map((x: any) => x.related_id).filter(Boolean) });
}
