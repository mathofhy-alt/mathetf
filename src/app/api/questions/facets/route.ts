import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { buildDbOrConditions } from '@/lib/questions/dbFilter';

export const dynamic = 'force-dynamic';

/**
 * 문제 메타데이터(facets) 서버 라우트. 콘텐츠(content_xml/이미지)는 반환하지 않음.
 *
 * GET  → 홈/통계용: { count, schoolCount } (전체 sorted 기준)
 * POST { selectedDbs } → FilterSidebar 트리용: { data: [{subject, unit, key_concepts}] }
 */

export async function GET() {
    const supabase = createAdminClient();
    try {
        const { count } = await supabase
            .from('questions')
            .select('id', { count: 'exact', head: true })
            .eq('work_status', 'sorted');

        const { data: schools } = await supabase
            .from('questions')
            .select('school')
            .eq('work_status', 'sorted')
            .not('school', 'is', null);

        const uniqueSchools = new Set((schools || []).map((s: any) => s.school).filter(Boolean));
        return NextResponse.json({ success: true, count: count ?? 0, schoolCount: uniqueSchools.size });
    } catch (e: any) {
        console.error('[questions/facets GET] error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 });
    }

    const selectedDbs = Array.isArray(body?.selectedDbs) ? body.selectedDbs : [];
    const purchasedDbsCount = Number(body?.purchasedDbsCount) || 0;
    if (selectedDbs.length === 0) {
        return NextResponse.json({ success: true, data: [] });
    }

    const supabase = createAdminClient();
    // [버그수정] search 라우트와 동일한 DB 필터 로직을 써야 사이드바 옵션 = 검색결과.
    // - 전체선택(관리자) → 필터 스킵(전부)  - 21개 이상 → school IN  - 그 외 → orConditions
    const isAllSelected = selectedDbs.length >= purchasedDbsCount && purchasedDbsCount > 0;
    const buildQuery = () => {
        let q = supabase.from('questions').select('subject, unit, key_concepts').eq('work_status', 'sorted');
        if (!isAllSelected) {
            if (selectedDbs.length > 20) {
                const schools = [...new Set(selectedDbs.map((db: any) => db.school))];
                q = q.in('school', schools);
            } else {
                const orConditions = buildDbOrConditions(selectedDbs);
                if (orConditions.length > 0) q = q.or(orConditions.join(','));
            }
        }
        return q;
    };

    // [버그수정] range/limit 없으면 Supabase 기본 1000행만 옴 → 단원별 개념태그 누락.
    // 전체 페이지를 받아 모든 단원의 key_concepts 를 빠짐없이 집계.
    const PAGE = 1000;
    const allRows: any[] = [];
    let from = 0;
    while (true) {
        const { data, error } = await buildQuery().range(from, from + PAGE - 1);
        if (error) {
            console.error('[questions/facets POST] error:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return NextResponse.json({ success: true, data: allRows });
}
