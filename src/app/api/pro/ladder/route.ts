import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pro/ladder  { id: string }
 *
 * 목표 문항 하나를 받아 **가르치는 순서대로 쌓은 3단 사다리**를 돌려준다.
 *   1단 기초 → 2단 유형 → 3단 목표 문항
 *
 * [왜]
 * 사용자(현직 수학 강사)의 설명(2026-08-30):
 *   시험 직후에 필요한 건 '숫자 변형 재시험', 숙제로 내주는 건 '비슷한 문제',
 *   그리고 **수업을 구성할 때 필요한 건 쉬운 것부터 올라가는 사다리**다.
 * 앞의 둘은 이미 있는 기능(유사문항)에 가깝거나(숙제) 정답 재계산이 필요해 위험하다(숫자 변형).
 * 사다리는 있는 문항을 난이도순으로 찾는 것뿐이라 지금 만들 수 있다.
 *
 * [데이터가 받쳐주는지 먼저 쟀다 — 2026-08-30]
 *   난이도 분포가 아래로 쏠려 있다(1:3,014 2:2,846 3:3,169 4:2,426 5:1,832 6:833 7:500 8:138 9:3).
 *   그래서 '난이도 8=킬러' 로 잡으면 대상이 141개뿐이다. 5 이상을 앵커로 잡으면 3,306개가 되고,
 *   그중 **95%가 아래 2단을 채울 수 있다**(같은 단원 + 개념태그 겹침 기준).
 *
 * 짝짓기 규칙: 같은 unit + key_concepts 가 하나라도 겹칠 것. 겹치는 개념이 많은 순으로 고른다.
 */

const MAX_POOL = 400;

type Row = { id: string; unit: string | null; difficulty: number | null; key_concepts: any; question_number: any; subject: string | null };

const concepts = (q: Row): Set<string> => {
    const k = q.key_concepts;
    const arr = Array.isArray(k) ? k : typeof k === 'string' ? [k] : [];
    return new Set(arr.map((x: any) => String(x).replace(/^#/, '').trim()).filter(Boolean));
};
const diff = (q: Row) => Number(q.difficulty) || 0;

export async function POST(req: NextRequest) {
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 }); }
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ success: false, error: '문항 id가 없습니다.' }, { status: 400 });

    const supabase = createAdminClient();
    const { data: target, error: e1 } = await supabase
        .from('questions')
        .select('id, unit, difficulty, key_concepts, question_number, subject')
        .eq('id', id)
        .single();
    if (e1 || !target) return NextResponse.json({ success: false, error: '문항을 찾을 수 없습니다.' }, { status: 404 });

    const t = target as Row;
    const td = diff(t);
    const tc = concepts(t);
    if (!t.unit || tc.size === 0 || td < 2) {
        return NextResponse.json({ success: true, steps: [], reason: '이 문항은 단원·개념 정보가 부족해 사다리를 만들 수 없습니다.' });
    }

    // 같은 단원 후보만 끌어온다(문항 14,764개 전체를 뒤지지 않는다)
    const { data: pool, error: e2 } = await supabase
        .from('questions')
        .select('id, unit, difficulty, key_concepts, question_number, subject')
        .eq('work_status', 'sorted')
        .eq('unit', t.unit)
        .neq('id', t.id)
        .limit(MAX_POOL);
    if (e2) return NextResponse.json({ success: false, error: e2.message }, { status: 500 });

    // 목표 난이도를 3등분: [1 ~ a) 기초, [a ~ td) 유형
    const a = Math.max(2, Math.round(td * 0.45));
    const bands: { label: string; lo: number; hi: number }[] = [
        { label: '기초', lo: 1, hi: a },
        { label: '유형', lo: a, hi: td },
    ];

    const used = new Set<string>();
    const steps: any[] = [];
    for (const b of bands) {
        const cands = (pool || [])
            .map((q) => q as Row)
            .filter((q) => !used.has(q.id) && diff(q) >= b.lo && diff(q) < b.hi)
            .map((q) => {
                const overlap = [...concepts(q)].filter((c) => tc.has(c)).length;
                return { q, overlap };
            })
            .filter((x) => x.overlap > 0)
            // 개념이 많이 겹치는 것 우선, 같으면 목표 난이도에 가까운 것
            .sort((x, y) => y.overlap - x.overlap || diff(y.q) - diff(x.q));
        if (cands.length === 0) continue;
        used.add(cands[0].q.id);
        steps.push({ label: b.label, difficulty: diff(cands[0].q), id: cands[0].q.id });
    }
    steps.push({ label: '목표', difficulty: td, id: t.id });

    return NextResponse.json({ success: true, steps, targetDifficulty: td, unit: t.unit });
}
