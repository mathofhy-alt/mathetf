import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { buildSourceDbId } from '@/lib/examKey';

export const dynamic = 'force-dynamic';

/**
 * GET /api/questions/resume
 *
 * "직전에 받아간 회차"를 돌려준다. 시험지 출제 도구의 빈 화면에서 한 번에 담기 위한 것.
 *
 * 왜 만들었나 (2026-09-13 실측, 8/26~9/12):
 *   빈 화면으로 도구에 들어온 82명 중 32명(39%)이 DB선택도 검색도 하지 않고 그냥 나갔다.
 *   그 32명 중 21명은 이미 무료PDF 를 받아본 사람이다 — 즉 만들고 싶은 학교가 있는데
 *   도구 첫 화면이 히어로·배너라 무엇을 눌러야 하는지가 없었다.
 *   ?src= 로 들어오면 장바구니가 채워진 채 열리는 길은 이미 있었다(2026-08-30).
 *   그 길을 '직접 들어온 사람'에게도 열어주는 게 이 API 다.
 *
 * ⚠ 새 문항을 여는 게 아니다. 이미 그 사람이 무료PDF 로 받아간 회차만 돌려준다.
 */
const LOOKBACK = 20;          // 최근 무료PDF 몇 건까지 훑을지
const MAX_TRIES = 6;          // 후보 회차 조회 상한. Supabase MICRO 라 왕복을 늘리지 않는다.

export async function GET() {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: true, item: null });

    const admin = createAdminClient();

    const { data: rows } = await admin
        .from('feature_usage')
        .select('title, created_at')
        .eq('user_id', user.id)
        .eq('feature', 'free_pdf')
        .order('created_at', { ascending: false })
        .limit(LOOKBACK);
    if (!rows?.length) return NextResponse.json({ ok: true, item: null });

    // 파일명 규약: {학교}_{연도}_{학년}_{학기}_{시험종류}_문제.pdf
    const seen = new Set<string>();
    for (const r of rows) {
        const p = String(r.title || '').replace(/\.pdf$/i, '').split('_');
        if (p.length < 5) continue;
        const [school, year, grade, semester, examType] = p;
        const key = p.slice(0, 5).join('_');
        if (seen.has(key)) continue;
        seen.add(key);
        if (seen.size > MAX_TRIES) break;
        if (!/^\d{4}$/.test(year)) continue;

        // 같은 회차의 과목을 알아야 source_db_id 를 만들 수 있다.
        const { data: mats } = await admin
            .from('exam_materials')
            .select('school, exam_year, semester, exam_type, subject, grade')
            .eq('school', school).eq('exam_year', year)
            .eq('grade', grade).eq('semester', semester)
            .eq('exam_type', examType)
            .not('subject', 'is', null)
            .limit(5);
        if (!mats?.length) continue;

        for (const m of mats) {
            const src = buildSourceDbId(m);
            if (!src) continue;
            // 문항이 실제로 있어야 '담기'가 의미가 있다. 없으면 다음 후보로.
            const { count } = await admin
                .from('questions')
                .select('id', { count: 'exact', head: true })
                .eq('source_db_id', src)
                .eq('work_status', 'sorted');
            if (!count) continue;

            return NextResponse.json({
                ok: true,
                item: {
                    src,
                    school,
                    count,
                    label: `${school} ${year}년 ${grade}학년 ${semester}학기 ${examType} ${m.subject}`,
                },
            });
        }
    }

    return NextResponse.json({ ok: true, item: null });
}
