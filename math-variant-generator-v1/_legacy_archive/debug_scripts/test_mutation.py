import asyncio
import json
from gemini_client_patched import GeminiMathParser
import fitz

async def main():
    # Use existing gemini_api_key.txt
    try:
        with open('gemini_api_key.txt', 'r', encoding='utf-8') as f:
            gemini_key = f.read().strip()
    except:
        print("No gemini key found.")
        return
        
    parser = GeminiMathParser(gemini_key, "gemini-3-flash-preview", "고1 수준")
    
    # Check if there is a problem PDF in the dir or we can mock it
    # I will just run discovery and OCR on a local PDF file if any exists.
    # What pdf files exist?
    import glob
    pdfs = glob.glob('*.pdf')
    if not pdfs:
        print("No PDFs to test.")
        return
        
    print(f"Testing on {pdfs[0]}...")
    
    def log_cb(msg):
        print(msg)
        
    res = await parser.extract_math_problems(pdfs[0])
    
    with open('test_mutation_output.json', 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
        
    print("Done")

if __name__ == "__main__":
    asyncio.run(main())
