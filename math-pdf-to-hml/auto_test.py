import os
import re
from gemini_client import GeminiMathParser
from hml_generator import HMLGenerator

def run_headless_test():
    pdf_path = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml\dist\this.pdf"
    api_key = "AIzaSyAGTur0rIYSwjURKcWnV6P05BUbWTSwE0I"

    print(f"🚀 [Headless Automation] Testing PDF: {pdf_path}")
    
    try:
        parser = GeminiMathParser(api_key=api_key)
        print("1. Extracting math problems via Gemini API...")
        problems = parser.extract_math_problems(pdf_path)
        print(f"✅ Extracted {len(problems)} problems.")
        
        print("1.5 Dumping raw Gemini JSON to raw_gemini_output.json...")
        import json
        with open("raw_gemini_output.json", "w", encoding="utf-8") as f:
            json.dump(problems, f, ensure_ascii=False, indent=2)
            
        generator = HMLGenerator()
        print("2. Generating HML payload...")
        for i, problem in enumerate(problems):
            generator.add_problem(problem, i + 1)
        
        generator.save("auto_test_output.hml")
        
        with open("auto_test_output.hml", "r", encoding="utf-8") as f:
            hml_output = f.read()
        
        # Parse output for broken math (backslashes)
        script_tags = re.findall(r'<SCRIPT>(.*?)</SCRIPT>', hml_output)
        
        print("\n--- 🔍 HWP Equation Translation Audit ---")
        suspicious = 0
        for i, script in enumerate(script_tags, 1):
            print(f"Eq [{i}]: {script}")
            if '\\' in script:
                print(f"    ⚠️ WARNING: Backslash leaked into HWP -> {script}")
                suspicious += 1
                
        print(f"\n✅ Audit complete. Found {len(script_tags)} equations.")
        if suspicious == 0:
            print("🎉 SUCCESS: No LaTeX backslashes leaked into the HWP script!")
        else:
            print(f"⚠️ FAILED: {suspicious} equations contain broken LaTeX syntax.")
            
        with open("auto_test_output.hml", "w", encoding="utf-8") as f:
            f.write(hml_output)
        print("💾 Dumped full payload to auto_test_output.hml")
        
    except Exception as e:
        print(f"❌ Automation Crash: {e}")

if __name__ == "__main__":
    run_headless_test()
