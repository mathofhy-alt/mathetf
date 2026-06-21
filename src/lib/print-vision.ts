import { SUBJECT_UNITS } from '@/lib/curriculum';

// 전체 canonical 단원 목록 (Gemini가 이 중에서만 고르게)
const ALL_UNITS = Array.from(new Set(Object.values(SUBJECT_UNITS).flat()));

export interface CropReading {
    text: string;        // 문제 전사/요약 (임베딩용)
    unit: string | null; // canonical 단원
    concepts: string[];  // 개념 태그
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
  "concepts": ["핵심 개념/유형 2~4개"]
}
unit 은 반드시 다음 중에서만 고른다: ${ALL_UNITS.join(', ')}`;

    // 2.5-pro 는 추론모델이라 느려서 타임아웃 → 읽기엔 flash 로 충분히 빠르고 정확
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: sys }] },
            contents: [{ role: 'user', parts: [{ text: '이 수학 문제를 분석해줘.' }, { inlineData: { mimeType, data: imageBase64 } }] }],
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const out = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let p: any = {};
    try { p = JSON.parse(out.replace(/^```(json)?\n?/i, '').replace(/\n?```$/i, '').trim()); } catch { }

    const unit = p.unit && typeof p.unit === 'string' ? p.unit.replace(/[\s#`"']/g, '') : null;
    return {
        text: String(p.text || ''),
        unit: unit && ALL_UNITS.includes(unit) ? unit : (unit || null),
        concepts: Array.isArray(p.concepts) ? p.concepts.map((c: any) => String(c)) : [],
    };
}
