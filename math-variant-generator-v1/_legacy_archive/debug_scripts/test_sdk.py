import asyncio
import json
from gemini_client import GeminiMathParser
import logging

async def main():
    api_key = open("gemini_api_key.txt").read().strip()
    parser = GeminiMathParser(api_key, "gemini-2.5-flash", "고1 수준 (공통수학)")
    
    def log_it(msg):
        print(msg)

    print("Starting extraction on REAL testing PDF...")
    try:
        results = await parser.extract_math_problems(r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml\dist\ex1.pdf", log_callback=log_it)
        print("\n\n==== DONE ====")
        print("Total problems extracted:", len(results) if results else 0)
    except Exception as e:
        print("\nFATAL SCRIPT ERROR:", e)

if __name__ == "__main__":
    asyncio.run(main())
