import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/questions/by-ids   { ids: string[] }
 *
 * 특정 ID의 문제들을 콘텐츠 포함해서 조회 (장바구니 복원 / 시험지 재편집용).
 * RLS 잠금 후 클라이언트가 questions를 직접 못 읽으므로 서버 경유.
 * - ID를 이미 알고 있어야만 조회 가능 + 개수 상한 → 대량 스크래핑 불가.
 */
const MAX_IDS = 200;

export async function POST(req: NextRequest) {
    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 });
    }

    const ids = Array.isArray(body?.ids) ? body.ids.slice(0, MAX_IDS) : [];
    if (ids.length === 0) {
        return NextResponse.json({ success: true, data: [] });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('questions')
        .select('*, question_images(*)')
        .in('id', ids);

    if (error) {
        console.error('[questions/by-ids] error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data || [] });
}
