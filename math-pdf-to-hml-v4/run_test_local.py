import asyncio
import sys
import os
import json
from gemini_client import GeminiMathParser
from hml_generator import HMLGenerator

def my_log(msg):
    print(f"[{msg}]")

async def test():
    try:
        with open("gemini_api_key.txt") as f:
            api_key = f.read().strip()
    except:
        print("No gemini_api_key.txt found.")
        sys.exit(1)

    pdf_path = r"c:\Users\matho\OneDrive\바탕 화면\pdf모음\테스트.pdf"
    
    if not os.path.exists(pdf_path):
        print("PDF file not found:", pdf_path)
        sys.exit(1)

    # Note: Use default model that is typically set in main.py if user selects Gemini
    model = "gemini-3.1-pro-preview" 
    try:
        with open("model.txt") as f:
            model = f.read().strip()
    except:
        pass
        
    curriculum = "고1 수준 (공통수학)"
    try:
        with open("curriculum.txt") as f:
            curriculum = f.read().strip()
    except:
        pass

    print(f"Using model: {model}, Curriculum: {curriculum}")

    try:
        parser = GeminiMathParser(api_key, model, curriculum)
        
        problems = await parser.extract_math_problems(pdf_path, log_callback=my_log)
        
        if not problems:
            print("Failed to extract problems.")
            return

        print(f"Extracted {len(problems)} problems")
        
        # Optionally dump to JSON for inspection
        with open("test_output_problems.json", "w", encoding="utf-8") as f:
            json.dump(problems, f, ensure_ascii=False, indent=2)

        generator = HMLGenerator()
        for i, p in enumerate(problems, 1):
            generator.add_problem(p, i)
        
        output_path = r"c:\Users\matho\OneDrive\바탕 화면\pdf모음\테스트_output.hml"
        generator.save(output_path)
        print("Saved to", output_path)
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
