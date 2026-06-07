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
    if (selectedDbs.length === 0) {
        return NextResponse.json({ success: true, data: [] });
    }

    const supabase = createAdminClient();
    let query = supabase.from('questions').select('subject, unit, key_concepts').eq('work_status', 'sorted');

    // [버그수정] 이전엔 facets가 search와 다른(모의고사 분기 누락 등) orConditions를 써서
    // 사이드바 필터 옵션이 검색결과와 어긋났음. 이제 search와 동일한 공용 헬퍼 사용.
    const orConditions = buildDbOrConditions(selectedDbs);
    if (orConditions.length > 0) query = query.or(orConditions.join(','));

    const { data, error } = await query;
    if (error) {
        console.error('[questions/facets POST] error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data || [] });
}
