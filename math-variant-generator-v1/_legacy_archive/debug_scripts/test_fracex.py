import sys
import asyncio
import os
import json
sys.path.append('.')
from gemini_client import GeminiMathParser
from hml_generator import HMLGenerator

# Check for API key
key_path = "gemini_api_key.txt"
api_key = ""
if os.path.exists(key_path):
    with open(key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()

if not api_key:
    print("No Gemini API key found in gemini_api_key.txt!")
    sys.exit(1)

async def run_test():
    # Use the requested model
    parser = GeminiMathParser(api_key, "gemini-3.1-pro-preview", "고1 수준 (공통수학)")
    print("Extracting fracex1.pdf...")
    
    # Process the specific PDF
    problems = await parser.extract_math_problems(
        str(os.path.join(os.getcwd(), 'dist', 'fracex1.pdf')),
        log_callback=print,
        generate_variants=False
    )
    
    print(f"\nExtracted {len(problems)} problems.")
    
    with open('debug_fracex.json', 'w', encoding='utf-8') as f:
        json.dump(problems, f, ensure_ascii=False, indent=2)
        
    for i, p in enumerate(problems, 1):
        print(f"\n--- Problem {p.get('question_num')} ---")
        q = p.get('question', '')
        print("Raw Question Text:")
        print(q)
        
        # Test HML parsing
        gen = HMLGenerator()
        gen._parse_text_to_hml(q)
        print("\nHML Output for Question:")
        # We simply want to test the regex manually on the string to see if the fraction renders properly
        print("Testing fraction modification logic...")
        import re
        
        # Find all EQUATION blocks
        equations = re.findall(r'\[\[EQUATION:(.*?)\]\]', q, re.DOTALL)
        for eq in equations:
            out = re.sub(
                r'(?<!\\frac)\{\s*([0-9]*\s*\\?(?:bar|overline)\s*(?:\{\s*)?\\?(?:alpha|beta|gamma)(?:\s*\})?|[0-9]*\s*\\?(?:alpha|beta|gamma)\s*)\s*\}\s*\{\s*(\\?(?:bar|overline)\s*(?:\{\s*)?\\?(?:alpha|beta|gamma)(?:\s*\})?|\\?(?:alpha|beta|gamma)\s*)\s*\}', 
                r'{\1} over {\2}', 
                eq
            )
            print(f"Original eq: {eq}")
            if out != eq:
                print(f"Modified eq (regex match!): {out}")
            

if __name__ == "__main__":
    asyncio.run(run_test())
