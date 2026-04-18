import asyncio
import sys
import os
import json
from openai_client import OpenAIMathParser
from hml_generator import HMLGenerator

def my_log(msg):
    print(msg)

async def test():
    try:
        with open("openai_api_key.txt") as f:
            api_key = f.read().strip()
    except Exception as e:
        print("No openai_api_key.txt found.", e)
        sys.exit(1)
        
    gemini_key = ""
    try:
        with open("api_key_gemini.txt") as f:
            gemini_key = f.read().strip()
    except Exception as e:
        print("No api_key_gemini.txt found, falling back to openai OCR.")

    pdf_path = r"c:\Users\matho\OneDrive\바탕 화면\pdf모음\테스트.pdf"
    
    if not os.path.exists(pdf_path):
        print("PDF file not found:", pdf_path)
        sys.exit(1)

    model = "o3"
    curriculum = "고1 수준 (공통수학)"

    print(f"Using model: {model}, Curriculum: {curriculum}")

    try:
        parser = OpenAIMathParser(api_key, model, curriculum, gemini_key)
        
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
