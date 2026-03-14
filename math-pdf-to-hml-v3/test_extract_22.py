import os
import json
import google.generativeai as genai

pdf_path = r"c:\Users\matho\OneDrive\바탕 화면\서울강남구2025년1학기중간고사영동고공통수학1.pdf"
api_key = "AIzaSyAGTur0rIYSwjURKcWnV6P05BUbWTSwE0I"

genai.configure(api_key=api_key)
model = genai.GenerativeModel('gemini-3-flash-preview')

prompt = """
당신은 수학 문제 타이핑 전문가입니다. 업로드된 PDF에서 수학 문제들을 추출하여 JSON 리스트로 응답하세요.
각 문제 객체는 다음 필드를 포함해야 합니다:
1. "question": 문제의 본문. 모든 숫자, 영문 변수, 수학 기호는 반드시 HWP 수식 명령어(LaTeX와 유사하지만 한글 수식 포맷에 맞게)를 사용하여 [[EQUATION:수식]] 형태로 감싸세요.
2. "answer_options": (객관식일 경우) 각 선택지 리스트. 수식 포함.
3. "explanation": 문제에 대한 상세한 해설. 미주(Endnote)에 들어갈 내용입니다. 수식 포함.
[교육과정 및 해설 내용 규칙]
- 해설은 반드시 '대한민국 고등학교 1학년 수학(수학 상, 수학 하)' 교육과정 수준에 맞게 작성해야 합니다.
- 고1 범위를 벗어나는 공식(예: 로피탈의 정리, 미적분학의 기본정리 등)은 절대 사용하지 마세요.
- 다소 계산이 길어지더라도 고1 수준의 개념(다항식, 방정식, 부등식, 도형의 방정식, 함수 등)만으로 풀어야 합니다.
- [중요] 응답 길이가 길어지면 시스템이 끊어지므로, 해설은 반드시 3문장 이내로 아주 간결하게 핵심만 요약하세요.
- 루트, 지수 등도 HWP 수식 문법(예: {sqrt{x}}, x^{2})을 사용하여 [[EQUATION:{sqrt{x}}]] 처럼 작성하세요.
- 응답은 반드시 순수한 JSON 코드 블록만 출력하세요.
- **[주의] JSON 문자열 내부에 백슬래시(\) 기호를 사용할 때(예: \\times, \\alpha 등)는 반드시 이중 백슬래시(\\\\)로 이스케이프 처리하세요. (예: "[[EQUATION:\\\\alpha + \\\\beta]]")**
- **[절대 규칙] 문제 풀이 과정이나 생각(Thought process)을 절대 먼저 텍스트로 적지 마세요. 무조건 제일 첫 글자부터 `[` 로 시작하는 순수 JSON 배열만 정확히 출력해야 합니다.**
"""

print("Uploading PDF...")
sample_file = genai.upload_file(path=pdf_path)
print("Generating content...")

response = model.generate_content(
    [sample_file, prompt],
    generation_config=genai.types.GenerationConfig(
        temperature=0.1,
        max_output_tokens=8192,
        response_mime_type="application/json",
    )
)

print(f"Finish Reason: {response.candidates[0].finish_reason}")
print(f"Text Length: {len(response.text)}")
try:
    data = json.loads(response.text)
    print(f"Parsed {len(data)} items")
except Exception as e:
    print("JSON Parse error:", e)

sample_file.delete()
