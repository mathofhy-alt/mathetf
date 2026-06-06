import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

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

    const orConditions = selectedDbs.map((db: any) => {
        let gradeVal = db.grade;
        if (['1', '2', '3'].includes(String(db.grade))) {
            gradeVal = `고${db.grade}`;
        } else if (typeof db.grade === 'string' && !db.grade.startsWith('고') && !isNaN(Number(db.grade))) {
            gradeVal = `고${db.grade}`;
        }

        const titleYear = db.title?.match(/20\d{2}/)?.[0];
        let yearVal = titleYear ? titleYear : (db.exam_year || db.year);

        let parts = [`school.eq.${db.school}`];
        if (gradeVal) parts.push(`grade.eq.${gradeVal}`);
        if (yearVal) parts.push(`year.eq.${yearVal}`);

        if (db.semester && db.exam_type) {
            const semNum = String(db.semester).replace('학기', '');
            const typeShort = db.exam_type.includes('중간') ? '중간' : (db.exam_type.includes('기말') ? '기말' : '');
            if (typeShort) parts.push(`semester.eq.${semNum}학기${typeShort}`);
        } else if (db.semester) {
            const semNum = String(db.semester).replace('학기', '');
            parts.push(`semester.ilike.${semNum}학기%`);
        }

        if (db.subject && db.subject !== '전과정') {
            const MOCK_SELECT_SUBJECTS = ['기하와벡터', '미적분II', '확률과통계', '확률과 통계'];
            const isMockSelect = (db.exam_type === '모의고사' || db.exam_type === '수능')
                && MOCK_SELECT_SUBJECTS.includes(db.subject);
            if (isMockSelect) {
                parts.push(`subject.in.("대수","미적분I","${db.subject}")`);
            } else {
                parts.push(`subject.eq.${db.subject}`);
            }
        }

        return `and(${parts.join(',')})`;
    });

    if (orConditions.length > 0) query = query.or(orConditions.join(','));

    const { data, error } = await query;
    if (error) {
        console.error('[questions/facets POST] error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data || [] });
}
