import asyncio
import os
import sys
import json

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from gemini_client import GeminiMathParser
import fitz
from PIL import Image
from io import BytesIO

async def main():
    target_pdf = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\e1.pdf"
    with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
        key = f.read().strip()
        
    parser = GeminiMathParser(key, "gemini-3-flash-preview", "고1(통합)")
    
    doc = fitz.open(target_pdf)
    page = doc[2] # 3페이지 (index 2)
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
    img = Image.open(BytesIO(pix.tobytes("png")))
    
    sem = asyncio.Semaphore(1)
    res = await parser._extract_single_problem("12", img, sem, print)
    with open("p12.json", "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    print("Saved to p12.json")

if __name__ == "__main__":
    asyncio.run(main())
