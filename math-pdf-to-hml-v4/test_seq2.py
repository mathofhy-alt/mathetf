import asyncio
import json
from gemini_client import GeminiMathParser

async def main():
    api_key = open("gemini_api_key.txt").read().strip()
    parser = GeminiMathParser(api_key, "gemini-3-flash-preview", "고1 수준 (공통수학)")
    
    def log_it(msg):
        print("LOG:", msg)

    print("Starting extraction...")
    results = await parser.extract_math_problems("test.pdf", log_callback=log_it)
    
    print("\n\n==== DONE ====")
    print("Total problems extracted:", len(results))
    print(json.dumps(results, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
