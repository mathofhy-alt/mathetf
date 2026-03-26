import os
import re
import time
import fitz  # PyMuPDF
from PIL import Image
import io
from google import genai
from google.genai import types


# ─── 프롬프트 ───────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """당신은 수학 시험지 타이핑 전문가입니다.
아래 규칙을 절대적으로 준수하여 시험지 이미지의 내용을 그대로 타이핑하세요.

[필수 규칙]
1. 모든 텍스트를 위에서 아래로, 왼쪽에서 오른쪽 순서로 빠짐없이 타이핑합니다.
2. 수식(수학 기호, 분수, 제곱, 루트, 행렬 등)은 반드시 [[EQUATION:한컴수식]] 형식으로 감쌉니다.
   - 한컴수식 문법 예시: x^{2}, {a} over {b}, sqrt {x}, alpha, TIMES, le, ge
   - LaTeX(\\frac, \\sqrt 등) 절대 사용 금지 — 한컴 수식 문법만 사용
3. 그래프, 표, 이미지는 [그림] 으로 대체합니다.
4. 원본 줄 구조를 최대한 유지합니다. 줄바꿈은 \\n 으로 표현합니다.
5. 객관식 보기(①~⑤)도 원문 그대로 타이핑합니다. 보기 사이 구분은 공백으로 합니다.
6. <보기> 박스가 있으면 내용을 그대로 타이핑합니다.
7. 페이지 번호나 머리글/바닥글은 포함하지 않습니다.
8. 마크다운 코드블록(``` 등)이나 특수 마킹을 사용하지 마세요.
9. 추측하거나 내용을 요약하지 마세요. 원문 그대로 타이핑하세요.
10. 학생이 쓴 손글씨(풀이, 계산 과정, 낙서, 메모, 체크 표시, 답 기재 등)는 완전히 무시하세요.
    인쇄된 문제 텍스트만 타이핑합니다. 손글씨(필기체, 펜/연필 자국)와 인쇄체를 명확히 구별하세요.
11. 숫자와 영문 단독 문자는 모두 반드시 [[EQUATION:...]] 형식으로 감쌉니다.
    - 숫자 단독: 1 → [[EQUATION:1]], 100 → [[EQUATION:100]]
    - 영어 소문자 단독: x → [[EQUATION:x]], n → [[EQUATION:n]], a → [[EQUATION:a]]
    - 영어 대문자 단독: A → [[EQUATION:A]], N → [[EQUATION:N]]
    - 수식 안에 이미 포함된 경우는 별도 태그 불필요 (예: [[EQUATION:x^{2}+1]])
    - 한글 단어나 조사와 붙은 경우 해당 부분만 감싸기: "x값" → [[EQUATION:x]]값
    - 단, 영단어(두 글자 이상, 예: sin, cos, log, AB, BC 등 수학 기호가 아닌 일반 영어 단어)는 수식 처리 안 함.
      예외: sin, cos, tan, log, lim, max, min 등 수학 함수명은 수식 안에 포함시킴.
12. 괄호 안에 분수, 루트, 적분 등 높이가 큰 수식이 들어갈 경우 반드시 left ( ... right ) 를 사용합니다.
    예) ( {a} over {b} ) → left ( {a} over {b} right )
        ( sqrt {x} + 1 ) → left ( sqrt {x} + [[EQUATION:1]] right )
    일반 소괄호 (단순 문자/숫자만 포함)는 그냥 ( ) 사용 가능.

[출력 형식]
- 순수 텍스트 (마크다운 없음)
- 수식만 [[EQUATION:...]] 태그 사용
- 줄바꿈으로 단락 구분
"""

USER_PROMPT = "위 시험지 페이지의 모든 내용을 규칙에 따라 타이핑해 주세요."


def load_api_key() -> str:
    """API 키 로드 - 환경 변수 또는 같은 디렉토리의 gemini_api_key.txt"""
    env_key = os.environ.get("GEMINI_API_KEY", "")
    if env_key:
        return env_key
    key_file = os.path.join(os.path.dirname(__file__), "gemini_api_key.txt")
    if os.path.exists(key_file):
        with open(key_file, "r", encoding="utf-8") as f:
            return f.read().strip()
    raise ValueError("Gemini API 키를 찾을 수 없습니다.\ngemini_api_key.txt 파일을 exam-to-hwp 폴더에 넣거나 GEMINI_API_KEY 환경변수를 설정하세요.")


def pdf_to_images(pdf_path: str, dpi: int = 150, padding_px: int = 1500) -> list:
    """
    PDF를 페이지별 PIL Image로 변환.
    Vision Cutoff 방지를 위해 하단에 흰색 패딩 추가.
    """
    doc = fitz.open(pdf_path)
    images = []
    mat = fitz.Matrix(dpi / 72, dpi / 72)

    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

        # 하단 패딩 추가 (Vision Cutoff 방지)
        padded = Image.new("RGB", (img.width, img.height + padding_px), (255, 255, 255))
        padded.paste(img, (0, 0))
        images.append(padded)

    doc.close()
    return images


def image_to_bytes(img: Image.Image, quality: int = 85) -> bytes:
    """PIL Image를 JPEG bytes로 변환"""
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def ocr_page(client: genai.Client, model_id: str, img: Image.Image, page_num: int, log_callback=None) -> str:
    """
    단일 페이지 이미지를 Gemini로 OCR.
    MAX_TOKENS 발생 시 자동으로 이어받기(continuation)를 수행.
    반환값: 텍스트 문자열 (줄 단위)
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            print(msg)

    log(f"  페이지 {page_num + 1} OCR 요청 중...")

    img_bytes = image_to_bytes(img)

    max_retries = 3
    for attempt in range(max_retries):
        try:
            gen_config_kwargs = dict(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.0 if attempt == 0 else 0.3,
                max_output_tokens=32768,
            )
            # 단순 전사 작업이므로 thinking 완전 비활성화 (비용 절감)
            try:
                gen_config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
            except Exception:
                pass  # 구버전 SDK는 무시

            response = client.models.generate_content(
                model=model_id,
                contents=[
                    types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                    USER_PROMPT,
                ],
                config=types.GenerateContentConfig(**gen_config_kwargs)
            )


            # response.text가 None일 수 있음 (thinking 모델, 안전필터 등)
            raw_text = None
            try:
                raw_text = response.text  # 2.5 Pro 등에서 None 반환 가능
            except Exception:
                pass

            # None이면 candidates[0].parts에서 직접 추출 (thinking 파트 제외)
            if raw_text is None:
                try:
                    parts = response.candidates[0].content.parts
                    raw_text = "\n".join(
                        p.text for p in parts
                        if hasattr(p, "text") and p.text and not getattr(p, "thought", False)
                    )
                except Exception:
                    raw_text = ""

            text = (raw_text or "").strip()
            if not text:
                # finish_reason 확인
                fr = "알 수 없음"
                try:
                    fr = str(response.candidates[0].finish_reason)
                except Exception:
                    pass
                log(f"  ⚠ 페이지 {page_num + 1} 응답 비어있음 (finish_reason={fr}), 재시도...")
                if attempt < max_retries - 1:
                    time.sleep(3)
                    continue  # 반복문에서 재시도
                return f"[페이지 {page_num + 1} - 내용 없음 (finish_reason={fr})]"



            # ── MAX_TOKENS 이어받기 (최대 5회) ──────────────────────
            finish_reason = None
            try:
                finish_reason = str(response.candidates[0].finish_reason)
            except Exception:
                pass

            continuation_count = 0
            while "MAX_TOKENS" in str(finish_reason) and continuation_count < 5:
                continuation_count += 1
                log(f"  ⚠ 페이지 {page_num + 1} 출력 한도 도달, 이어받기 {continuation_count}/5...")
                cont_response = client.models.generate_content(
                    model=model_id,
                    contents=[
                        types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                        USER_PROMPT,
                        text,  # 지금까지 나온 텍스트를 컨텍스트로 전달
                        "이전 응답이 잘렸습니다. 잘린 부분 바로 다음부터 이어서 타이핑해 주세요. 앞 부분 반복 금지.",
                    ],
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,
                        temperature=0.1,
                        max_output_tokens=8192,
                    )
                )
                continuation_text = cont_response.text.strip()
                text = text + "\n" + continuation_text
                try:
                    finish_reason = str(cont_response.candidates[0].finish_reason)
                except Exception:
                    break

            # ── 토큰 사용량 로깅 ──────────────────────────────────
            try:
                usage = response.usage_metadata
                tok_in  = getattr(usage, "prompt_token_count", 0) or 0
                tok_out = getattr(usage, "candidates_token_count", 0) or 0
                tok_think = getattr(usage, "thoughts_token_count", 0) or 0
                tok_note = f" | 입력 {tok_in:,} / 출력 {tok_out:,}"
                if tok_think:
                    tok_note += f" / 추론 {tok_think:,}"
                tok_note += " 토큰"
            except Exception:
                tok_note = ""

            log(f"  페이지 {page_num + 1} OK ({len(text)}자{f', 이어받기 {continuation_count}회' if continuation_count else ''}{tok_note})")
            return text


        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "quota" in err_str.lower() or "RESOURCE_EXHAUSTED" in err_str:
                wait = 30 * (attempt + 1)
                log(f"  ⚠ 할당량 초과, {wait}초 대기 후 재시도...")
                time.sleep(wait)
            elif "RECITATION" in err_str or "SAFETY" in err_str:
                log(f"  ⚠ 안전 필터 트리거 (페이지 {page_num + 1}), 빈 페이지로 처리")
                return f"[페이지 {page_num + 1} - 추출 불가]"
            else:
                log(f"  ✗ 오류 (시도 {attempt + 1}/{max_retries}): {err_str[:200]}")
                if attempt < max_retries - 1:
                    time.sleep(5)
                else:
                    return f"[페이지 {page_num + 1} - 추출 실패: {err_str[:100]}]"

    return f"[페이지 {page_num + 1} - 추출 실패]"


def run_ocr(pdf_path: str, log_callback=None, model_id: str = "gemini-3-flash-preview") -> list[str]:
    """
    PDF 전체를 OCR하여 페이지별 텍스트 리스트 반환.
    
    Args:
        pdf_path: PDF 파일 경로
        log_callback: 로그 출력 콜백 함수 (None이면 print 사용)
        model_id: 사용할 Gemini 모델 ID
    
    Returns:
        페이지별 텍스트 문자열 리스트
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            print(msg)

    # API 초기화
    api_key = load_api_key()
    client = genai.Client(api_key=api_key)

    log(f"사용 모델: {model_id}")
    log(f"PDF 로드 중: {os.path.basename(pdf_path)}")
    images = pdf_to_images(pdf_path)
    log(f"총 {len(images)}페이지 감지됨")

    results = []
    for i, img in enumerate(images):
        page_text = ocr_page(client, model_id, img, i, log_callback)
        results.append(page_text)
        # 과도한 API 호출 방지
        if i < len(images) - 1:
            time.sleep(1.5)

    log("모든 페이지 OCR 완료!")
    return results
