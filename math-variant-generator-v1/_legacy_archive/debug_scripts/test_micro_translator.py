import os
import asyncio
import re
import json
import google.generativeai as genai

async def test_translator():
    api_key_path = os.path.join("dist", "gemini_api_key.txt")
    with open(api_key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()
        
    genai.configure(api_key=api_key)
    flash_model = genai.GenerativeModel("gemini-2.5-flash")
    
    final_result = {
        "question": "다음 극한 값을 구하시오. $\\lim_{n \\to \\infty} \\frac{\\frac{n^2 + 1}{2}}{n^2 - 1}$",
        "explanation": "중첩 분수는 까다롭다. 식은 $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$로 전개되며, $\\left( \\frac{1}{2} \\right)$도 있다."
    }
    
    print("원문:\n", json.dumps(final_result, ensure_ascii=False, indent=2))
    
    equations = []
    def replacer(match):
        eq = match.group(2) or match.group(3) or match.group(4)
        if not eq: return match.group(0)
        equations.append(eq.strip())
        return f"__MATH_{len(equations)-1}__"

    pattern = re.compile(r'(\$\$?)(.+?)\1|\\\[(.+?)\\\]|\\\((.+?)\\\)', re.DOTALL)
    
    for k in ['question', 'explanation']:
        final_result[k] = pattern.sub(replacer, final_result[k])
        
    print("\n추출 및 캡슐화 완료:\n", json.dumps(final_result, ensure_ascii=False, indent=2))
    print("\n번역할 수식 배열:\n", json.dumps(equations, ensure_ascii=False, indent=2))
    
    from typing import TypedDict, List
    class MicroTranslationResponse(TypedDict):
        translated_equations: List[str]
        
    trans_prompt = f"""너는 세계 최고의 수학 수식 번역기 전문 AI다. 
다음 제공된 JSON 배열은 일반적인 LaTeX 문법으로 작성된 수식들의 모음이다. 
단 하나의 수식도 누락하지 말고, 각 수식을 '소프트웨어 한글(HWP) 수식 문법'으로 1:1 완벽하게 번역하여 동일한 길이의 JSON 배열로 반환하라.
[규칙]
1. `\\frac{{A}}{{B}}`는 `{{A}} over {{B}}`로 바꿀 것.
2. `\\alpha`, `\\beta`는 `alpha`, `beta`로 (백슬래시 제거).
3. `\\left(`, `\\right)`는 `LEFT(`, `RIGHT)`로 바꿀 것.
4. `\\sqrt{{A}}`는 `sqrt{{A}}`로 변환.
5. 수식 앞뒤의 `$` 기호나 `[[EQUATION:` 같은 캡슐화 태그를 붙이지 말고 "오직 변환된 내부 수식 내용"만 배열에 담을 것.

[번역할 원본 LaTeX 수식 배열]
{json.dumps(equations, ensure_ascii=False)}
"""
    print("\n번역 API 요청 중...")
    resp = await flash_model.generate_content_async(
        trans_prompt,
        generation_config=genai.types.GenerationConfig(
            temperature=0.0,
            max_output_tokens=8192,
            response_mime_type="application/json",
            response_schema=MicroTranslationResponse
        )
    )
    
    import re as regex
    text = resp.text
    match = regex.search(r'```(?:json)?\s*(.*?)\s*```', text, regex.DOTALL | regex.IGNORECASE)
    if match: text = match.group(1)
    else:
        text = regex.sub(r'```json\s*', '', text)
        text = regex.sub(r'```\s*', '', text)
        
    translated = json.loads(text).get("translated_equations", [])
    print("\n번역 완료 배열:\n", json.dumps(translated, ensure_ascii=False, indent=2))
    
    def inject(t):
        if not isinstance(t, str): return t
        for i in range(len(equations)):
            eq_str = translated[i]
            eq_str = eq_str.replace('+', ' + ').replace('-', ' - ').replace('=', ' = ')
            eq_str = eq_str.replace('! =', '!=').replace('- >', '->').replace(' - > ', ' -> ')
            eq_str = regex.sub(r'\s+', ' ', eq_str).strip()
            t = t.replace(f"__MATH_{i}__", f"[[EQUATION:{eq_str}]]")
        return t

    for k in ['question', 'explanation']:
        final_result[k] = inject(final_result[k])
        
    print("\n최종 Injection 결과:\n", json.dumps(final_result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_translator())
