import os
import json
from PIL import Image
import google.generativeai as genai

with open('gemini_api_key.txt', 'r') as f:
    api_key = f.read().strip()
genai.configure(api_key=api_key)

with open("gemini_client_patched.py", "r", encoding="utf-8") as f:
    content = f.read()

# Extract prompt
prompt_start = content.find("prompt = f\"\"\"") + 13
prompt_end = content.find("지금 바로 페이지 분석결과를 JSON Array로 엄격하게 출력하세요", prompt_start) + 40
prompt = content[prompt_start:prompt_end]
prompt = prompt.replace("{LEVEL_INSTR}", "")

img = Image.open("synthetic_test.png")

model = genai.GenerativeModel('gemini-3-flash-preview')
print("--- PASS 1: EXTRACTING ---")
response = model.generate_content([img, prompt], generation_config=genai.types.GenerationConfig(temperature=0.1, max_output_tokens=8192))
print(response.text)
