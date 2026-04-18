import os
import json
from PIL import Image
import google.generativeai as genai

with open('gemini_api_key.txt', 'r') as f:
    api_key = f.read().strip()
genai.configure(api_key=api_key)

with open("gemini_client_patched.py", "r", encoding="utf-8") as f:
    content = f.read()

prompt = content.split('prompt = """')[1].split('"""')[0]
prompt = prompt.replace("{LEVEL_INSTR}", "")
print(f"Loaded Prompt Length: {len(prompt)} chars")

img = Image.open("debug_crop_10.png")
model = genai.GenerativeModel('gemini-3-flash-preview')

print("--- PASS 1 (OCR) TESTING ---")
try:
    response = model.generate_content(
        [img, prompt], 
        generation_config=genai.types.GenerationConfig(temperature=0.0, max_output_tokens=8192)
    )
    print(response.text)
except Exception as e:
    print(f"Error: {e}")
