import asyncio
import google.generativeai as genai
import os
import json
import logging
import fitz
from PIL import Image
import tempfile

genai.configure(api_key=open('gemini_api_key.txt').read().strip())
model = genai.GenerativeModel('gemini-3-flash-preview')

async def main():
    print("Preparing image...")
    doc = fitz.open("test.pdf")
    page = doc[0]
    mat = fitz.Matrix(2, 2)
    pix = page.get_pixmap(matrix=mat)
    mode = "RGBA" if pix.alpha else "RGB"
    img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
    if mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg

    padding_height = 2000
    padded_img = Image.new("RGB", (img.width, img.height + padding_height), (255, 255, 255))
    padded_img.paste(img, (0, 0))
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        padded_img_path = tmp.name
    padded_img.save(padded_img_path)
    
    print("Uploading file to Google...")
    sample_file = genai.upload_file(path=padded_img_path)
    print(f"File uploaded as {sample_file.uri}")

    prompt = f"""당신은 수학 해설 타이핑 전문가입니다.
첨부된 이미지에서 **오직 '2' 문제 딱 하나만** 찾아서, 아래 JSON 구조로 완벽하게 해설을 작성해 주세요.
[
  {{
    "question_num": "2",
    "question": "문제 본문 전체 텍스트 (조건, 구하는 값 등)",
    "answer_options": ["① 1", "② 2"],
    "explanation": "이곳에 문제에 대한 상세한 해설을 오직 '문자열'로 작성하세요. (객체나 배열 불가)"
  }}
]

[핵심 규칙]
전체 내용을 3~4단계(단계별 요약)로 구성할 것. 단, 문제의 '체감 난이도'에 따라 해설의 길이를 탄력적으로 조절하세요.
"""
    print("Calling API for Question 2...")
    resp = await model.generate_content_async(
        [sample_file, prompt], 
        generation_config=genai.types.GenerationConfig(
            temperature=0.1,
            max_output_tokens=8192
        )
    )
    
    print("Response received.")
    try:
        print(f"Finish Reason: {resp.candidates[0].finish_reason}")
    except:
        pass
        
    try:
        raw_text = resp.candidates[0].content.parts[0].text
        print("======== RAW TEXT ========")
        print(raw_text)
        print("==========================")
    except Exception as e:
        print("Could not get raw text:", e)
        print("Full resp obj:", resp)
        
    os.remove(padded_img_path)

if __name__ == "__main__":
    asyncio.run(main())
