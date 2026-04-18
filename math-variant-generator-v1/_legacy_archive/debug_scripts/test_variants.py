import asyncio
from gemini_client import GeminiMathParser
from hml_generator import HMLGenerator
import time
import os

async def main():
    api_key = open("gemini_api_key.txt").read().strip()
    parser = GeminiMathParser(api_key, "gemini-3-flash-preview", "고1 수준 (공통수학)")
    
    def log_it(msg):
        print(msg)

    print("Starting extraction ON ex1.pdf WITH variants enabled...")
    start_time = time.time()
    try:
        # We test on ex1.pdf, which has 4 problems. It should generate 4 originals + 12 variants = 16 problems.
        pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml\dist\ex1.pdf"
        results = await parser.extract_math_problems(pdf_path, log_callback=log_it, generate_variants=True, variant_difficulty="3단계: 상")
        
        print(f"\n==== EXTRACTION DONE ({time.time() - start_time:.2f}s) ====")
        print(f"Total problems generated: {len(results) if results else 0}")
        
        if results:
            # Let's see some generated question numbers
            print("Extracted Question IDs:")
            for r in results:
                print(" -", r.get("question_num", "UNKNOWN"))
            
            # Generate HML
            generator = HMLGenerator()
            for i, prob in enumerate(results, 1):
                generator.add_problem(prob, i)
            generator.save("ex1_with_variants.hml")
            print("Successfully saved ex1_with_variants.hml")
            
    except Exception as e:
        print("\nFATAL SCRIPT ERROR:", e)

if __name__ == "__main__":
    asyncio.run(main())
