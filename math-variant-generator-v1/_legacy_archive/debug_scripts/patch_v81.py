import re

with open('gemini_client.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the start of _extract_single_problem
start_idx = content.find("    async def _extract_single_problem")
# Find the start of the next function
end_idx = content.find("    async def _generate_single_variant", start_idx)

if start_idx == -1 or end_idx == -1:
    print("Function not found!")
    exit(1)

new_func = '''    async def _extract_single_problem(self, q_num, img_data, extract_semaphore, log_fn):
        async with extract_semaphore:
            if "고1" in self.curriculum:
                level_instr = "🚨[제한 사항] 모든 풀이 방식은 반드시 '고등학교 1학년(고1) 공통수학' 수준 내에서만 해결해야 합니다. 절대 선행 개념 금지."
            else:
                level_instr = "모든 풀이 방식은 '고등학교 2학년/3학년(수1, 수2, 선택과목)' 수준 내에서 해결하세요."
                
            instr = f"전체 내용을 3~4단계로 구성하여 논리적으로 설명하세요. {level_instr}"
            thought_prompt = "이곳에 자유롭게 먼저 다 풀어보세요."

            # [PASS 1: PURE OCR TYPIST]
            retries = 0
            extracted_p1 = None
            while retries < 4:
                try:
                    log_fn(f"    [문항 {q_num}] (Pass 1 - OCR) 추출 시작... (시도 {retries + 1}/4)")
                    prompt_pass1 = f"""당신은 완벽한 시각적 타이피스트입니다. 절대 문제를 직접 풀거나 해설하려 하지 마세요.
첨부된 이미지에서 **오직 '{q_num}'번 문제 영역만** 찾으세요. 이 선명한 이미지에서 해당 문제만 완벽하게 해독하고 아래 JSON 구조로 전사해 주세요.
[
  {{
    "question_num": "{q_num}",
    "pre_reading_aloud": "🚨[수식 소리내어 읽기 사전 분석]🚨 모든 수식의 분모(가로줄 아래)와 분자(가로줄 위), 부호 등을 눈으로 아주 천천히 스캔하며 위치가 뒤바뀌지 않게 '한글'로 소리내어 또박또박 분석하세요. (예: 분모에는 알파가 있고 분자에는 5베타바가 있다.) 절대로 수식을 마음대로 병합하거나 암산하지 말고 있는 그대로 읽은 과정을 기록하세요.",
    "question": "문제 본문 전체 텍스트 (사전 분석한 결과를 바탕으로 정확히 [[EQUATION:...]] 태그 교체)",
    "answer_options": ["① [[EQUATION:1]]", "② [[EQUATION:2]]"]
  }}
]

[핵심 규칙]
1. 허수 i vs 알파벳 l 구분 (복소수 맥락이면 i).
2. 분수와 bar 혼동 금지: `{{bar {{beta}}}} over {{alpha}}` 형태 유지.
3. 모든 수식/숫자/변수는 무조건 `[[EQUATION:...]]` 태그 필수.
4. 🚨 **[백틱 및 마크다운 절대 금지]** 절대 `$수식$`, `$$수식$$` 같은 래퍼를 사용하지 마세요. (틀린 예: `` `x+1` ``, 올바른 예: [[EQUATION:x+1]])
5. **[초엄격: 텍스트 완벽 복제 절대원칙]** 사진에 명백한 수학적 오류가 있어 보이더라도(예: '최솟값'인데 오타로 보임) 본인이 스스로 판단해서 고치면 시스템 파괴로 간주됩니다. 무조건 사진에 있는 글자 그대로 옮기세요!
6. **[오직 HWP 텍스트 문법 사용]** LaTeX 금지 (\\frac -> over, \\alpha -> alpha, \\le -> le, \\neq -> !=).
7. **크기 조절 괄호 필수**: 분수를 감쌀 때는 일반 괄호 `( )` 대신 반드시 `LEFT ( ... RIGHT )`를 사용하세요.
8. **[초긴급! 분모/분자 위치 반전(역전) 절대 금지!]** 위아래 위치를 눈으로 똑똑히 확인하고 절대 뒤집어 적지 마세요!!"""

                    import google.generativeai as genai
                    resp1 = await self.model.generate_content_async(
                        [img_data, prompt_pass1],
                        generation_config=genai.types.GenerationConfig(temperature=0.0)
                    )
                    text1 = self._sanitize_json(resp1.text)
                    ext1 = self._extract_json_objects(text1)
                    if ext1:
                        extracted_p1 = ext1[0]
                        log_fn(f"    [문항 {q_num}] Pass 1 응답 수신완료")
                        break
                    
                    log_fn(f"    [문항 {q_num}] Pass 1 JSON 파싱 실패, 재시도 중...")
                    retries += 1
                    import asyncio; await asyncio.sleep(2)
                except Exception as e:
                    log_fn(f"    [문항 {q_num}] Pass 1 추출 에러: {e}")
                    retries += 1
                    import asyncio; await asyncio.sleep(5)
            
            if not extracted_p1:
                log_fn(f"    [문항 {q_num}] Pass 1 실패로 중단")
                return None

            # [PASS 2: MATH TUTOR REASONING]
            retries = 0
            extracted_p2 = None
            
            q_text = extracted_p1.get('question', '')
            opt_text = str(extracted_p1.get('answer_options', []))
            
            while retries < 4:
                try:
                    log_fn(f"    [문항 {q_num}] (Pass 2 - 해설) 생성 시작... (시도 {retries + 1}/4)")
                    prompt_pass2 = f"""당신은 최고의 수학 일타강사입니다. 
다음은 1차 스캔에서 완벽하게 타이핑된 '{q_num}'번 문제 텍스트입니다. 
당신은 이 **[추출된 문제 텍스트]**를 기반으로 정확한 수학적 풀이와 해설을 작성해야 합니다. 추가적으로 첨부된 원본 이미지는 오직 '도형(미디어)'이나 '그래프'를 확인하는 보조 용도로만 참고하세요. {level_instr}

[추출된 문제 텍스트]
문제번호: {q_num}
문제 본문: {q_text}
선택 보기: {opt_text}

이 텍스트에 기반하여 아래 JSON 구조로 해설을 작성해 주세요.
[
  {{
    "thought_process": "{thought_prompt}",
    "explanation": "이곳에 문제에 대한 상세한 해설을 오직 '문자열'로 작성하세요."
  }}
]

[핵심 규칙]
1. 해설 내부의 모든 수식과 숫자는 무조건 `[[EQUATION:...]]` 태그로 감싸야 합니다. 마크다운 백틱이나 LaTeX($, $$)는 모두 금지됩니다.
2. 오직 HWP(한글) 텍스트 수식 문법을 사용하세요 (`over`, `alpha`, `beta`, `LEFT(`, `RIGHT)` 등).
3. 2단계에서는 1단계에서 추출된 텍스트를 믿고, 혹시라도 "자신이 생각한 풀이에 맞추기 위해 문제 자체를 다르게 해석"하는 환각에 빠지지 않도록 극도로 주의하세요.
4. 해설 마지막 멘트는 "따라서 정답은 [보기번호]이다." 형식으로 포함하세요."""

                    import google.generativeai as genai
                    resp2 = await self.model.generate_content_async(
                        [img_data, prompt_pass2],
                        generation_config=genai.types.GenerationConfig(temperature=0.0)
                    )
                    text2 = self._sanitize_json(resp2.text)
                    ext2 = self._extract_json_objects(text2)
                    if ext2:
                        extracted_p2 = ext2[0]
                        log_fn(f"    [문항 {q_num}] Pass 2 응답 수신완료")
                        break
                    
                    log_fn(f"    [문항 {q_num}] Pass 2 JSON 파싱 실패, 재시도 중...")
                    retries += 1
                    import asyncio; await asyncio.sleep(2)
                except Exception as e:
                    log_fn(f"    [문항 {q_num}] Pass 2 추출 에러: {e}")
                    retries += 1
                    import asyncio; await asyncio.sleep(5)
            
            if not extracted_p2:
                extracted_p2 = {"thought_process": "해설 추출 실패 (Timeout/Error)", "explanation": "해설 추출 실패 (Timeout/Error)"}

            # [MERGE AND FORMAT]
            final_obj = {
                "question_num": extracted_p1.get("question_num", q_num),
                "pre_reading_aloud": extracted_p1.get("pre_reading_aloud", ""),
                "question": q_text,
                "answer_options": extracted_p1.get("answer_options", []),
                "thought_process": extracted_p2.get("thought_process", ""),
                "explanation": extracted_p2.get("explanation", "")
            }

            import re
            def force_equation_tags(val):
                if not isinstance(val, str): return val
                val = re.sub(r'`\\s*(.*?)\\s*`', r'[[EQUATION:\\1]]', val, flags=re.DOTALL)
                val = re.sub(r'\\\\\\(\\s*(.*?)\\s*\\\\\\)', r'[[EQUATION:\\1]]', val, flags=re.DOTALL)
                val = re.sub(r'\\\\\\\[\\s*(.*?)\\s*\\\\\\]', r'[[EQUATION:\\1]]', val, flags=re.DOTALL)
                val = re.sub(r'\\$\\$\\s*(.*?)\\s*\\$\\$', r'[[EQUATION:\\1]]', val, flags=re.DOTALL)
                val = re.sub(r'\\$\\s*(.*?)\\s*\\$', r'[[EQUATION:\\1]]', val, flags=re.DOTALL)
                val = val.replace("<=", "le").replace(">=", "ge").replace("\\\\le", "le").replace("\\\\ge", "ge").replace("\\\\neq", "!=")
                
                def fix_equation_spacing(m):
                    eq = m.group(1)
                    eq = eq.replace('+', ' + ').replace('-', ' - ').replace('=', ' = ')
                    eq = eq.replace('! =', '!=')
                    import re as regex
                    eq = regex.sub(r'\\s+', ' ', eq).strip()
                    return f"[[EQUATION:{eq}]]"
                val = re.sub(r'\\[\\[EQUATION:(.*?)\\]\\]', fix_equation_spacing, val)
                return val

            final_obj['question'] = force_equation_tags(final_obj['question'])
            final_obj['explanation'] = force_equation_tags(final_obj['explanation'])
            final_obj['thought_process'] = force_equation_tags(final_obj['thought_process'])
            if isinstance(final_obj['answer_options'], list):
                final_obj['answer_options'] = [force_equation_tags(opt) for opt in final_obj['answer_options']]

            log_fn(f"    [문항 {q_num}] [성공] V8.1 듀얼코어 패스 완료!")
            return final_obj

'''

content = content[:start_idx] + new_func + "\n" + content[end_idx:]

with open('gemini_client.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("V8.1 Patch applied to gemini_client.py")
