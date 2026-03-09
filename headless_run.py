import os
import sys
import asyncio
import json

sys.path.append(os.path.join(os.path.dirname(__file__), "math-pdf-to-hml"))
from gemini_client import GeminiMathParser
from hml_generator import HMLGenerator

async def run_headless_extraction(pdf_path, output_hml_path):
    print(f"Starting extraction for {pdf_path}")
    api_key = "AIzaSyDvlzRyfxFJ76h6pVddExvp3TKSe1hp57M"
    parser = GeminiMathParser(api_key)
    
    def log_cb(msg):
        print(msg)
        
    problems = await parser.extract_math_problems(pdf_path, log_callback=log_cb)
    
    if not problems:
        print("Failed to extract problems.")
        return
        
    print(f"Extracted {len(problems)} problems.")
    
    generator = HMLGenerator()
    for i, prob in enumerate(problems, 1):
        generator.add_problem(prob, i)
        
    generator.save(output_hml_path)
    print(f"Saved HML to {output_hml_path}")
    
    # Save a copy of problems as JSON to debug easily
    with open(output_hml_path + ".json", "w", encoding="utf-8") as f:
        json.dump(problems, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    pdf = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml\dist\2test1.pdf"
    out_hml = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml\dist\2test1_output.hml"
    asyncio.run(run_headless_extraction(pdf, out_hml))
