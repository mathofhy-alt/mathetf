import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

const REWARD_POINTS = 10000;
const REWARD_TYPE = 'submission_reward';

// 원본 제보 채택 → 제보자에게 10,000P 지급 (멱등 — 같은 제보에 중복 지급 불가)
export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const admin = createAdminClient();

    try {
        const { id } = await req.json().catch(() => ({}));
        if (!id) return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });

        const { data: row } = await admin
            .from('exam_materials')
            .select('id, school, title, content_type, submitter_id, uploader_id')
            .eq('id', id)
            .maybeSingle();
        if (!row || row.content_type !== '원본제보') {
            return NextResponse.json({ error: '원본 제보 자료가 아닙니다.' }, { status: 404 });
        }
        const recipient = row.submitter_id || row.uploader_id;
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

        // 포인트 적립 (earned_points)
        const { data: profile } = await admin
            .from('profiles')
            .select('earned_points')
            .eq('id', recipient)
            .maybeSingle();
        if (profile) {
            const { error: upErr } = await admin
                .from('profiles')
                .update({ earned_points: (profile.earned_points || 0) + REWARD_POINTS })
                .eq('id', recipient);
            if (upErr) throw upErr;
        } else {
            const { error: insErr } = await admin
                .from('profiles')
                .insert({ id: recipient, earned_points: REWARD_POINTS, purchased_points: 0 });
            if (insErr) throw insErr;
        }

        const { error: logErr } = await admin.from('point_transactions').insert({
            user_id: recipient,
            type: REWARD_TYPE,
            amount: REWARD_POINTS,
            description: `기출 제보 채택 보상: ${row.school} ${row.title}`,
            related_id: id,
        });
        if (logErr) throw logErr;

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
