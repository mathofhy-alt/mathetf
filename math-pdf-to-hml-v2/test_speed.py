import asyncio
from gemini_client import GeminiMathParser
import time

async def main():
    api_key = open("gemini_api_key.txt").read().strip()
    parser = GeminiMathParser(api_key, "gemini-3-flash-preview", "고1 수준 (공통수학)")
    
    def log_it(msg):
        print(msg)

    print("Starting high-speed extraction on ex1.pdf...")
    start_time = time.time()
    try:
        results = await parser.extract_math_problems(r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml\dist\ex1.pdf", log_callback=log_it)
        print("\n\n==== DONE ====")
        print(f"Total problems extracted: {len(results) if results else 0}")
        print(f"Total time elapsed: {time.time() - start_time:.2f} seconds")
    except Exception as e:
        print("\nFATAL SCRIPT ERROR:", e)

if __name__ == "__main__":
    asyncio.run(main())
