import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/questions/by-ids   { ids: string[] }
 *
 * 특정 ID의 문제들을 조회 (장바구니 복원 / 시험지 재편집용).
 * RLS 잠금 후 클라이언트가 questions를 직접 못 읽으므로 서버 경유.
 *
 * [보안] content_xml(편집 가능한 원본)은 반환하지 않음.
 *  - 카드 표시는 100% 캡쳐 이미지로 이루어지고, 저장/생성은 ID로 서버가 재조회하므로
 *    클라이언트는 content_xml 이 필요 없음. → 원본 대량 추출(스크래핑) 경로 차단.
 *  - ID를 이미 알아야 하고, 개수 상한 + IP 속도제한으로 대량 덤프 방지.
 */
const MAX_IDS = 200;

// 경량 IP 속도제한 (search 라우트와 동일 정책)
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;
const hits: Map<string, { count: number; resetAt: number }> = (globalThis as any).__qbyids_hits || new Map();
(globalThis as any).__qbyids_hits = hits;
function rateLimited(ip: string): boolean {
    const now = Date.now();
    const rec = hits.get(ip);
    if (!rec || now > rec.resetAt) {
        hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return false;
    }
    rec.count++;
    return rec.count > RATE_MAX;
}

const SELECT_COLS = 'id, question_number, subject, grade, school, year, semester, difficulty, key_concepts, unit, work_status, source_db_id, question_type, question_images(question_id, data, id, original_bin_id, format)';

export async function POST(req: NextRequest) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (rateLimited(ip)) {
        return NextResponse.json({ success: false, error: '잠시 후 다시 시도해주세요. (요청이 너무 많습니다)' }, { status: 429 });
    }

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
        .select(SELECT_COLS)
        .in('id', ids);

    if (error) {
        console.error('[questions/by-ids] error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data || [] });
}
