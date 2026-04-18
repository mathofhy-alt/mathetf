import fitz
import google.generativeai as genai
from PIL import Image
from io import BytesIO

with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
    key = f.read().strip()
genai.configure(api_key=key)
model = genai.GenerativeModel("gemini-3-flash-preview")

pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\e1.pdf"
print(f"Opening {pdf_path}")
doc = fitz.open(pdf_path)
page = doc[4] # Page 5
pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
img = Image.open(BytesIO(pix.tobytes("png")))

prompt = "이 페이지에 있는 15번 문제와 16번 문제의 텍스트를 마크다운으로 그대로 타이핑해 주세요."

print("Sending Prompt to Gemini via Sync Mode (Simple Prompt)...")
resp = model.generate_content(
    [img, prompt], 
    generation_config=genai.types.GenerationConfig(temperature=0.0)
)
print("\n\n=== RAW RESPONSE TEXT ===")
print(resp.text)
