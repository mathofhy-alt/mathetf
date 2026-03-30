# -*- coding: utf-8 -*-
import os
import re
import time
import fitz  # PyMuPDF
from PIL import Image
import io
from google import genai
from google.genai import types


# ─── 프롬프트 ────────────────
SYSTEM_PROMPT = """당신은 '수학 시험지 100% 원본 복제 타이핑 로봇(OCR)'입니다.
인간처럼 생각하거나 문제를 풀지 말고, 오직 이미지에 인쇄된 글씨를 있는 그대로 완벽하게 복사해서 타이핑하세요.

[지상 최고 명령: 한컴수식(HWP) 절대 문법 가이드]
🚨 경고: 시스템 내부에 LaTeX에서 HWP로 변환해주는 후처리 치환기가 완전히 삭제되었습니다! 🚨
따라서 당신이 실수로 LaTeX 명령어(\frac, \sqrt 등)를 단 하나라도 출력하면 렌더링 시스템 전체가 치명적인 오류를 일으킵니다.
무조건 처음부터 끝까지 100% '한컴수식 고유 문법'으로만 직출력해야 합니다!!!

0. 🚫 절대 문제를 풀거나, 내용을 해설하거나, 요약하거나, 계산 과정을 추가하지 마세요. 인쇄된 그대로만 스캔식 전사합니다.
1. 분수: `{분자} over {분모}` (예: `{a+1} over {b}`)
2. 근호(루트): `sqrt {x}` 또는 n제곱근은 `root {n} {x}`
3. ★ 괄호와 집합 기호 (치명적 오류 주의) ★
   - 수식 내에서 단순 `{` 와 `}`는 화면에 보이지 않는 '논리적 그룹핑' 기호로만 작동합니다.
   - 따라서 집합이나 조건제시법을 위해 화면에 진짜 `{ }`를 그려야 할 때는 무조건 `left { 1, 2 right }` 처럼 left와 right를 붙여야 합니다!
   - 분수나 루트처럼 위아래가 긴 수식을 괄호/절댓값으로 감쌀 때도 무조건 `left ( {a} over {b} right )`, `left | x right |` 처럼 크기 맞춤 괄호를 쓰세요.
4. 🔥 지수(^) 및 밑첨자(_) 작성을 위한 🚨초특급 주의사항🚨 🔥
   - 지수나 밑첨자 뒤에 **불필요한 중괄호 `{}`를 열어서 옆에 있는 수식까지 다 집어삼키는 치명적 환각(오작동)**을 거두십시오!
   - ❌ 최악의 오작동: `4x^{2+3x}` (원본 문서엔 4x^2 + 3x 인데 +3x까지 억지로 지수에 올려버린 심각한 오류)
   - ✅ 올바른 전사: `4x^2 + 3x` (지수가 1글자면 중괄호 생략 필수)
   - ❌ 끔찍한 오작동: `f(x _{2)-g(x _{2)<0}}` (밑첨자 중괄호를 안 닫고 뒤의 식까지 늪처럼 끌고 들어간 에러)
   - ✅ 올바른 전사: `f(x_2 ) - g(x_2 ) < 0` (🔥중요🔥: 한컴수식 특성상 밑첨자/지수 바로 뒤에 닫는 괄호 `)`가 올 때는 **반드시 `x_2 )` 처럼 한 칸 띄워주어야** 괄호가 첨자로 빨려들어가지 않습니다!)
   - ❌ 띄어쓰기 오작동: `4x  ^2` 또는 `x _{2}` 처럼 첨자 앞뒤에 쓸데없는 공백 남발 금지. 무조건 딱 붙여 쓸 것. (`4x^2`, `x_2`)
5. 연산 및 부등호: 
   - 곱하기: `TIMES`, 나누기: `DIVIDE`, 플러스마이너스: `+-`
   - 작거나 같다: `le`, 크거나 같다: `ge`, 같지 않다: `!=`, 가우스기호: `[ x ]`
5. 도형 및 화살표:
   - 선분: `overline {AB}`, 각도: `angle ABC`, 삼각형: `triangle ABC`
   - 우측 화살표: `rightarrow`
6. 극한, 시그마, 적분:
   - 극한: `lim_{x rightarrow 0}`
   - 시그마: `sum_{k=1}^{n}`
   - 적분: `int_{a}^{b} f(x) dx`
7. 그리스어 및 특수기호: `alpha`, `beta`, `gamma`, `theta`, `pi`, `cdot`(점곱)
8. ★ 조건부 함수(Piecewise) 절대 규칙 ★
   - 경우에 따라 나뉘는 함수는 절대로 `matrix`나 `&` 기호를 쓰지 마세요.
   - 무조건 `cases { f(x) ~~~~ (x>0) # g(x) ~~~~ (x<=0) }` 의 형태로 작성하세요. (`#`이 줄바꿈 역할)
9. 원본 줄 배치를 최대한 유지하며, 객관식 보기(①~⑤)도 원문 위치 그대로 타이핑합니다. <보기> 박스 내용도 절대 빼먹지 마세요.
10. 숫자 단독이나 영문 변수 단독도 반드시 [[EQUATION:...]] 태그로 감쌉니다. (예: [[EQUATION:1]], [[EQUATION:x]])

[출력 형식]
- 첫 시작부터 끝까지 순수 텍스트로만 답변할 것 (인사말, 요약, 도입부, 결론 부연설명 절대 금지)
- 마크다운 블록(```) 절대로 금지. 학생의 손글씨 낙서는 100% 무시.
- 수정/생성된 사견 없이 원문만 출력하세요.
"""

USER_PROMPT = "🚨 명심하세요: 당신은 복제 타이핑 로봇입니다. 시작이나 끝에 인사말이나 부연설명 없이 오직 이미지에 있는 인쇄된 문자와 수식을 100% 똑같이 빠짐없이 텍스트로 옮겨 적기만 하세요. 문장을 매끄럽게 고치지 마세요. 지금 바로 추출을 시작하세요:"


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
                temperature=0.0,
                top_p=0.1,
                top_k=1,
                max_output_tokens=32768,
            )
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
                        temperature=0.0,
                        top_p=0.1,
                        top_k=1,
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


def ocr_crop(client: genai.Client, model_id: str, img: Image.Image, q_num: str, log_callback=None) -> str:
    """
    단일 문항 크롭 이미지를 Gemini로 OCR.
    반환값: 해당 문항의 텍스트 문자열
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            print(msg)

    log(f"  📌 문항 {q_num}번 OCR 요청 중...")
    img_bytes = image_to_bytes(img)

    max_retries = 3
    for attempt in range(max_retries):
        try:
            gen_config_kwargs = dict(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.0,
                top_p=0.1,
                top_k=1,
                max_output_tokens=8192,
            )
            response = client.models.generate_content(
                model=model_id,
                contents=[
                    types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                    USER_PROMPT,
                ],
                config=types.GenerateContentConfig(**gen_config_kwargs)
            )

            raw_text = None
            try:
                raw_text = response.text
            except Exception:
                pass

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
                log(f"  ⚠ 문항 {q_num}번 응답 비어있음, 재시도...")
                if attempt < max_retries - 1:
                    time.sleep(3)
                    continue
                return f"[문항 {q_num}번 - 내용 없음]"

            try:
                usage = response.usage_metadata
                tok_out = getattr(usage, "candidates_token_count", 0) or 0
                tok_note = f" (출력 {tok_out:,} 토큰)"
            except Exception:
                tok_note = ""

            log(f"  문항 {q_num}번 완료!{tok_note}")
            return text

        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "quota" in err_str.lower() or "RESOURCE_EXHAUSTED" in err_str:
                wait = 30 * (attempt + 1)
                log(f"  ⚠ 할당량 초과, {wait}초 대기 후 재시도...")
                time.sleep(wait)
            else:
                log(f"  ✗ 문항 {q_num}번 오류: {err_str[:200]}")
                if attempt < max_retries - 1:
                    time.sleep(5)
                else:
                    return f"[문항 {q_num}번 - 추출 실패: {err_str[:100]}]"

    return f"[문항 {q_num}번 - 추출 실패]"


def run_ocr(pdf_path: str, log_callback=None, model_id: str = "gemini-3.1-pro-preview") -> list[str]:
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
