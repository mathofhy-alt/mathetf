import asyncio
import sys
import os
import json
from gemini_client import GeminiMathParser
from hml_generator import HMLGenerator
import time

def my_log(msg):
    timestamp = time.strftime("%H:%M:%S")
    print(f"[{timestamp}] {msg}")

async def test():
    key_path = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v5\gemini_api_key.txt"
    try:
        with open(key_path, "r", encoding="utf-8") as f:
            api_key = f.read().strip()
    except Exception as e:
        print(f"Error reading API key from {key_path}: {e}")
        sys.exit(1)
        
    pdf_path = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v5\dist\fracex1.pdf"
    
    if not os.path.exists(pdf_path):
        print("PDF file not found:", pdf_path)
        sys.exit(1)

    # Reverting to the requested model
    model = "gemini-3-flash-preview"
    curriculum = "고1 수준 (공통수학)"

    print(f"Using model: {model}, Curriculum: {curriculum}")

    try:
        parser = GeminiMathParser(api_key, model, curriculum)
        
        print("Starting extraction...")
        problems = await parser.extract_math_problems(pdf_path, log_callback=my_log)
        
        if not problems:
            print("Failed to extract problems.")
            return

        print(f"Extracted {len(problems)} problems")
        
        with open("test_v5_output.json", "w", encoding="utf-8") as f:
            json.dump(problems, f, ensure_ascii=False, indent=2)

        generator = HMLGenerator()
        for i, p in enumerate(problems, 1):
            generator.add_problem(p, i)
        
        output_path = "test_v5_final.hml"
        generator.save(output_path)
        print("Saved to", output_path)
        
        for p in problems:
            q_num = str(p.get('question_num', ''))
            print(f"\n--- Problem {q_num} Extracted Question ---")
            print(p.get('question', 'N/A'))
            print("---")
                
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
