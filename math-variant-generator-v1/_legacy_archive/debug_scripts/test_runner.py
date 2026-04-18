import os
import re
import json
from dotenv import load_dotenv
from gemini_client import GeminiMathParser

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

def extract_number(q_text):
    match = re.search(r'^\[\[EQUATION:.*?\]\]\s*^\s*(\d+)', q_text.strip())
    if match: return int(match.group(1))
    
    match = re.search(r'^(\d+)', q_text.strip())
    if match: return int(match.group(1))
    
    match = re.search(r'(\d+)\)', q_text.strip()[:10])
    if match: return int(match.group(1))
    
    match = re.search(r'\[서술형\s*(\d+)\]', q_text)
    if match: return 20 + int(match.group(1)) # Assuming 서술형 1 is 21, etc
    return -1

def run_test():
    parser = GeminiMathParser(api_key=api_key)
    pdf_path = "dist/this.pdf"
    
    print("🚀 Starting test with gemini-3-flash-preview")
    try:
        results = parser.extract_math_problems(pdf_path)
    except Exception as e:
        print(f"Error during extraction: {e}")
        return

    print(f"Total extracted: {len(results)}")
    
    extracted_nums = []
    for i, q in enumerate(results):
        q_text = q.get('question', '')
        num = extract_number(q_text)
        if num == -1:
            print(f"Could not parse number from Q{i+1}: {q_text[:50]}...")
            # We'll just append it in order if we can't find it
            if len(extracted_nums) > 0:
                extracted_nums.append(extracted_nums[-1] + 1)
            else:
                extracted_nums.append(1)
        else:
            extracted_nums.append(num)
            
    extracted_nums = sorted(list(set(extracted_nums)))
    print("Extracted numbers:", extracted_nums)
    expected = list(range(1, 23))
    missing = [x for x in expected if x not in extracted_nums]
    print("Missing numbers:", missing)

    with open('test_results.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    run_test()
