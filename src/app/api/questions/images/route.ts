import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/questions/images
 *
 * 검색 결과 카드의 이미지 지연 로딩용.
 * - /api/questions/search 는 메타데이터만 반환(카드 즉시 표시) → 이미지는 이 라우트가 청크로 공급.
 * - 검색 라우트와 동일한 보안 수준: 서비스 롤 + 요청당 ID 상한 + IP 속도제한.
 */

const IDS_MAX = 20;            // 요청당 문제 ID 상한 (클라이언트 청크 크기와 맞춤)
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 200;          // 검색 1회당 이미지 요청 ~5회 발생 → 검색(40/분)보다 높게
const hits: Map<string, { count: number; resetAt: number }> = (globalThis as any).__qimages_hits || new Map();
(globalThis as any).__qimages_hits = hits;

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (rateLimited(ip)) {
        return NextResponse.json(
            { success: false, error: '잠시 후 다시 시도해주세요. (요청이 너무 많습니다)' },
            { status: 429 }
        );
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 });
    }

    const rawIds = Array.isArray(body?.ids) ? body.ids : [];
    const ids = rawIds.filter((x: any) => typeof x === 'string' && UUID_RE.test(x)).slice(0, IDS_MAX);
    if (ids.length === 0) {
        return NextResponse.json({ success: true, images: {} });
    }

    const supabase = createAdminClient();
    try {
        const { data, error } = await supabase
            .from('question_images')
            .select('question_id, data, id, original_bin_id, format')
            .in('question_id', ids)
            .order('created_at', { ascending: true });
        if (error) throw error;

        // 요청한 모든 ID에 대해 키를 보장 (이미지 없는 문제 = 빈 배열 → 클라가 '로딩 끝'으로 인식)
        const images: Record<string, any[]> = {};
        for (const id of ids) images[id] = [];
        for (const row of data || []) {
            (images[row.question_id] = images[row.question_id] || []).push(row);
        }
        return NextResponse.json({ success: true, images });
    } catch (e: any) {
        console.error('[questions/images] error:', e);
        return NextResponse.json({ success: false, error: e.message || '이미지 로딩 실패' }, { status: 500 });
    }
}
