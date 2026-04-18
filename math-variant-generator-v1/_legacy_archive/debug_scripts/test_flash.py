import asyncio
import sys
import os
import json
from gemini_client import GeminiMathParser
from hml_generator import HMLGenerator

def my_log(msg):
    print(msg)

async def test():
    try:
        with open("gemini_api_key.txt") as f: # gemini key
            api_key = f.read().strip()
    except Exception as e:
        print("No api_key.txt found.", e)
        sys.exit(1)
        
    mathpix_app_id = ""
    mathpix_app_key = ""
    try:
        with open("dist/mathpix_app_id.txt", encoding="utf-8") as f:
            mathpix_app_id = f.read().strip()
        with open("dist/mathpix_app_key.txt", encoding="utf-8") as f:
            mathpix_app_key = f.read().strip()
    except Exception as e:
        print("Mathpix keys not found.", e)

    pdf_path = "dist/e1.pdf"
    
    if not os.path.exists(pdf_path):
        print("PDF file not found:", pdf_path)
        sys.exit(1)

    # Force Flash Mode
    model_name = "대안 2: Mathpix + Gemini Flash"
    curriculum = "고1 수준 (공통수학)"

    print(f"Using model: {model_name}, Curriculum: {curriculum}")

    try:
        parser = GeminiMathParser(api_key, model_name, curriculum, mathpix_app_id, mathpix_app_key)
        
        problems = await parser.extract_math_problems(pdf_path, log_callback=my_log)
        
        if not problems:
            print("Failed to extract problems.")
            return

        print(f"Extracted {len(problems)} problems")
        
        # Dump to JSON to inspect RAW formatting
        with open("test_output_flash_e1.json", "w", encoding="utf-8") as f:
            json.dump(problems, f, ensure_ascii=False, indent=2)

        generator = HMLGenerator()
        for i, p in enumerate(problems, 1):
            generator.add_problem(p, i)
        
        output_path = "e1_test.hml"
        generator.save(output_path)
        print("Saved to", output_path)
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
