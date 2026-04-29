import OpenAI from 'openai';
import { CONCEPT_MAP } from './concept-map';

/**
 * Generates vector embeddings for the given text using OpenAI's text-embedding-3-small model.
 * The model produces 1536-dimensional vectors.
 */
export async function generateEmbedding(text: string): Promise<{ embedding: number[], tokens: number }> {
    const apiKey = (process.env.OPENAI_API_KEY || '').trim();

    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is missing or empty in environment variables.");
    }

    const openai = new OpenAI({
        apiKey: apiKey,
    });

    try {
        // Sanitize input: Remove excessive whitespace
        const cleanedText = text.replace(/\s+/g, ' ').trim();

        if (!cleanedText) {
            throw new Error("Input text is empty");
        }

        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: cleanedText,
            encoding_format: "float",
        });

        return {
            embedding: response.data[0].embedding,
            tokens: response.usage.total_tokens
        };
    } catch (error) {
        console.error("Error generating embedding:", error);
        throw error;
    }
}

import * as fs from 'fs';
import * as path from 'path';

/**
 * Generates tags and unit using Gemini, explicitly supporting prediction of subjects when missing/unknown.
 */
export async function generateTags(text: string, subject: string, imageUrls: string[] = []): Promise<{ subject: string | null, unit: string | null, tags: string[], difficulty: number | null, tokens: number }> {
    let apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        try {
            const paths = [
                path.join(process.cwd(), 'math-pdf-to-hml-v12', 'gemini_api_key.txt'),
                path.join(process.cwd(), 'exam-to-hwp', 'gemini_api_key.txt')
            ];
            for (const keyPath of paths) {
                if (fs.existsSync(keyPath)) {
                    apiKey = fs.readFileSync(keyPath, 'utf8').trim();
                    break;
                }
            }
        } catch (e) {
            console.error("Failed to read gemini api key file", e);
        }
    }

    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing or empty.");
    }

    try {
        const cleanedText = text.replace(/\s+/g, ' ').trim();
        if (!cleanedText) return { subject: null, unit: null, tags: [], difficulty: null, tokens: 0 };

        // concept-map.ts가 단일 소스. SUBJECT_UNITS/FULL_TAG_MAP을 자동 도출
        const FULL_TAG_MAP = CONCEPT_MAP;
        const SUBJECT_UNITS: Record<string, string[]> = Object.fromEntries(
            Object.entries(CONCEPT_MAP).map(([sub, units]) => [sub, Object.keys(units)])
        );

        const ALL_SUBJECTS = Object.keys(SUBJECT_UNITS);
        const isSubjectUnknown = !subject || subject === '수학' || subject === '전과목' || !ALL_SUBJECTS.includes(subject);

        let mapStr = "";
        
        if (isSubjectUnknown) {
            mapStr += "다음은 각 과목(subject)별 허용된 단원(unit) 및 핵심 태그(tags) 목록입니다:\n";
            for (const [sub, units] of Object.entries(SUBJECT_UNITS)) {
                mapStr += `\n[과목: ${sub}]\n`;
                const tagMapForSub = FULL_TAG_MAP[sub];
                if (tagMapForSub) {
                    for (const [u, tArray] of Object.entries(tagMapForSub)) {
                        mapStr += `- 단원: ${u} | 관련 태그: ${tArray.join(', ')}\n`;
                    }
                } else {
                    mapStr += `- 허용 단원 리스트: ${units.join(', ')}\n`;
                }
            }
        } else {
            const currentUnits = SUBJECT_UNITS[subject] || [];
            const currentTagMap = FULL_TAG_MAP[subject];
            if (currentTagMap) {
                for (const [u, tArray] of Object.entries(currentTagMap)) {
                    mapStr += `단원: ${u} | 관련 태그: ${tArray.join(', ')}\n`;
                }
            } else {
                mapStr += `허용 단원 리스트: ${currentUnits.join(', ')}\n`;
                mapStr += `(태그는 쉼표로 구분하여 핵심적인 수학 개념이나 유형명으로 자유롭게 2~3개 추출할 것)`;
            }
        }

        const systemInstruction = `당신은 고등학교 수학 문제 분류기입니다. 
주어진 문제 텍스트를 분석하여, 다음 허용된 과목명(subject), 단원명(unit) 1개, 핵심 개념 태그(tags) 최대 3개, 그리고 난이도(difficulty)를 선택해 주세요.
반드시 아래의 JSON 객체 형식으로만 응답해야 합니다. 다른 아무 텍스트나 설명도 덧붙이지 마세요.
{
  "subject": "과목명",
  "unit": "단원명",
  "tags": ["태그1", "태그2"],
  "difficulty": 5
}

[난이도(difficulty) 산정 가이드라인 - 1부터 10사이의 정수]
1~3: 기본 공식 및 계산 위주의 쉬운 예제/유제 수준
4~5: 평이한 내신 및 모의고사 3점, 쉬운 4점 수준
6~7: 모의고사 일반 4점 수준 (복합 개념 적용 필요)
8~9: 모의고사 준킬러 수준 (고도의 사고력 요구)
10: 모의고사 킬러 불수능 문항 (매우 길고 복잡한 풀이)

※ 휴리스틱 주의점: 문제 텍스트에 "그림과 같이" 또는 "그래프"라는 표현이 있지만, 점의 좌표나 구체적인 수식 조건이 텍스트에 길게 나열되지 않았다면, 이는 단순히 그래프 상의 (절편 등) 점을 읽고 바로 대입하면 끝나는 매우 쉬운 문제(난이도 2~3)일 확률이 거의 100%입니다. 시각 정보가 필요한 문제는 절대 과대평가(4 이상)하지 마세요!

[허용된 분류 기준 (반드시 이 안에서만 선택하세요)]
${mapStr}`;

        const promptText = `[현재주어진과목(참고용)]: ${subject}\n\n[문제 본문 및 해설]:\n${cleanedText}\n\n목록 내에서 가장 최적의 과목, 단원, 태그(최적 3개), 그리고 난이도(1~10)를 JSON형태로 출력하세요.`;

        const imageParts: any[] = [];
        if (imageUrls && imageUrls.length > 0) {
            const fetched = await Promise.all(
                imageUrls.map(async (imgUrl) => {
                    try {
                        const res = await fetch(imgUrl);
                        if (!res.ok) return null;
                        const arrayBuffer = await res.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        return {
                            inlineData: {
                                mimeType: res.headers.get('content-type') || 'image/png',
                                data: buffer.toString('base64')
                            }
                        };
                    } catch (e) {
                        console.error("Failed to fetch image for Gemini:", imgUrl, e);
                        return null;
                    }
                })
            );
            imageParts.push(...fetched.filter(Boolean));
        }


        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents: [{ role: "user", parts: [{ text: promptText }, ...imageParts] }],
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: "application/json"
                }
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Gemini API Error: ${response.status} ${response.statusText} - ${errBody}`);
        }

        const data = await response.json();
        const output = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        
        let parsed: any = {};
        try {
            const cleanOutput = output.replace(/^```(json)?\n?/i, '').replace(/\n?```$/i, '').trim();
            parsed = JSON.parse(cleanOutput);
        } catch (parseErr) {
            console.error("JSON parse error on Gemini output:", output);
        }

        const rawTags = Array.isArray(parsed.tags) ? parsed.tags : [];
        let inferredSubject = parsed.subject && typeof parsed.subject === 'string' ? parsed.subject.replace(/[\s`"'\n]+/g, '') : null;
        let inferredUnit = parsed.unit && typeof parsed.unit === 'string' ? parsed.unit.replace(/[\s`"'\n]+/g, '') : null;
        
        // AI가 부여하는 난이도를 의도적으로 1 낮추어 보수적으로 평가 (최하점 1 유지)
        let difficulty = typeof parsed.difficulty === 'number' ? Math.max(1, Math.min(10, Math.floor(parsed.difficulty))) : null;
        if (difficulty !== null && difficulty > 1) {
            difficulty -= 1;
        }
        
        // 1. Validate Subject
        if (inferredSubject && !ALL_SUBJECTS.includes(inferredSubject)) {
             inferredSubject = (isSubjectUnknown ? null : subject);
        }
        if (!inferredSubject) inferredSubject = isSubjectUnknown ? null : subject;

        // 2. Validate Unit
        const allowedUnits = inferredSubject ? SUBJECT_UNITS[inferredSubject] || [] : [];
        if (inferredUnit && !allowedUnits.includes(inferredUnit)) {
             inferredUnit = null; // 환각 차단
        }

        // 3. Validate Tags
        let tags = rawTags.map((t: string) => t.replace(/[\s#`"'\n]+/g, '')).filter(Boolean);
        const tagMap = inferredSubject ? FULL_TAG_MAP[inferredSubject] : null;
        if (tagMap) {
            const allValidTagsForSub = Object.values(tagMap).flat();
            tags = tags.filter((t: string) => allValidTagsForSub.includes(t));
        }

        console.log("FINAL INFERENCES:", { subject: inferredSubject, unit: inferredUnit, difficulty, tags });
        
        return { 
            subject: inferredSubject,
            unit: inferredUnit,
            tags: tags.slice(0, 3), 
            difficulty,
            tokens: data.usageMetadata?.totalTokenCount || 0 
        };
    } catch (error) {
        console.error("Error generating tags with Gemini:", error);
        return { subject: null, unit: null, tags: [], difficulty: null, tokens: 0 };
    }
}


