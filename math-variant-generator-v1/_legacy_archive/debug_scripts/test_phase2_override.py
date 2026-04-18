import asyncio
import os
import fitz
from PIL import Image
import google.generativeai as genai
import tempfile
import json
from gemini_client import GeminiMathParser

async def run_phase2_override_debug():
    print("=== [디버그] Phase 2 Teacher Override 디버깅 ===\n")
    try:
        with open("gemini_api_key.txt", "r", encoding="utf-8") as f:
            api_key = f.read().strip()
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-3.1-pro-preview')
        parser = GeminiMathParser(api_key=api_key)
        
        pdf_path = r"C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v8\dist\hue.pdf"
        print("> 1. hue.pdf 3x3 해상도 렌더링 중...")
        doc = fitz.open(pdf_path)
        page = doc[0]
        mat = fitz.Matrix(3, 3)
        pix = page.get_pixmap(matrix=mat)
        mode = "RGBA" if pix.alpha else "RGB"
        img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
        if mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
            
        padding_height = 500
        padded_img = Image.new("RGB", (img.width, img.height + padding_height), (255, 255, 255))
        padded_img.paste(img, (0, 0))
        
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            padded_img_path = tmp.name
        padded_img.save(padded_img_path)
        
        print("> 2. 파일 업로드 중...")
        sample_file = genai.upload_file(path=padded_img_path)
        
        # Hardcode Phase 1's broken result
        phase1_result = {
            "question_num": "1",
            "pre_reading_aloud": "🚨[수식 소리내어 눈으로 쫓기]🚨 ...",
            "question": "두 복소수 [[EQUATION:alpha = 4 + 3i]]와 [[EQUATION:beta = 2 + i]]에 대하여\n[[EQUATION:alpha bar beta + bar alpha beta + {{{{5 beta}}}} over {{{{alpha}}}} + {{{{5 bar beta}}}} over {{{{alpha}}}}]]\n의 값은? (단, [[EQUATION:bar alpha]], [[EQUATION:bar beta]]는 각각 [[EQUATION:alpha]], [[EQUATION:beta]]의 켤레복소수)",
            "answer_options": ["① [[EQUATION:21]]", "② [[EQUATION:22]]"]
        }

        # prompt2 copied from gemini_client.py
        prompt2 = f"""당신은 대한민국 최고 수준의 일타 수학 강사입니다.
이 2단계 프로세스의 가장 중요한 핵심 목표는 **'시각적 한계로 인한 조교 텍스트의 수학적 오류 검수 및 완벽한 교정'**입니다.

방금 조교(Phase 1)가 이미지에서 수학 문제를 추출해 왔습니다. 하지만 조교는 오직 글씨만 따라 치는 타자수이므로, 이미지에 있는 아주 얇은 켤레복소수 선(bar)이나 미세한 위첨자, 점, 부호 등을 놓치는 치명적인 오타를 종종 범합니다.
(대표적 오류 예시: 실제 이미지는 \\frac{{5\\beta}}{{\\bar{{\\alpha}}}} 인데, 조교는 선을 못 보고 \\frac{{5\\beta}}{{\\alpha}} 처럼 bar를 빼먹고 추출해 오는 현상)

[필수 지시사항]
1. 본격적인 해설을 쓰기 전에, 반드시 [원본 이미지]의 수식과 조교의 [추출된 문제 텍스트]를 수학적 논리로 1:1 교차 검증하세요.
2. 조교의 수식이 수학적으로 앞뒤가 안 맞거나 미세한 기호(bar 등)가 누락되었다고 확신한다면, 이미지를 다시 뚫어져라 살펴보고 올바른 수학 수식으로 교정하세요.
3. 교정이 완료된 완벽무결한 문제 본문을 `corrected_question` 필드에 전부 다시 작성하세요. (조교가 잘 추출했다면 원본 그대로 복사)
4. 모든 수식은 예외 없이 오직 `[[EQUATION:...]]` 태그로만 감싸야 합니다. (Markdown 절대 금지, \\overline 대신 단일 문자는 절대적으로 bar 사용)
5. 학생이 완벽하게 이해할 수 있도록 단계별로 명확하고 상세한 풀이 과정(`explanation`)을 작성하세요.

[출력 형식 (오직 JSON)]
{{
  "thought_process": "수학적 논리로 조교의 추출 오류(bar 누락 등) 검증 내역, 발견 사항, 그리고 풀이 방향 스케치",
  "corrected_question": "(교정이 완료된) 완전한 문제 본문 텍스트 전체",
  "explanation": "[[EQUATION:...]] 래퍼를 사용한 상세 구조적 수식 풀이 해설"
}}

[조교가 먼저 추출해 둔 문제 텍스트 (Phase 1 결과 - 오타가 존재할 수 있으니 의심할 것!)]
{json.dumps(phase1_result, ensure_ascii=False, indent=2)}
"""

        print("> 3. Gemini 3.1 Pro (Phase 2 Teacher Override) 응답 대기 중...\n")
        resp2 = await model.generate_content_async(
            [sample_file, prompt2],
            generation_config=genai.types.GenerationConfig(temperature=0.0)
        )
        
        print("======== [🚨 Phase 2 RAW 아웃풋 🚨] ========\n")
        print(resp2.text)
        print("\n==================================================\n")
        
        with open("P2_RAW_GEMINI_OUTPUT.txt", "w", encoding="utf-8") as f:
            f.write("=== [🚨 Phase 2 RAW 아웃풋 🚨] ===\n\n")
            f.write(resp2.text)
            
    except Exception as e:
        print(f"오류: {e}")
    finally:
        try:
            sample_file.delete()
            os.remove(padded_img_path)
        except: pass

if __name__ == "__main__":
    asyncio.run(run_phase2_override_debug())
