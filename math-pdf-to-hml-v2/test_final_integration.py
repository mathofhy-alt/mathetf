from gemini_client import GeminiMathParser
import sys

api_key = "AIzaSyAGTur0rIYSwjURKcWnV6P05BUbWTSwE0I"
parser = GeminiMathParser(api_key)
pdf_path = r"c:\Users\matho\OneDrive\바탕 화면\서울강남구2025년1학기중간고사영동고공통수학1.pdf"

print("Starting extraction using the real gemini_client.py...")
questions = parser.extract_math_problems(pdf_path)
print(f"Extraction finished! Total questions extracted: {len(questions)}")
if len(questions) < 22:
    print("FAILED: Did not extract enough questions.")
    sys.exit(1)
print("SUCCESS: 22 or more questions extracted!")
