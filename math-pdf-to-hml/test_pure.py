import asyncio
import google.generativeai as genai
import os

genai.configure(api_key=open("gemini_api_key.txt").read().strip())

async def main():
    model = genai.GenerativeModel("gemini-3-flash-preview")
    print("Uploading file...")
    sample_file = genai.upload_file(r"C:\Users\matho\OneDrive\바탕 화면\pdf모음\테스트.pdf")
    print("File uploaded:", sample_file.uri)
    
    prompt = """
    이 PDF의 2번 문항만 수학 문제, 보기, 해설을 최대한 길게 아주 상세하게 풀어서 추출해주세요.
    JSON 형식으로 응답하세요. 
    형식:
    [
      {
        "question_num": "2",
        "question": "...",
        "answer_options": [],
        "explanation": "..."
      }
    ]
    """
    
    print("Generating content...")
    resp = await model.generate_content_async(
        [sample_file, prompt],
        generation_config={
            "max_output_tokens": 32768,
            "temperature": 0.1
        }
    )
    
    finish_reason = resp.candidates[0].finish_reason.name if resp.candidates else "UNKNOWN"
    print("\nFinish Reason:", finish_reason)
    print("Resp Text Len:", len(resp.text))
    with open("sdk_test_output.json", "w", encoding="utf-8") as f:
        f.write(resp.text)
    print("Saved to sdk_test_output.json")

if __name__ == "__main__":
    asyncio.run(main())
