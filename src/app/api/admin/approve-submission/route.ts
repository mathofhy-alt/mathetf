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

    // [11/9] 1,000건 한 번만 읽던 것을 끝까지 나눠 읽는다 — 채택이 1,177건을 넘자 나머지가 '검토 중' 탭에 다시 떴다
    const admin = createAdminClient();
    const ids: string[] = [];
    for (let from = 0; ; from += 1000) {
        const { data, error } = await admin
            .from('point_transactions')
            .select('id, related_id')
            .eq('type', REWARD_TYPE)
            .order('id')
            .range(from, from + 999);
        if (error) return NextResponse.json({ error: '채택 목록을 불러오지 못했습니다.' }, { status: 500 });
        for (const x of data || []) if (x.related_id) ids.push(String(x.related_id));
        if (!data || data.length < 1000) break;
    }
    return NextResponse.json({ ids });
}
