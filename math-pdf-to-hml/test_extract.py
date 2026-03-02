import json
from gemini_client import GeminiMathParser

pdf_path = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml\dist\this.pdf"
api_key = "AIzaSyAGTur0rIYSwjURKcWnV6P05BUbWTSwE0I"

parser = GeminiMathParser(api_key)
problems = parser.extract_math_problems(pdf_path)

with open("debug_gemini.json", "w", encoding="utf-8") as f:
    json.dump(problems, f, ensure_ascii=False, indent=2)

print("Dumped 100% of this.pdf to debug_gemini.json")
