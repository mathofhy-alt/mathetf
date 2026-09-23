import { NextRequest, NextResponse } from 'next/server';
import { getSiteStats } from '@/lib/stats';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { availableCatalog } from '@/lib/questions/catalog';
import { resolveScope } from '@/lib/questions/scope';

export const dynamic = 'force-dynamic';

/**
 * 문제 메타데이터(facets) 서버 라우트. 콘텐츠(content_xml/이미지)는 반환하지 않음.
 *
 * GET  → 홈/통계용: { count, schoolCount } (전체 sorted 기준)
 * POST { selectedDbs } → FilterSidebar 트리용: { data: [{subject, unit, key_concepts}] }
 */

export async function GET() {
    try {
        // 예전엔 questions 에서 school 을 통째로 받아 Set 크기를 셌다.
        // PostgREST 가 1,000행에서 자르는 바람에 14,394문항 중 앞 1,000개만 보고
        // **학교 8개**라고 답하고 있었다(실제 121). 시험지 출제 도구 첫 화면이 그 값을 띄웠다.
        const { questionCount, schoolCount } = await getSiteStats();
        return NextResponse.json({ success: true, count: questionCount, schoolCount });
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
    // [교과외] 검색(search 라우트)과 같은 기준이어야 사이드바 옵션 = 실제 결과가 맞는다.
    const includeOffCurriculum = body?.includeOffCurriculum === true;
    if (selectedDbs.length === 0) {
        return NextResponse.json({ success: true, data: [] });
    }

    const supabase = createAdminClient();
    let scope;
    try { scope = resolveScope(await availableCatalog(), selectedDbs, body.mockSlug); }
    catch (e) { return NextResponse.json({ success: false, error: (e as Error).message }, { status: 400 }); }
    const {data,error}=await supabase.rpc('question_bank_facets',{p_scope:scope,p_include_off:includeOffCurriculum});
    if(error) return NextResponse.json({success:false,error:'출제 가능한 단원을 불러오지 못했습니다.'},{status:503});
    return NextResponse.json({success:true,data:data||[]});
}
