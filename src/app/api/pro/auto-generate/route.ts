
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const supabase = createClient();

        // ✅ 인증 확인 (기존: 인증 없음 → 누구나 호출 가능)
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
        }

        // ✅ 파라미터명 클라이언트와 일치 (기존: difficulty 단일값 → minDifficulty/maxDifficulty 범위)
        const { subject, unit, minDifficulty, maxDifficulty, count } = await req.json();

        let query = supabase
            .from('questions')
            .select('*')
            .eq('work_status', 'sorted'); // ✅ 검수 완료 문제만 (기존: 필터 없음)

        if (subject) query = query.eq('subject', subject);

        if (unit && Array.isArray(unit) && unit.length > 0) {
            query = query.in('unit', unit);
        } else if (unit && typeof unit === 'string') {
            query = query.eq('unit', unit);
        }

        // ✅ 난이도 범위 필터 (기존: 단일 difficulty ±1 퍼지 매칭)
        if (minDifficulty !== undefined && maxDifficulty !== undefined) {
            const min = Number(minDifficulty);
            const max = Number(maxDifficulty);
            if (!isNaN(min) && !isNaN(max)) {
                // difficulty 컬럼이 문자열이므로 in() 으로 처리
                const diffs = Array.from(
                    { length: max - min + 1 },
                    (_, i) => String(min + i)
                );
                query = query.in('difficulty', diffs);
            }
        }

        // 후보 풀 가져오기 (count의 3배 여유분)
        const poolSize = Math.min((count || 10) * 3, 150);
        const { data, error } = await query.limit(poolSize);

        if (error) throw error;
        if (!data || data.length === 0) return NextResponse.json({ questions: [] });

        // ✅ Fisher-Yates 셔플 (기존: sort(() => Math.random()) - 수학적으로 편향됨)
        const arr = [...data];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        const selected = arr.slice(0, count || 10);

        return NextResponse.json({ questions: selected });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
