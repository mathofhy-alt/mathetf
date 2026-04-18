import re

with open('gemini_client.py', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find("    async def _extract_single_problem")
end_idx = content.find("    async def _generate_single_variant", start_idx)

old_func = '''    async def _extract_single_problem(self, q_num, img_data, extract_semaphore, log_fn):
        async with extract_semaphore:
            retries = 0
            while retries < 4:
                try:
                    log_fn(f"    [문항 {q_num}] 추출 시작... (시도 {retries + 1}/4)")
                    
                    if "고1" in self.curriculum:
                        level_instr = "🚨[제한 사항] 모든 풀이 방식은 반드시 '고등학교 1학년(고1) 공통수학' 수준 내에서만 해결해야 합니다. 절대 선행 개념 금지."
                    else:
                        level_instr = "모든 풀이 방식은 '고등학교 2학년/3학년(수1, 수2, 선택과목)' 수준 내에서 해결하세요."
                        
                    instr = f"전체 내용을 3~4단계로 구성하여 논리적으로 설명하세요. {level_instr}"
                    thought_prompt = "이곳에 자유롭게 먼저 다 풀어보세요."
                    
                    if retries > 0:
                        instr = "!!초긴급 압축 모드!! 핵심 수식 1줄만 [[EQUATION:...]] 형태로 작성."
                        thought_prompt = ""

                    prompt = f"""당신은 수학 기호 타이핑 전문가입니다.
첨부된 이미지에서 **오직 '{q_num}'번 문제 영역만** 찾으세요. 이 선명한 이미지에서 해당 문제만 완벽하게 해독하고 아래 JSON 구조로 해설을 작성해 주세요.
[
  {{
    "question_num": "{q_num}",
    "pre_reading_aloud": "🚨[수식 소리내어 읽기 사전 분석]🚨 모든 수식의 분모(가로줄 아래)와 분자(가로줄 위), 부호 등을 눈으로 아주 천천히 스캔하며 위치가 뒤바뀌지 않게 '한글'로 소리내어 또박또박 분석하세요. (예: 분모에는 알파가 있고 분자에는 5베타바가 있다.) 절대로 수식을 마음대로 병합하거나 암산하지 말고 있는 그대로 읽은 과정을 기록하세요.",
    "question": "문제 본문 전체 텍스트 (사전 분석한 결과를 바탕으로 정확히 [[EQUATION:...]] 태그 교체)",
    "answer_options": ["① [[EQUATION:1]]", "② [[EQUATION:2]]"],
    "thought_process": "{thought_prompt}",
    "explanation": "이곳에 문제에 대한 상세한 해설을 오직 '문자열'로 작성하세요."
  }}
]

[핵심 규칙]
1. 허수 i vs 알파벳 l 구분 (복소수 맥락이면 i).
2. 분수와 bar 혼동 금지: `{{bar {{beta}}}} over {{alpha}}` 형태 유지.
3. 모든 수식/숫자/변수는 무조건 `[[EQUATION:...]]` 태그 필수.
4. 🚨 **[백틱 및 마크다운 절대 금지]** 절대 `$수식$`, `$$수식$$`, `\\(수식\\)`, `\\[수식\\]` 및 **마크다운 백틱(`` `...` ``)** 같은 수식 래퍼를 사용하지 마세요!!! (틀린 예: `` `x+1` ``, 올바른 예: [[EQUATION:x+1]]) `question` 본문 내에서도 수식이나 숫자는 백틱 대신 예외 없이 `[[EQUATION:...]]` 로 감싸야 합니다!
5. **[초엄격: 텍스트 요약/변조/자체 보정 절대 금지]** 당신은 문제를 푸는 출제자가 아니라, 사진에 적힌 글씨를 그대로 옮겨 적는 '타이피스트 단말기'입니다. 사진에 명백한 수학적 오류가 있어 보이더라도 무조건 사진에 있는 글자 그대로 100% 똑같이 전사하세요. 본인이 스스로 판단해서 문제의 오류를 고쳐 쓰면 치명적인 시스템 파괴로 간주됩니다.
6. **[초엄격: LaTeX 절대 금지, 오직 HWP(한글) 수식 문법 사용]**
   - 분수: `\\frac{{A}}{{B}}` (X) -> `{{A}} over {{B}}` (O)
   - 그리스 문자: `\\alpha`, `\\beta`, `\\pi` (X) -> `alpha`, `beta`, `pi` (O) - 역슬래시 떼기
   - 곱하기/나누기: `\\times`, `\\div`, `\\cdot` (X) -> `TIMES`, `DIV`, `cdot` (O)
   - 부등호/등호: `\\le`, `\\ge`, `<=`, `>=`, `\\neq` (X) -> `le`, `ge`, `!=` (O)
   - 무한대/루트: `\\infty`, `\\sqrt` (X) -> `inf`, `sqrt` (O)
   - 상단 선/벡터: `\\bar`, `\\overline`, `\\vec` (X) -> `bar`, `overline`, `vec` (O)
   - 행렬 줄바꿈: `\\\\\\\\` (X) -> `#` (O)
7. **크기 조절 괄호 필수**: 분수(`over`)를 감싸는 괄호는 일반 괄호 `( )` 대신 반드시 `LEFT ( ... RIGHT )` 또는 `LEFT {{{{ ... RIGHT }}}}`를 사용하세요. (예: `LEFT ( {{{{1}}}} over {{{{5}}}} RIGHT )^{{{{root {{{{2}}}}}}}}`)
8. **극한(Limit) 문제 시각적 풀이 필수**: 함수 극한 문제에서 그래프 이미지가 주어졌다면, 절대 수식만으로 유추해서 풀지 말고 반드시 주어진 그래프 이미지를 눈으로 읽고 좌극한/우극한 값을 도출하세요.
9. **[최종 자체 검수 필수]**: JSON으로 응답을 출력하기 직전에, 위 5, 6번의 HWP 무-이탈 규칙(LaTeX 잔재 여부)을 어긴 곳이 있는지 확인하고, **백틱(`` ` ``)을 사용한 곳이 있으면 전부 `[[EQUATION:...]]`으로 수정**하세요.
10. 해설은 해라체(-다)를 사용하고 마지막에 "따라서 정답은 [최종답안]이다."를 포함하세요.
11. **[본문 텍스트 일치 여부 재검증]** 해설까지 전부 작성한 후, 마지막으로 반드시 원본 이미지를 눈으로 다시 한번 확인하여 대조해 보세요. 텍스트나 수식이 이미지 원본과 단 1글자라도 다르다면 처음부터 다시 작성하세요.
12. **[계산 결과 불일치 시 원본 재확인 절대 원칙]** **만약 계산한 정답이 보기(answer_options) 중 어느 것과도 일치하지 않는다면, 당신이 원본 문제의 수식을 이미지에서 잘못 읽었기 때문입니다.** 원본 이미지를 "아주 꼼꼼히" 다시 읽어 수식을 올바르게 수정한 뒤 다시 작성하세요.
13. **[단어 누락 / <보기> 공백 절대 금지]** 사소한 단어를 빼먹는 행위는 치명적입니다. 이미지에 `<보 기>` 처럼 공백이 있더라도 무조건 공백을 모두 제거하고 **`<보기>`** 로 붙여서 추출하세요. `<보기>` 하위 항목은 `question` 텍스트 끝에 포함시키세요.
14. **[최댓값/최솟값 임의 변조 절대 금지]** "최솟값"이라고 눈에 명확히 적혀 있는데, 문맥상 "최댓값"이라고 무의식적으로 고쳐 적지 마세요!! 무조건 사진 글자 그대로 타이핑하세요.
15. **[수식 형태 원본 유지 및 자체 교정 금지]** 사진에 있는 수식을 자기 마음대로 더 "올바른 표현"으로 자체 교정하지 마세요. 
     - 예: 사진에 `1 le x le 3` 이라고 적혀 있는데 문맥상 `-1 le x le 3` 이어야 한다고 스스로 판단해서 `-1`로 마음대로 고치면 **절대 안 됩니다!!!** 보이는 그대로 `1` 이라고 적으세요.
16. **[초긴급! 분모/분자 위치 반전(역전) 절대 금지!]** 아주 치명적인 오류입니다! 가로줄 위아래 위치를 똑똑히 확인하고 똑같이 적으세요!!
17. **[초엄격: 다항식 연산자 띄어쓰기 강제]** HWP 수식 편집기의 버그를 막기 위해, 사칙연산 및 등호(`+`, `-`, `=`, `le`, `ge`) 앞뒤로는 **무조건 공백(띄어쓰기)**을 넣으세요! (예: `x^4 + 4x^3 - 6x^2 = 0`)"""

                    import google.generativeai as genai
                    resp = await self.model.generate_content_async(
                        [img_data, prompt],
                        generation_config=genai.types.GenerationConfig(
                            temperature=0.0
                        )
                    )
                    
                    log_fn(f"    [문항 {q_num}] 응답 수신완료")
                    text = self._sanitize_json(resp.text)
                    extracted = self._extract_json_objects(text)
                    if extracted:
                        import re
                        def force_equation_tags(val):
                            if not isinstance(val, str): return val
                            val = re.sub(r'`\\s*(.*?)\\s*`', r'[[EQUATION:\\1]]', val, flags=re.DOTALL)
                            val = re.sub(r'\\\\\\(\\s*(.*?)\\s*\\\\\\)', r'[[EQUATION:\\1]]', val, flags=re.DOTALL)
                            val = re.sub(r'\\\\\\[\\s*(.*?)\\s*\\\\\\]', r'[[EQUATION:\\1]]', val, flags=re.DOTALL)
                            val = re.sub(r'\\$\\$\\s*(.*?)\\s*\\$\\$', r'[[EQUATION:\\1]]', val, flags=re.DOTALL)
                            val = re.sub(r'\\$\\s*(.*?)\\s*\\$', r'[[EQUATION:\\1]]', val, flags=re.DOTALL)
                            val = val.replace("<=", "le").replace(">=", "ge").replace("\\\\le", "le").replace("\\\\ge", "ge").replace("\\\\neq", "!=")
                            
                            def fix_equation_spacing(m):
                                eq = m.group(1)
                                eq = eq.replace('+', ' + ').replace('-', ' - ').replace('=', ' = ')
                                eq = eq.replace('! =', '!=') # 복구
                                import re as regex
                                eq = regex.sub(r'\\s+', ' ', eq).strip()
                                return f"[[EQUATION:{eq}]]"
                            val = re.sub(r'\\[\\[EQUATION:(.*?)\\]\\]', fix_equation_spacing, val)
                            
                            return val

                        for obj in extracted:
                            if 'question' in obj: obj['question'] = force_equation_tags(obj['question'])
                            if 'explanation' in obj: obj['explanation'] = force_equation_tags(obj['explanation'])
                            if 'thought_process' in obj: obj['thought_process'] = force_equation_tags(obj['thought_process'])
                            if 'answer_options' in obj and isinstance(obj['answer_options'], list):
                                obj['answer_options'] = [force_equation_tags(opt) for opt in obj['answer_options']]

                        log_fn(f"    [문항 {q_num}] [성공] 단일 코어 추출 완료!")
                        return extracted[0]
                    
                    log_fn(f"    [문항 {q_num}] JSON 파싱 실패, 재시도 중...")
                    retries += 1
                    import asyncio; await asyncio.sleep(2)
                except Exception as e:
                    log_fn(f"    [문항 {q_num}] 추출 에러: {e}")
                    retries += 1
                    import asyncio; await asyncio.sleep(5)
            return None
'''

content = content[:start_idx] + old_func + "\n" + content[end_idx:]

with open('gemini_client.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Restored original V8 extract_single_problem function.")
