import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { approveSubmission, ApproveError } from '@/lib/approveSubmission';

export const dynamic = 'force-dynamic';

const REWARD_TYPE = 'submission_reward';

// 원본 제보 채택 → 제보자에게 보상 지급 (멱등 — 같은 제보에 중복 지급 불가). 본문은 lib/approveSubmission.ts(등록 스크립트와 공용, 10/8)
export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    try {
        const { id } = await req.json().catch(() => ({}));
        if (!id) return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });
        return NextResponse.json(await approveSubmission(id));
    } catch (e: any) {
        if (e instanceof ApproveError) return NextResponse.json({ error: e.message }, { status: e.status });
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
