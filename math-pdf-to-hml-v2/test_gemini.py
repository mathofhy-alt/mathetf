import sys
import asyncio
import traceback
import tempfile
import fitz
from PIL import Image
from gemini_client import GeminiMathParser
import google.generativeai as genai

async def test():
    try:
        pdf_path = r'C:\Users\matho\OneDrive\바탕 화면\pdf모음\테스트.pdf'
        with open('gemini_api_key.txt', 'r') as f:
            api_key = f.read().strip()
            
        parser = GeminiMathParser(api_key, 'gemini-3-flash-preview')
        
        doc = fitz.open(pdf_path)
        page = doc[0] # Page 1
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            padded_img_path = tmp.name
        img.save(padded_img_path)
        
        sample_file = genai.upload_file(path=padded_img_path)
        print("File uploaded. Running generation for 문항 1...", flush=True)
        
        q_num = "1"
        prompt = parser.prompt_template.format(
            q_num=q_num,
            curric=parser.curriculum,
            instr="해설어투를 지키세요."
        )
        
        resp = await parser.model.generate_content_async(
            [sample_file, prompt], 
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
                max_output_tokens=8192
            )
        )
        
        with open("dump_gemini_flash.txt", "w", encoding="utf-8") as f:
            f.write(resp.text)
            
        print("Dump complete. File saved to dump_gemini_flash.txt", flush=True)

    except Exception as e:
        print("EXCEPTION FATAL:")
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(test())
