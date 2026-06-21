import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

/**
 * GET /api/predict/units?school=중산고등학교&grade=고1&semester=1학기기말
 * 그 학교가 해당 범위에서 실제 출제한 단원 목록(+빈도) 자동추출 → 예상문제 단원 프리필용.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const school = searchParams.get('school');
    const grade = searchParams.get('grade');
    const semester = searchParams.get('semester'); // 예: "1학기기말"

    if (!school || !semester) {
        return NextResponse.json({ units: [], difficulty: { min: 2, max: 6 } });
    }

    try {
        const supabase = createAdminClient();
        let q = supabase
            .from('questions')
            .select('unit, difficulty')
            .eq('school', school)
            .eq('semester', semester)
            .eq('work_status', 'sorted');
        if (grade) q = q.eq('grade', grade);

        const { data } = await q;
        const unitMap: Record<string, number> = {};
        let dmin = 10, dmax = 1, hasDiff = false;
        (data || []).forEach((r: any) => {
            if (r.unit) unitMap[r.unit] = (unitMap[r.unit] || 0) + 1;
            const d = parseInt(r.difficulty);
            if (!isNaN(d)) { dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); hasDiff = true; }
        });
        const units = Object.entries(unitMap)
            .map(([unit, count]) => ({ unit, count }))
            .sort((a, b) => b.count - a.count);

        return NextResponse.json({
            units,
            difficulty: hasDiff ? { min: dmin, max: dmax } : { min: 2, max: 6 },
            hasData: units.length > 0,
        });
    } catch (e: any) {
        return NextResponse.json({ units: [], difficulty: { min: 2, max: 6 }, error: e.message }, { status: 500 });
    }
}
