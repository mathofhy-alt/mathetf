require('dotenv').config({ path: '.env.local' });

const apiKey = process.env.GEMINI_API_KEY;
console.log('API KEY 존재:', !!apiKey, apiKey ? `(${apiKey.slice(0,8)}...)` : '없음');

const testText = '[과목: 공통수학1] [학년: 고1] 두 다항식 A=2x²+3x-1, B=-x²-2x+3에 대하여 A+8B를 간단히 하면?';

async function test() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
    
    const body = {
        systemInstruction: { parts: [{ text: '당신은 수학 문제 분류기입니다. JSON으로만 응답하세요: {"subject":"과목명","unit":"단원명","tags":["태그1"],"difficulty":3}' }] },
        contents: [{ role: 'user', parts: [{ text: testText }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
    };

    console.log('\n--- Gemini API 호출 ---');
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    console.log('HTTP 상태:', res.status, res.statusText);
    const data = await res.json();
    
    if (!res.ok) {
        console.log('에러 응답:', JSON.stringify(data, null, 2));
        return;
    }

    const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('AI 응답:', output);
    console.log('토큰:', data.usageMetadata?.totalTokenCount);
    
    try {
        const parsed = JSON.parse(output);
        console.log('파싱 결과:', parsed);
    } catch(e) {
        console.log('JSON 파싱 실패:', e.message);
    }
}

test().catch(console.error);
