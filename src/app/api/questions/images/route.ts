import { NextRequest, NextResponse } from 'next/server';
import { stripPrivate } from '@/lib/questions/privateDb';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { canSeeSolutions, trimQuestionImages } from '@/lib/questions/imageAccess';

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
        // [성능 2026-10-01] 카드는 캡쳐(MANUAL_/AUTO_)가 있으면 캡쳐만 그린다(QuestionRenderer manualCaps).
        // 그런데 한글 원본 그림(BMP·PNG base64)까지 같이 보내 응답의 98%가 버려지고 있었다
        // (실측: 문항 50개에 원본 그림 1MB, 실제 쓰는 캡쳐 주소 15KB).
        // → 먼저 data 없이 목록만 읽고 거른 뒤(lib/questions/imageAccess), 남은 행의 data 만 읽는다.
        // [보안 2026-10-02] 해설 캡쳐는 로그인한 사람에게만 — 세션 확인은 목록 조회와 동시에 해서 지연이 없다.
        const [withSolutions, { data: listed, error: listError }] = await Promise.all([
            canSeeSolutions(),
            supabase
                .from('question_images')
                .select('question_id, id, original_bin_id, format, created_at')
                .in('question_id', ids)
                .order('created_at', { ascending: true }),
        ]);
        if (listError) throw listError;
        // 회원 전용 개인DB 문항 그림은 쓸 수 있는 사람에게만 (10/6)
        // [10/7] 공개(sorted)가 아닌 문항은 전부 막고, 전용(private)만 쓸 수 있는 사람에게 연다 — 등록 대기(pending) 시중교재 보호
        const { data: privRows } = await supabase.from('questions').select('id, work_status, source_db_id').in('id', ids).neq('work_status', 'sorted');
        const blocked = new Set<string>();
        if (privRows?.length) {
            const ok = new Set((await stripPrivate(privRows.filter(r => r.work_status === 'private'))).map(r => r.id));
            for (const r of privRows) if (!ok.has(r.id)) blocked.add(r.id);
        }
        const byQuestion: Record<string, any[]> = {};
        for (const r of listed || []) if (!blocked.has(r.question_id)) (byQuestion[r.question_id] = byQuestion[r.question_id] || []).push(r);
        const keep = Object.values(byQuestion).flatMap(rows => trimQuestionImages(rows, withSolutions));
        const dataById: Record<string, string> = {};
        for (let i = 0; i < keep.length; i += 100) {
            const { data: rows, error } = await supabase.from('question_images').select('id, data').in('id', keep.slice(i, i + 100).map(r => r.id));
            if (error) throw error;
            for (const r of rows || []) dataById[r.id] = r.data;
        }
        const data = keep.map(({ created_at, ...r }) => ({ ...r, data: dataById[r.id] ?? '' }));

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
