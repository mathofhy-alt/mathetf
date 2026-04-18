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
page = doc[2] # Page 3 (Index 2 - problems 9 to 12)
pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
img = Image.open(BytesIO(pix.tobytes("png")))

# Crop the bottom right quadrant where problem 12 usually is, or just send the full page 
# and ask specifically for text of Problem 12.
prompt = "이 페이지에 있는 '12번 문제'의 문제 텍스트(보기 포함)를 마크다운이나 기본 텍스트로 그대로 타이핑해 주세요. 수식은 어떻게 생겼는지 파악하기 위함입니다."

print("Sending Prompt to Gemini via Sync Mode (Simple Prompt)...")
resp = model.generate_content(
    [img, prompt], 
    generation_config=genai.types.GenerationConfig(temperature=0.0)
)
print("\n\n=== RAW RESPONSE TEXT ===")
print(resp.text)
