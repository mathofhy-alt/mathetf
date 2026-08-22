import { SUBJECT_UNITS } from '@/lib/curriculum';

// 전체 canonical 단원 목록 (Gemini가 이 중에서만 고르게)
const ALL_UNITS = Array.from(new Set(Object.values(SUBJECT_UNITS).flat()));

export interface CropReading {
    text: string;        // 문제 전사/요약 (임베딩용)
    unit: string | null; // canonical 단원
    concepts: string[];  // 개념 태그
    difficulty: number | null;  // 1~10. 유사문제를 같은 난이도대에서 찾기 위함
}

/**
 * 크롭된 수학 문제 이미지를 Gemini 2.5 Pro 로 읽어 텍스트·단원·개념 추출.
 * (임베딩은 별도로 OpenAI 로 — DB 호환)
 */
export async function readCrop(imageBase64: string, mimeType = 'image/png'): Promise<CropReading> {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) throw new Error('GEMINI_API_KEY 가 설정되지 않았습니다.');

    const sys = `너는 한국 고등학교 수학 문제 이미지를 분석하는 전문가다. 주어진 이미지의 수학 문제를 보고 아래 JSON 형식으로만 답하라.
{
  "text": "문제의 핵심 내용을 한 문단으로 전사/요약 (수식은 자연어로 풀어 써라. 예: x의 제곱 더하기 ...). 유사문제 검색에 쓰일 것이므로 어떤 개념·유형인지 잘 드러나게.",
  "unit": "아래 목록 중 가장 적합한 단원 하나",
  "concepts": ["핵심 개념/유형 2~4개"],
  "difficulty": 난이도 1~10 정수
}
[난이도 기준] 1~3 기본 계산·공식 적용 / 4~5 평이한 3점 / 6~7 일반 4점(복합 개념) / 8~9 준킬러 / 10 킬러
unit 은 반드시 다음 중에서만 고른다: ${ALL_UNITS.join(', ')}`;

    // 2026-08-22: gemini-2.5-flash → gemini-3.7-flash (thinkingLevel:'low').
    // 크롭 24문항(2010 가형·2009 나형)으로 단원 판정 정확도를 재본 결과:
    //   3.7-flash level=low   22/24 (92%) · 2.3~3.2초
    //   3.7-flash 생각 끔      21/24 (88%) · 2.6~3.1초
    //   2.5-flash 생각 끔      13/24 (54%) · 2.7~2.8초   ← 직전 설정
    //   2.5-flash 생각 켬       8/12 (67%) · 12.7초       ← 그 전 설정
    // 3.7 이 틀린 2건은 폐지단원(이중근호·이항연산)이라 후보 목록에 아예 없는 문항 —
    // 즉 고를 수 있는 것 중에서는 22/22 다. 더 빠르면서 더 정확하다.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: sys }] },
            contents: [{ role: 'user', parts: [{ text: '이 수학 문제를 분석해줘.' }, { inlineData: { mimeType, data: imageBase64 } }] }],
            // thinkingLevel:'low' — 생각을 완전히 끄면(budget:0) 정확도가 조금 떨어지고,
            // 기본값으로 두면 크롭 한 장에 생각 토큰을 수천 개 써서 15초씩 걸린다.
            // 'low' 가 둘 다 잡는 지점이다(위 측정표 참고).
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } },
        }),
        signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const out = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let p: any = {};
    try { p = JSON.parse(out.replace(/^```(json)?\n?/i, '').replace(/\n?```$/i, '').trim()); } catch { }

    const unit = p.unit && typeof p.unit === 'string' ? p.unit.replace(/[\s#`"']/g, '') : null;
    // DB 의 difficulty 는 embeddings.ts 가 1~10 판정에서 1 을 빼 저장한다.
    // 같은 척도로 맞춰야 난이도 밴드 비교가 성립한다.
    let diff: number | null = typeof p.difficulty === 'number' ? Math.max(1, Math.min(10, Math.floor(p.difficulty))) : null;
    if (diff !== null && diff > 1) diff -= 1;
    return {
        text: String(p.text || ''),
        unit: unit && ALL_UNITS.includes(unit) ? unit : (unit || null),
        concepts: Array.isArray(p.concepts) ? p.concepts.map((c: any) => String(c)) : [],
        difficulty: diff,
    };
}
