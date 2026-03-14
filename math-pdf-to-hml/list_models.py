import asyncio
import google.generativeai as genai

async def main():
    api_key = open("gemini_api_key.txt").read().strip()
    genai.configure(api_key=api_key)
    
    print("Available Models:")
    try:
        models = genai.list_models()
        for m in models:
            if 'generateContent' in m.supported_generation_methods:
                print(m.name)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(main())
