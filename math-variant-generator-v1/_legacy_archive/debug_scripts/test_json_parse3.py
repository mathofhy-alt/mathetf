import asyncio
import os
import fitz
import google.generativeai as genai
import tempfile
from PIL import Image

async def test_probs():
    key_path = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v5\gemini_api_key.txt"
    with open(key_path, "r", encoding="utf-8") as f:
        api_key = f.read().strip()
    
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-3-flash-preview')
    
    pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\모의고사\2025\9월\2025_고3_9월_0공통.pdf"
    doc = fitz.open(pdf_path)
    
    # 문제 13은 5페이지 (인덱스 4), 문제 15는 6페이지 (인덱스 5)
    test_cases = [("13", 4), ("15", 5)]
    
    for q_num, page_idx in test_cases:
        print(f"\n==================== Testing Problem {q_num} ====================")
        page = doc[page_idx]
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            img_path = tmp.name
        img.save(img_path)
        
        sample_file = await asyncio.to_thread(genai.upload_file, path=img_path)
        
        prompt = f"""당신은 수학 해설 타이핑 전문가입니다.
첨부된 이미지에서 **오직 '{q_num}' 문제 딱 하나만** 찾아서, 아래 JSON 구조로 완벽하게 해설을 작성해 주세요.
[
  {{
    "question_num": "{q_num}",
    "question": "문제 본문 전체 텍스트 (조건, 구하는 값 등)",
    "answer_options": ["① 1", "② 2"],
    "thought_process": "이곳에 자유롭게 먼저 다 풀어보세요.",
    "explanation": "이곳에 문제에 대한 상세한 해설을 오직 '문자열'로 작성하세요."
  }}
]

[핵심 규칙]
1. 허수 i vs 알파벳 l 구분 (복소수 맥락이면 i).
2. 분수와 bar 혼동 금지: `{{{{bar {{{{beta}}}}}}}} over {{{{alpha}}}}` 형태 유지.
3. 모든 수식/숫자/변수는 `[[EQUATION:...]]` 태그 필수.
4. **한글 수식 표준 문법 사용**: `{{{{a}}}} over {{{{b}}}}`, `bar {{{{alpha}}}}`, `pi`, `root` 등.
5. **크기 조절 괄호 필수**: 분수(`over`)를 감싸는 괄호는 일반 괄호 `( )` 대신 반드시 `LEFT ( ... RIGHT )` 또는 `LEFT {{{{ ... RIGHT }}}}`를 사용하세요. (예: `LEFT ( {{{{1}}}} over {{{{5}}}} RIGHT )^{{{{root {{{{2}}}}}}}}`)
6. **부등호 기호 주의**: `<=`나 `>=` 대신 반드시 단일 선 부등호인 `le` (또는 `<=`) 와 `ge` (또는 `>=`) 대신 **`le` 와 `ge`** 명령어 자체를 사용하여 한글 수식 편집기에서 밑줄이 하나인 부등호(≤, ≥)로 렌더링되게 하세요. (예: `x le 3`)
7. **극한(Limit) 문제 시각적 풀이 필수**: 함수 극한 문제에서 그래프 이미지가 주어졌다면, **절대 수식만으로 유추하여 풀지 말고 반드시 주어진 그래프 이미지를 눈으로 읽고** 좌극한/우극한 값을 도출하세요.
8. 해설은 해라체(-다)를 사용하고 마지막에 "따라서 정답은 [최종답안]이다."를 포함하세요."""

        print("Requesting Gemini...")
        try:
            resp = await model.generate_content_async(
                [sample_file, prompt],
                generation_config=genai.types.GenerationConfig(temperature=0.0)
            )
            
            print("\n========= RAW TEXT =========")
            print(resp.text)
            print("============================")
        except Exception as e:
            print(f"Error calling API for {q_num}:", e)
        finally:
            try: await asyncio.to_thread(sample_file.delete)
            except: pass

if __name__ == "__main__":
    asyncio.run(test_probs())
