import os
import json
import time
from PIL import Image, ImageDraw, ImageFont
import google.generativeai as genai
from gemini_client_patched import GeminiMathParser

# 1. Create a synthetic test image using PIL
img = Image.new('RGB', (800, 300), color=(255, 255, 255))
d = ImageDraw.Draw(img)

text = """15. -1 <= x <= 3 에서 이차함수 f(x)=(x-a)^2+b 의 최솟값이 
4일 때, 두 실수 a, b에 대하여 옳은 것을 <보기>에서 있는 대로 고른 것은?

<보기>
ㄱ. a = 2일 때, b = 4이다.
ㄴ. a <= 1일 때, b = -a^2 + 2a + 5 이다.
ㄷ. a + b의 최댓값은 7이다.

1) ㄱ  2) ㄷ  3) ㄱ, ㄴ
4) ㄱ, ㄷ  5) ㄴ, ㄷ
"""
d.text((20, 20), text, fill=(0, 0, 0))
img.save("synthetic_test.png")
print("Image created: synthetic_test.png")

# 2. Run it through GeminiMathParser (which now includes the 2-pass verification)
with open('gemini_api_key.txt', 'r') as f:
    api_key = f.read().strip()
genai.configure(api_key=api_key)

# Initialize the parser
parser = GeminiMathParser(api_key)

# We want to mock _process_page_inner to read the image directly, but it expects a PDF page.
# Let's directly construct the payload and hit the API exactly as the parser does, to see the logs.
# Actually, the quickest way is to just call extract_math_problems(pdf_path) but we don't have a pdf.
img.save("synthetic_test.pdf", "PDF", resolution=100.0)

print("Running pipeline...")
try:
    results = parser.extract_math_problems("synthetic_test.pdf")
    print("FINISHED PIPELINE.")
    print(json.dumps(results, indent=2, ensure_ascii=False))
except Exception as e:
    print(f"Error: {e}")
