import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { buildDbOrConditions } from '@/lib/questions/dbFilter';

export const dynamic = 'force-dynamic';

/**
 * POST /api/questions/search
 *
 * 문제 검색 전용 서버 라우트.
 * - questions/question_images 테이블의 RLS를 잠근 뒤, 콘텐츠는 오직 이 서버 라우트를 통해서만 나간다.
 * - 서비스 롤로 실행되므로 RLS를 우회하지만, 페이지 크기 상한 + IP 속도제한으로 "원클릭 전체 덤프"를 막는다.
 * - 검색/맛보기는 비로그인도 가능 (성장 우선). 단 대량 스크래핑은 제한.
 *
 * 기존 client fetchQuestions(question-bank/page.tsx)의 쿼리 로직을 그대로 서버로 옮긴 것.
 */

const PAGE_SIZE_MAX = 50; // 서버 강제 상한 ("전부 한 번에" 불가)

// ── 경량 IP 속도제한 (best-effort, 인스턴스 단위) ──
// 사람은 절대 안 걸리고 봇만 걸리는 수준. 운영 강화 시 Upstash/Redis 권장.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40; // 분당 검색 요청 수
const hits: Map<string, { count: number; resetAt: number }> = (globalThis as any).__qsearch_hits || new Map();
(globalThis as any).__qsearch_hits = hits;

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

    const {
        selectedDbs = [],          // 선택된 DB 메타데이터 배열 (카탈로그 정보, 비민감)
        purchasedDbsCount = 0,     // 전체 가용 DB 수 (isAllSelected 판단용)
        excludedQuestionIds = [],  // 중복출제 방지용 제외 ID
        advancedFilters = null,    // 단원/개념/난이도/과목/키워드
        page = 1,
    } = body || {};

    // DB 필터가 전혀 없으면 결과 없음 (구매하지 않은 'sorted' 문항 유출 방지)
    if (!Array.isArray(selectedDbs)) {
        return NextResponse.json({ success: true, data: [], count: 0 });
    }

    const targetPage = Math.max(1, Number(page) || 1);
    const from = (targetPage - 1) * PAGE_SIZE_MAX;
    const to = from + PAGE_SIZE_MAX - 1;

    const supabase = createAdminClient();

    // [성능] 카드 표시는 캡쳐 이미지(question_images)로만 함 (sorted 문제 100% 캡쳐 보유).
    // content_xml/plain_text/equation_scripts 는 표시에 불필요 → 전송 제외 (payload ~74% 감소, 클라 XML 파싱 0).
    // plain_text 는 키워드 검색 '조건'으로만 쓰이며 SELECT 하지 않아도 WHERE 에서 동작함.
    // [성능] 전체 개수(count)는 1페이지에서만 계산 → 페이지 이동마다 풀카운트 재계산 방지.
    const wantCount = targetPage === 1;
    // [성능] 이미지(question_images)는 더 이상 검색 응답에 싣지 않는다.
    // BMP 등 무거운 base64가 섞이면 응답이 수 MB로 커져 검색 체감속도가 들쭉날쭉하던 원인.
    // 카드 골격은 이 메타데이터로 즉시 뜨고, 이미지는 /api/questions/images 가 청크로 따라간다.
    const SELECT_COLS = 'id, question_number, subject, grade, school, year, semester, difficulty, key_concepts, unit, work_status, source_db_id, question_type';
    let query = supabase
        .from('questions')
        .select(SELECT_COLS, wantCount ? { count: 'exact' } : undefined)
        .eq('work_status', 'sorted')
        .order('question_number', { ascending: true })
        .range(from, to);

    // 중복출제 방지
    if (Array.isArray(excludedQuestionIds) && excludedQuestionIds.length > 0) {
        const chunk = excludedQuestionIds.slice(0, 100);
        query = query.not('id', 'in', `(${chunk.join(',')})`);
    }

    if (selectedDbs.length > 0) {
        const isAllSelected = selectedDbs.length >= purchasedDbsCount && purchasedDbsCount > 0;

        if (!isAllSelected) {
            if (selectedDbs.length > 20) {
                const schools = [...new Set(selectedDbs.map((db: any) => db.school))];
                query = query.in('school', schools);
            } else {
                const orConditions = buildDbOrConditions(selectedDbs);
                if (orConditions.length > 0) query = query.or(orConditions.join(','));
            }
        }
    } else {
        // 매칭 DB 없으면 결과 0건 보장
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    }

    // 고급 필터
    if (advancedFilters) {
        if (advancedFilters.units && advancedFilters.units.length > 0) {
            query = query.in('unit', advancedFilters.units);
        }
        if (advancedFilters.concepts && advancedFilters.concepts.length > 0) {
            query = query.overlaps('key_concepts', advancedFilters.concepts);
        }
        if (advancedFilters.difficulty && advancedFilters.difficulty.length > 0) {
            query = query.in('difficulty', advancedFilters.difficulty);
        }
        if (advancedFilters.subjects && advancedFilters.subjects.length > 0) {
            query = query.in('subject', advancedFilters.subjects);
        }
        if (advancedFilters.keywords && advancedFilters.keywords.length > 0) {
            advancedFilters.keywords.forEach((keyword: string) => {
                const term = (keyword || '').trim();
                if (term) query = query.ilike('plain_text', `%${term}%`);
            });
        }
    }

    try {
        const { data, error, count } = await query;
        if (error) {
            console.error('[questions/search] query error:', error);
            return NextResponse.json(
                { success: false, error: '데이터베이스 검색 중 오류가 발생했습니다. (검색 조건이 너무 많을 수 있습니다)' },
                { status: 500 }
            );
        }
        // count 는 1페이지에서만 계산. 그 외 페이지는 null → 클라이언트가 기존 총개수 유지.
        return NextResponse.json({ success: true, data: data || [], count: wantCount ? (count ?? 0) : null });
    } catch (e: any) {
        console.error('[questions/search] error:', e);
        return NextResponse.json({ success: false, error: e.message || '검색 실패' }, { status: 500 });
    }
}
