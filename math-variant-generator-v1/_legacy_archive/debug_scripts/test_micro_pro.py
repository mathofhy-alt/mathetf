import os
import asyncio
import json
import google.generativeai as genai

async def test_pro_translator():
    api_key_path = os.path.join("dist", "gemini_api_key.txt")
    with open(api_key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()
        
    genai.configure(api_key=api_key)
    # Upgrade to PRO for translation
    pro_model = genai.GenerativeModel("gemini-2.5-pro")
    
    equations = [
        "\\frac{5\\beta}{\\alpha} = \\beta \\cdot \\frac{5}{\\alpha} = \\beta \\cdot \\frac{\\bar{\\alpha}}{5} = \\frac{\\bar{\\alpha}\\beta}{5}",
        "\\lim_{n \\to \\infty} \\frac{\\frac{n^2 + 1}{2}}{n^2 - 1}"
    ]
    
    from typing import TypedDict, List
    class MicroTranslationResponse(TypedDict):
        translated_equations: List[str]
        
    trans_prompt = r"""너는 세계 최고의 수학 수식 번역기 전문 AI다. 
다음 제공된 JSON 배열은 일반적인 LaTeX 문법으로 작성된 수식들의 모음이다. 
단 하나의 수식도 누락하지 말고, 각 수식을 '소프트웨어 한글(HWP) 수식 문법'으로 1:1 완벽하게 번역하여 동일한 길이의 JSON 배열로 반환하라.

[변환 필수 규칙]
1. 분수 처리: \frac{A}{B} 구조는 무조건 {A} over {B} 구조로 교체하라. (결과물에 'frac' 단어가 절대 남아있으면 안 된다)
2. 백슬래시 기호 변환: \alpha, \beta, \bar, \pm 등은 백슬래시를 제거한다. (예: \bar{\alpha} -> bar{alpha}, \pm -> +-, \cdot -> CDOT)
3. 괄호 치환: \left( 와 \right) 는 대문자 LEFT( 와 RIGHT) 로 바꾼다.
4. 불필요 태그 금지: 수식 앞뒤의 $ 기호나 캡슐화 기호 없이 오직 수식 내용만 텍스트로 배열에 담을 것.

[변환 예시 (Few-Shot)]
입력: ["x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}", "\frac{\frac{1}{2}}{3}", "\frac{\bar{\alpha}}{5}"]
출력: ["x = {-b +- sqrt{b^2 - 4ac}} over {2a}", "{ {1} over {2} } over {3}", "{bar{alpha}} over {5}"]

[번역할 원본 LaTeX 수식 배열]
""" + json.dumps(equations, ensure_ascii=False)

    print("프롬프트:\n", trans_prompt)
    print("\nAPI 요청 중 (Gemini Pro)...")
    resp = await pro_model.generate_content_async(
        trans_prompt,
        generation_config=genai.types.GenerationConfig(
            temperature=0.0,
            max_output_tokens=8192,
            response_mime_type="application/json",
            response_schema=MicroTranslationResponse
        )
    )
    
    print("\n[번역 결과]")
    try:
        import re as regex
        text = resp.text
        match = regex.search(r'```(?:json)?\s*(.*?)\s*```', text, regex.DOTALL | regex.IGNORECASE)
        if match: text = match.group(1)
        else:
            text = regex.sub(r'```json\s*', '', text)
            text = regex.sub(r'```\s*', '', text)
            
        res_json = json.loads(text)
        translated = res_json.get("translated_equations", [])
        for i, eq in enumerate(translated):
            print(f"[{i}] {eq}")
    except Exception as e:
        print("파싱 에러:", e, resp.text)

if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_pro_translator())
