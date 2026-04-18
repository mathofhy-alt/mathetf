import os
import json
import google.generativeai as genai

with open('gemini_api_key.txt', 'r', encoding='utf-8') as f:
    api_key = f.read().strip()

genai.configure(api_key=api_key)

prompt = """당신은 수학 해설 타이핑 전문가입니다.
첨부된 이미지에서 **오직 '12' 문제 딱 하나만** 찾아서, 아래 JSON 구조로 완벽하게 해설을 작성해 주세요.
[
  {
    "question_num": "12",
    "question": "...",
    "answer_options": ["..."],
    "thought_process": "",
    "explanation": "..."
  }
]
보기(answer_options) 배열 안에 포함되는 모든 숫자, 변수, 기호, 수식 등은 반드시 `[[EQUATION:...]]` 태그로 감싸야 합니다!
"""

print('Uploading...')
img_path = r'C:\Users\matho\.gemini\antigravity\brain\80a1ce42-de7c-4970-a08f-d390d2f71663\media__1773725897423.png'
sample_file = genai.upload_file(path=img_path)

print('Generating...')
model = genai.GenerativeModel('gemini-3-flash-preview')
response = model.generate_content(
    [sample_file, prompt],
    generation_config=genai.types.GenerationConfig(
        temperature=0.1,
        max_output_tokens=8000,
    )
)

print('================ RESPONSE ================')
print(response.text)
print('==========================================')

genai.delete_file(sample_file.name)
print('Done.')
