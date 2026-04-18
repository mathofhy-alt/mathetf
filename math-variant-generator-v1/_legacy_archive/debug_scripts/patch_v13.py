import os

filepath = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v13\gemini_client.py"

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

old_model_init = '''            self.model = genai.GenerativeModel("gemini-3.1-pro-preview", system_instruction=self._get_core_rules())
            self.flash_model = genai.GenerativeModel("gemini-3-flash-preview", system_instruction=self._get_parsing_rules())
            if "Flash" in model_name and "Mathpix" in model_name:
                self.pro_model = genai.GenerativeModel("gemini-3-flash-preview", system_instruction=self._get_parsing_rules())
                self.pro_model_clean = genai.GenerativeModel("gemini-3-flash-preview")
            else:
                self.pro_model = genai.GenerativeModel("gemini-3.1-pro-preview", system_instruction=self._get_parsing_rules())
                self.pro_model_clean = genai.GenerativeModel("gemini-3.1-pro-preview")
            self.formatter_model = genai.GenerativeModel("gemini-3-flash-preview", system_instruction=formatter_rules)
            # 수식 번역기는 Flash (빠르고 Few-Shot이 충분하면 OK)
            self.math_translator_model = genai.GenerativeModel("gemini-3-flash-preview")
        else:
            target_model = "gemini-3.1-pro-preview"
            if model_name:
                if "flash" in model_name.lower():
                    target_model = "gemini-3-flash-preview"
                elif "pro" in model_name.lower():
                    target_model = "gemini-3.1-pro-preview"
                    
            self.model = genai.GenerativeModel(target_model, system_instruction=self._get_core_rules()) 
            self.flash_model = genai.GenerativeModel(target_model, system_instruction=self._get_parsing_rules()) 
            self.pro_model = genai.GenerativeModel(target_model, system_instruction=self._get_parsing_rules()) 
            self.pro_model_clean = genai.GenerativeModel(target_model)
            self.formatter_model = genai.GenerativeModel(target_model, system_instruction=formatter_rules)'''

new_model_init = '''            self.model = genai.GenerativeModel("gemini-3.1-pro-preview", system_instruction=self._get_core_rules(), tools="code_execution")
            self.flash_model = genai.GenerativeModel("gemini-3-flash-preview", system_instruction=self._get_parsing_rules(), tools="code_execution")
            if "Flash" in model_name and "Mathpix" in model_name:
                self.pro_model = genai.GenerativeModel("gemini-3-flash-preview", system_instruction=self._get_parsing_rules(), tools="code_execution")
                self.pro_model_clean = genai.GenerativeModel("gemini-3-flash-preview", tools="code_execution")
            else:
                self.pro_model = genai.GenerativeModel("gemini-3.1-pro-preview", system_instruction=self._get_parsing_rules(), tools="code_execution")
                self.pro_model_clean = genai.GenerativeModel("gemini-3.1-pro-preview", tools="code_execution")
            self.formatter_model = genai.GenerativeModel("gemini-3-flash-preview", system_instruction=formatter_rules)
            # 수식 번역기는 Flash (빠르고 Few-Shot이 충분하면 OK)
            self.math_translator_model = genai.GenerativeModel("gemini-3-flash-preview")
        else:
            target_model = "gemini-3.1-pro-preview"
            if model_name:
                if "flash" in model_name.lower():
                    target_model = "gemini-3-flash-preview"
                elif "pro" in model_name.lower():
                    target_model = "gemini-3.1-pro-preview"
                    
            self.model = genai.GenerativeModel(target_model, system_instruction=self._get_core_rules(), tools="code_execution") 
            self.flash_model = genai.GenerativeModel(target_model, system_instruction=self._get_parsing_rules(), tools="code_execution") 
            self.pro_model = genai.GenerativeModel(target_model, system_instruction=self._get_parsing_rules(), tools="code_execution") 
            self.pro_model_clean = genai.GenerativeModel(target_model, tools="code_execution")
            self.formatter_model = genai.GenerativeModel(target_model, system_instruction=formatter_rules)'''

text = text.replace(old_model_init, new_model_init)

old_prompt2_start = '''이 문제를 바탕으로 완벽한 해설을 `thought_process`와 `explanation_raw` 영역에 작성하세요.
**풀이의 핵심 단계와 수식 위주로 최대한 간결하게(개조식으로) 작성해 줘.**


🚨 [HWP 수식 태그 작성 필수 규칙] 🚨'''

new_prompt2_start = '''이 문제를 바탕으로 완벽한 해설을 `thought_process`와 `explanation_raw` 영역에 작성하세요.
**풀이의 핵심 단계와 수식 위주로 최대한 간결하게(개조식으로) 작성해 줘.**

🚨 [AI 해설 전담 작성 강제 프로세스 (Zero-Hallucination)] 🚨
[1단계: 설계 (Plan)] 문제의 핵심 조건과 해결해야 할 방향 3가지를 먼저 선언하라.
[2단계: 연산 (Solve)] 절대 암산하지 마라. 가상의 파이썬 코드 실행기를 이용해 연산하거나, 중간 연산 과정을 철저하게 수식 블록으로 전개하라.
[3단계: 역대입 검증 (Critique)] 도출된 답을 원래 방정식/조건에 다시 대입하여 좌변/우변이 일치하는지 `thought_process` 안에서 반드시 증명하라. 완벽히 일치할 때만 해설 작성을 시작/완료하고, 오차가 있다면 즉시 과정 전체를 다시 점검하라.

🚨 [HWP 수식 태그 작성 필수 규칙] 🚨'''

text = text.replace(old_prompt2_start, new_prompt2_start)

old_hybrid_start = '''[Step 2: 1타 강사 모드 (해설 작성)]
추출이 끝났다면, 이제 똑똑한 강사로 돌아와 방금 추출한 '{q_num}'번 문제를 바탕으로 논리적인 해설을 작성하여 `thought_process`와 `explanation` 영역에 채워 넣으세요.
{level_instr} 
🚨 [HWP 수식 태그 작성 필수 규칙] 🚨'''

new_hybrid_start = '''[Step 2: 1타 강사 모드 (해설 작성)]
추출이 끝났다면, 이제 똑똑한 강사로 돌아와 방금 추출한 '{q_num}'번 문제를 바탕으로 논리적인 해설을 작성하여 `thought_process`와 `explanation` 영역에 채워 넣으세요.

🚨 [AI 해설 전담 작성 강제 프로세스 (Zero-Hallucination)] 🚨
[1단계: 설계 (Plan)] 문제의 핵심 조건과 해결해야 할 방향 3가지를 먼저 선언하라.
[2단계: 연산 (Solve)] 절대 암산하지 마라. 가상의 파이썬 코드 실행기를 이용해 연산하거나, 중간 연산 과정을 철저하게 수식 블록으로 전개하라.
[3단계: 역대입 검증 (Critique)] 도출된 답을 원래 방정식/조건에 다시 대입하여 좌변/우변이 일치하는지 `thought_process` 안에서 반드시 증명하라. 완벽히 일치할 때만 해설 작성을 시작/완료하고, 오차가 있다면 즉시 과정 전체를 다시 점검하라.

{level_instr} 
🚨 [HWP 수식 태그 작성 필수 규칙] 🚨'''

text = text.replace(old_hybrid_start, new_hybrid_start)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)
print("PATCH_COMPLETE")
