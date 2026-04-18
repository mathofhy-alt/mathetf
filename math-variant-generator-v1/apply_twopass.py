import re
import codecs

file_path = "gemini_client.py"

with codecs.open(file_path, 'r', 'utf-8') as f:
    text = f.read()

# We need to find `async def _extract_single_problem` block and replace it entirely.
# We will also add a `def _get_core_rules(self):` right before it.

core_rules_method = '''
    def _get_core_rules(self):
        return """[핵심 규칙]
1. 허수 i vs 알파벳 l 구분 (복소수 맥락이면 i).
2. 분수와 bar 혼동 금지: `{{bar {{beta}}}} over {{alpha}}` 형태 유지.
3. 모든 수식/숫자/변수는 무조건 `[[EQUATION:...]]` 태그 필수.
4. 🚨 **[백틱 및 마크다운 절대 금지]** 절대 `$수식$`, `$$수식$$`, `\(수식\)`, `\[수식\]` 및 **마크다운 백틱(`` `...` ``)** 같은 수식 래퍼를 사용하지 마세요!!! (틀린 예: `` `x+1` ``, 올바른 예: [[EQUATION:x+1]]) `question` 본문 내에서도 수식이나 숫자는 백틱 대신 예외 없이 `[[EQUATION:...]]` 로 감싸야 합니다!
5. **[초엄격: 텍스트 요약/변조/자체 보정 절대 금지]** 당신은 문제를 푸는 출제자가 아니라, 사진에 적힌 글씨를 그대로 옮겨 적는 '타이피스트 단말기'입니다. 사진에 명백한 수학적 오류가 있어 보이더라도 무조건 사진에 있는 글자 그대로 100% 똑같이 전사하세요. 본인이 스스로 판단해서 문제의 오류를 고쳐 쓰면 치명적인 시스템 파괴로 간주됩니다.
6. 🚨 **[초엄격: 수식 대칭성/관습에 의한 시각적 환각(Hallucination) 경고]** 아주 빈번히 발생하는 치명적 오류입니다! 수식의 패턴이나 구조적 대칭성(예: 분자가 `켤레복소수(bar)`니까 당연히 분모도 `켤레복소수`일 것이라는 수학자적 추기)에 무의식적으로 이끌려 **원본 이미지에 존재하지 않는 기호(`bar` 가로줄, `-` 마이너스 등)를 눈에 헛것이 보여 멋대로 창조해서 붙이지 마세요!!** 제발 수학적 직관을 끄고 픽셀 단위로 '가로줄'이 진짜 있는지 없는지만 기계처럼 관찰하세요.
7. **[초엄격: LaTeX 절대 금지, 오직 HWP(한글) 수식 문법 사용]**
   - 분수: `\frac{{A}}{{B}}`는 반드시 `{{{{A}} over {{B}}}}` 형태의 **HWP 수식어**로 변환하세요 (더하기 기호 등과 우선순위가 엉키지 않도록 전체를 중괄호로 한 번 더 감싸는 `{{{{ }}}}` 형태가 필수입니다!). (예: `\frac{{1}}{{2}}` -> `{{{{1}} over {{2}}}}`)
   - 그리스 문자: `\alpha`, `\beta`, `\pi` (X) -> `alpha`, `beta`, `pi` (O) - 역슬래시 떼기
   - 곱하기/나누기: `\times`, `\div`, `\cdot` (X) -> `TIMES`, `DIV`, `cdot` (O)
   - 부등호/등호: `\le`, `\ge`, `<=`, `>=`, `\neq` (X) -> `le`, `ge`, `!=` (O)
   - 무한대/루트: `\infty`, `\sqrt` (X) -> `inf`, `sqrt` (O)
   - 상단 선/벡터: `\bar`, `\overline`, `\vec` (X) -> `bar`, `overline`, `vec` (O)
   - 행렬 줄바꿈: `\\\\` (X) -> `#` (O)
8. **크기 조절 괄호 필수**: 분수(`over`)를 감싸는 괄호는 일반 괄호 `( )` 대신 반드시 `LEFT ( ... RIGHT )` 또는 `LEFT {{{{ ... RIGHT }}}}`를 사용하세요. (예: `LEFT ( {{{{1}}}} over {{{{5}}}} RIGHT )^{{{{root {{{{2}}}}}}}}`)
9. **극한(Limit) 문제 시각적 풀이 필수**: 함수 극한 문제에서 그래프 이미지가 주어졌다면, 절대 수식만으로 유추해서 풀지 말고 반드시 주어진 그래프 이미지를 눈으로 읽고 좌극한/우극한 값을 도출하세요.
10. **[최종 자체 검수 필수]**: JSON으로 응답을 출력하기 직전에, 위 5, 7번의 HWP 무-이탈 규칙(LaTeX 잔재 여부)을 어긴 곳이 있는지 확인하고, **백틱(`` ` ``)을 사용한 곳이 있으면 전부 `[[EQUATION:...]]`으로 수정**하세요.
11. 해설은 해라체(-다)를 사용하고 마지막에 "따라서 정답은 [최종답안]이다."를 포함하세요.
12. **[본문 텍스트 일치 여부 재검증]** 해설까지 전부 작성한 후, 마지막으로 반드시 원본 이미지를 눈으로 다시 한번 확인하여 대조해 보세요. 텍스트나 수식이 이미지 원본과 단 1글자라도 다르다면 처음부터 다시 작성하세요.
13. **[계산 결과 불일치 시 원본 재확인 절대 원칙]** **만약 계산한 정답이 보기(answer_options) 중 어느 것과도 일치하지 않는다면, 당신이 원본 문제의 수식을 이미지에서 잘못 읽었기 때문입니다.** 원본 이미지를 "아주 꼼꼼히" 다시 읽어 수식을 올바르게 수정한 뒤 다시 작성하세요.
14. **[단어 누락 / <보기> 공백 절대 금지]** 사소한 단어를 빼먹는 행위는 치명적입니다. 이미지에 `<보 기>` 처럼 공백이 있더라도 무조건 공백을 모두 제거하고 **`<보기>`** 로 붙여서 추출하세요. `<보기>` 하위 항목은 `question` 텍스트 끝에 포함시키세요.
15. **[최댓값/최솟값 임의 변조 절대 금지]** "최솟값"이라고 눈에 명확히 적혀 있는데, 문맥상 "최댓값"이라고 무의식적으로 고쳐 적지 마세요!! 무조건 사진 글자 그대로 타이핑하세요.
16. **[수식 형태 원본 유지 및 자체 교정 금지]** 사진에 있는 수식을 자기 마음대로 더 "올바른 표현"으로 자체 교정하지 마세요. (예: `k le y le 5` 이라고 적혀 있는데 문맥상 `-k le y le 5` 이어야 한다고 스스로 판단해서 오류를 고치면 **절대 안 됩니다!!!** 보이는 그대로 적으세요.)
17. **[초긴급! 분모/분자 위치 반전(역전) 절대 금지!]** 아주 치명적인 오류입니다! 가로줄 위아래 위치를 똑똑히 확인하고 똑같이 적으세요!!
18. **[초엄격: 다항식 연산자 띄어쓰기 강제]** HWP 수식 편집기의 버그를 막기 위해, 사칙연산 및 등호(`+`, `-`, `=`, `le`, `ge`) 앞뒤로는 **무조건 공백(띄어쓰기)**을 넣으세요! (예: `x^4 + 4x^3 - 6x^2 = 0`)
"""

    async def _extract_single_problem(self, q_num, img_data, extract_semaphore, log_fn):
        async with extract_semaphore:
            # ==== Phase 1: Typist Mode (No solving, transcription only) ====
            phase1_result = None
            retries1 = 0
            while retries1 < 4:
                try:
                    log_fn(f"    [문항 {q_num}] Phase 1 (본문/수식 추출) 시작... (시도 {retries1 + 1}/4)")
                    prompt1 = f"""당신은 문제를 절대 풀지 않는 '단순 타이피스트 기계'입니다!! 
첨부된 이미지에서 **오직 '{q_num}'번 문제 영역만** 찾으세요. 이 선명한 이미지에서 해당 문제만 완벽하게 해독하고 아래 JSON 구조로 출력하세요.
[절대 주의] 당신은 이 문제를 연산하거나 해석해서 '풀면' 안 됩니다! '수학적 대칭성(켤레복소수 등)' 같은 직관을 끄고, 오직 눈에 보이는 픽셀(가로줄, 부호)만 번역하세요!

[
  {{
    "question_num": "{q_num}",
    "pre_reading_aloud": "🚨[수식 소리내어 눈으로 쫓기]🚨 모든 수식의 분모(가로줄 아래)와 분자(가로줄 위), 부호 등을 눈으로 아주 천천히 스캔하며 '한글'로 소리내어 분석하세요. (예: 분모에는 알파만 단독으로 있고 분자에는 5베타바가 있다.)",
    "question": "문제 본문 전체 텍스트 (사전 분석한 결과를 바탕으로 정확히 [[EQUATION:...]] 태그 교체)",
    "answer_options": ["① [[EQUATION:1]]", "② [[EQUATION:2]]"]
  }}
]
""" + self._get_core_rules()

                    import google.generativeai as genai
                    resp1 = await self.model.generate_content_async(
                        [img_data, prompt1],
                        generation_config=genai.types.GenerationConfig(temperature=0.0)
                    )
                    text1 = self._sanitize_json(resp1.text)
                    ext1 = self._extract_json_objects(text1)
                    if ext1:
                        phase1_result = ext1[0]
                        log_fn(f"    [문항 {q_num}] Phase 1 추출 완료")
                        break
                    
                    log_fn(f"    [문항 {q_num}] Phase 1 JSON 파싱 실패, 재시도 중...")
                    retries1 += 1
                    import asyncio; await asyncio.sleep(2)
                except Exception as e:
                    log_fn(f"    [문항 {q_num}] Phase 1 에러: {e}")
                    retries1 += 1
                    import asyncio; await asyncio.sleep(5)
            
            if not phase1_result:
                log_fn(f"    [문항 {q_num}] Phase 1 치명적 실패")
                return None

            # ==== Phase 2: Solver Mode (Explanation generated from Phase 1 + Image) ====
            phase2_result = None
            retries2 = 0
            while retries2 < 4:
                try:
                    log_fn(f"    [문항 {q_num}] Phase 2 (해설 작성) 시작... (시도 {retries2 + 1}/4)")
                    
                    if "고1" in self.curriculum:
                        level_instr = "🚨[제한 사항] 모든 풀이 방식은 반드시 '고등학교 1학년(고1) 공통수학' 수준 내에서만 해결해야 합니다. 절대 선행 개념 금지."
                    else:
                        level_instr = "모든 풀이 방식은 '고등학교 2학년/3학년(수1, 수2, 선택과목)' 수준 내에서 해결하세요."
                    
                    instr = f"전체 내용을 3~4단계로 구성하여 논리적으로 설명하세요. {level_instr}"
                    thought_prompt = "이곳에 자유롭게 먼저 다 풀어보세요."
                    if retries2 > 0:
                        thought_prompt = ""
                        
                    import json
                    prompt2 = f"""당신은 대한민국 최고의 일타 수학 강사입니다!
방금 전담 타이피스트 조교가 첨부된 이미지에서 '{q_num}'번 문제 본문을 완벽하게(환각 없이) 100% 동일하게 추출하여 아래 JSON으로 전달했습니다.
아래 제공된 [추출된 문제 텍스트]와 [원본 이미지]를 모두 참고하여 논리적인 풀이 해설을 작성해 주세요. {instr}

[추출된 문제 텍스트 (Phase 1 결과)]
{json.dumps(phase1_result, ensure_ascii=False, indent=2)}

[요청 응답 JSON 스키마 (해설만 작성할 것)]
[
  {{
    "thought_process": "{thought_prompt}",
    "explanation": "이곳에 문제에 대한 상세한 해설을 오직 '문자열'로 작성하세요."
  }}
]
""" + self._get_core_rules()

                    resp2 = await self.model.generate_content_async(
                        [img_data, prompt2],
                        generation_config=genai.types.GenerationConfig(temperature=0.0)
                    )
                    text2 = self._sanitize_json(resp2.text)
                    ext2 = self._extract_json_objects(text2)
                    if ext2:
                        phase2_result = ext2[0]
                        log_fn(f"    [문항 {q_num}] Phase 2 작성 완료")
                        break
                    
                    log_fn(f"    [문항 {q_num}] Phase 2 JSON 파싱 실패, 재시도 중...")
                    retries2 += 1
                    import asyncio; await asyncio.sleep(2)
                except Exception as e:
                    log_fn(f"    [문항 {q_num}] Phase 2 에러: {e}")
                    retries2 += 1
                    import asyncio; await asyncio.sleep(5)
                    
            if not phase2_result:
                log_fn(f"    [문항 {q_num}] Phase 2 실패. 해설 없이 반환합니다.")
                phase2_result = {"thought_process": "", "explanation": "해설 렌더링 실패"}

            # ==== Merge and Format ====
            merged = {**phase1_result, **phase2_result}
            
            import re
            def force_equation_tags(val):
                if not isinstance(val, str): return val
                val = re.sub(r'`\s*(.*?)\s*`', r'[[EQUATION:\1]]', val, flags=re.DOTALL)
                val = re.sub(r'\\\(\s*(.*?)\s*\\\)', r'[[EQUATION:\1]]', val, flags=re.DOTALL)
                val = re.sub(r'\\\[\s*(.*?)\s*\\\]', r'[[EQUATION:\1]]', val, flags=re.DOTALL)
                val = re.sub(r'\$\$\s*(.*?)\s*\$\$', r'[[EQUATION:\1]]', val, flags=re.DOTALL)
                val = re.sub(r'\$\s*(.*?)\s*\$', r'[[EQUATION:\1]]', val, flags=re.DOTALL)
                val = val.replace("<=", "le").replace(">=", "ge").replace("\\le", "le").replace("\\ge", "ge").replace("\\neq", "!=")
                
                def fix_equation_spacing(m):
                    eq = m.group(1)
                    eq = eq.replace('+', ' + ').replace('-', ' - ').replace('=', ' = ')
                    eq = eq.replace('! =', '!=') # 복구
                    import re as regex
                    eq = regex.sub(r'\s+', ' ', eq).strip()
                    return f"[[EQUATION:{eq}]]"
                val = re.sub(r'\[\[EQUATION:(.*?)\]\]', fix_equation_spacing, val)
                
                return val

            for k in ['question', 'explanation', 'thought_process']:
                if k in merged: merged[k] = force_equation_tags(merged[k])
            if 'answer_options' in merged and isinstance(merged['answer_options'], list):
                merged['answer_options'] = [force_equation_tags(opt) for opt in merged['answer_options']]

            log_fn(f"    [문항 {q_num}] [성공] 단일 코어 추출 완료! (Phase 1 + 2)")
            return merged
'''

start_idx = text.find('    async def _extract_single_problem')
end_idx = text.find('    async def _generate_single_variant')

if start_idx != -1 and end_idx != -1:
    new_text = text[:start_idx] + core_rules_method + "\n" + text[end_idx:]
    with codecs.open(file_path, 'w', 'utf-8') as f:
        f.write(new_text)
    print("SUCCESS: gemini_client.py patched with Two-Pass Architecture.")
else:
    print("ERROR: Could not find function boundaries.")
