import os
import json
import google.generativeai as genai

pdf_path = r"c:\Users\matho\OneDrive\바탕 화면\서울강남구2025년1학기중간고사영동고공통수학1.pdf"
api_key = "AIzaSyAGTur0rIYSwjURKcWnV6P05BUbWTSwE0I"
genai.configure(api_key=api_key)
model = genai.GenerativeModel('gemini-3-flash-preview')

print("Uploading PDF...")
sample_file = genai.upload_file(path=pdf_path)

all_problems = []
chunk_ranges = [(1, 8), (9, 16), (17, 25)]

for start_q, end_q in chunk_ranges:
    prompt = f"""
당신은 수학 문제 타이핑 전문가입니다. 업로드된 PDF에서 오직 **{start_q}번 문제부터 {end_q}번 문제까지만** 추출하여 JSON 리스트로 응답하세요. (만약 해당 번호의 문제가 없다면 있는 데까지만 추출)
각 문제 객체는 다음 필드를 포함해야 합니다:
1. "question": 문제의 본문. 모든 숫자, 영문 변수, 수학 기호는 HWP 수식 명령어(LaTeX와 유사하지만 한글 수식 포맷에 맞게)를 사용하여 [[EQUATION:수식]] 형태로 감싸세요.
2. "answer_options": (객관식일 경우) 각 선택지 배열.
3. "explanation": 문제에 대한 상세하지만 '대한민국 고등학교 1학년 수학' 범위를 넘지 않는 핵심 해설 (3문장 이내 요약).
응답은 무조건 순수한 JSON 배열 형식 `[ {{...}}, {{...}} ]` 으로만 출력해야 합니다.
"""
    print(f"Extracting questions {start_q} to {end_q}...")
    response = model.generate_content(
        [sample_file, prompt],
        generation_config=genai.types.GenerationConfig(
            temperature=0.1,
            max_output_tokens=8192,
            response_mime_type="application/json",
        )
    )
    
    try:
        data = json.loads(response.text)
        print(f"-> Extracted {len(data)} items.")
        all_problems.extend(data)
    except Exception as e:
        print("-> Parse error:", e)
        print(response.text[:200])

print(f"Total extracted: {len(all_problems)} questions")
sample_file.delete()
