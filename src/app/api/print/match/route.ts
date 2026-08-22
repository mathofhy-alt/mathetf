import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { readCrop } from '@/lib/print-vision';
import { generateEmbedding } from '@/lib/embeddings';
import { unitVariants, SUBJECT_UNITS } from '@/lib/curriculum';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALL_VARIANTS = Array.from(new Set(Object.values(SUBJECT_UNITS).flat().flatMap((u) => unitVariants(u))));

// 단원 → 과목 역인덱스. 크롭에서 읽은 단원으로 과목을 되짚어 쿼리 텍스트에 넣는다.
const UNIT_TO_SUBJECT: Record<string, string> = {};
for (const [subj, units] of Object.entries(SUBJECT_UNITS)) {
    for (const u of units as string[]) if (!UNIT_TO_SUBJECT[u]) UNIT_TO_SUBJECT[u] = subj;
}

/**
 * DB 의 embedding 은 `[핵심개념태그: …]\n[과목: X] [학년: Y] 본문+해설 수식…` 형식으로 만들어져 있다
 * (scratch_batch_ai.ts). 그런데 여기서는 제미나이가 쓴 요약 한 문단만 임베딩하고 있었다.
 * 형식이 달라 벡터가 멀어지고, 같은 문제끼리도 유사도가 0.55 밖에 안 나왔다.
 * 같은 얼개로 감싸면 상위 8건의 단원 일치가 크게 올라간다(측정, 문항 5개 40칸):
 *   요약만 18/40 → 태그+과목 32/40, 유사도도 0.60 → 0.75 대.
 */
function buildQueryText(reading: { text: string; unit: string | null; concepts: string[] }): string {
    const tag = reading.concepts?.length ? `[핵심개념태그: ${reading.concepts.join(', ')}]\n` : '';
    const subj = reading.unit ? UNIT_TO_SUBJECT[reading.unit] : '';
    return `${tag}${subj ? `[과목: ${subj}] ` : ''}${reading.text}`;
}

/**
 * POST /api/print/match  { image: base64(데이터 접두사 제거), mimeType }
 * 크롭 문제 이미지 → Gemini 읽기 → OpenAI 임베딩 → match_predict 로 유사문제 후보 반환.
 * 가입회원 전용.
 */
export async function POST(req: NextRequest) {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

    try {
        const body = await req.json().catch(() => ({}));
        let image: string = body?.image || '';
        const mimeType: string = body?.mimeType || 'image/png';
        const want = Math.min(Math.max(Number(body?.count) || 8, 1), 12);
        if (!image) return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
        // data URL 접두사 제거
        const comma = image.indexOf(',');
        if (image.startsWith('data:') && comma >= 0) image = image.slice(comma + 1);

        // 1) Gemini 로 크롭 읽기
        const reading = await readCrop(image, mimeType);
        if (!reading.text) return NextResponse.json({ error: '문제를 읽지 못했어요. 영역을 더 정확히 잘라보세요.' }, { status: 422 });

        // 2) OpenAI 임베딩 (DB 호환)
        const { embedding } = await generateEmbedding(buildQueryText(reading));
        const vecLit = '[' + embedding.join(',') + ']';

        // 3) match_predict 로 유사문제 검색 (단원 변형 포함, 단원 불명이면 전체)
        const admin = createAdminClient();
        const search = async (targetUnits: string[]) => {
            const { data, error } = await admin.rpc('match_predict', {
                query_embedding: vecLit,
                target_units: targetUnits,
                min_diff: 1,
                max_diff: 10,
                exclude_school: null,
                match_count: want * 3,
            });
            if (error) throw error;
            return data || [];
        };

        // ⚠ '전체 단원' 폴백은 넣었다가 걷어냈다(8/22).
        //   결과가 부족할 때마다 전 단원에서 아무거나 끌어와 '변형문제라 할 수 없는 것들'을
        //   채워 넣었다(사용자 제보). 시험지출제(잘 동작하는 쪽)도 unit 을 엄격히 맞춘다.
        let data = await search(reading.unit ? unitVariants(reading.unit) : ALL_VARIANTS);

        // 다만 DB 에 그 단원 문항이 아예 없는 경우가 있다.
        // 실제 사례: 고1 워크북 10번을 '도형의이동'(정확한 판정!)으로 읽었는데
        //           그 단원의 sorted 문항이 0건이라 결과가 통째로 비었다.
        // 이럴 때만 '같은 과목의 다른 단원'까지 넓힌다 — 전 과목이 아니라 과목 안으로 한정해야
        // 최소한 결이 맞는 문제가 나온다(공통수학2 → 평면좌표·직선의방정식·원의방정식 …).
        let widened = false;
        if (data.length === 0 && reading.unit) {
            const subj = UNIT_TO_SUBJECT[reading.unit];
            const siblings = subj ? (SUBJECT_UNITS as Record<string, string[]>)[subj] : null;
            if (siblings?.length) {
                try {
                    data = await search(siblings.flatMap((u) => unitVariants(u)));
                    widened = true;
                } catch (e) {
                    console.error('[print/match] 같은 과목 폴백 실패(무시):', String(e).slice(0, 120));
                }
            }
        }

        // 출처 편중 방지 → want 개
        const perSource: Record<string, number> = {};
        const picked: any[] = [];
        for (const q of (data || [])) {
            const s = q.source_db_id || '?';
            if ((perSource[s] || 0) >= 2) continue;
            picked.push(q); perSource[s] = (perSource[s] || 0) + 1;
            if (picked.length >= want) break;
        }

        return NextResponse.json({
            reading: { unit: reading.unit, concepts: reading.concepts },
            candidates: picked,
            // 넓혀서 찾았으면 화면에 알린다 — 같은 단원이 아니라는 걸 숨기면
            // '이상한 문제가 나온다'로만 보인다(8/22 사용자 제보의 실체).
            widened,
        });
    } catch (e: any) {
        // 업스트림(OpenAI·Gemini) 에러 문구를 그대로 내보내면 사용자 화면에
        // "429 You exceeded your current quota, please check your plan and billing details ..."
        // 같은 결제 안내가 노출된다(2026-08-07 ~ 08-21 실제로 노출돼 있었고 건의사항으로 접수됨).
        // 원문은 서버 로그에만 남기고, 사용자에게는 상황별 안내만 준다.
        const raw = String(e?.message || e || '');
        console.error('[print/match] 실패:', raw);
        const isQuota = /quota|billing|insufficient_quota|rate limit|429/i.test(raw);
        return NextResponse.json({
            error: isQuota
                ? '지금 변형문제 찾기가 일시적으로 막혀 있어요. 잠시 후 다시 시도해 주세요. (문제가 계속되면 건의사항으로 알려주세요)'
                : '변형문제를 찾지 못했어요. 영역을 다시 잘라 시도해 주세요.',
        }, { status: isQuota ? 503 : 500 });
    }
}
