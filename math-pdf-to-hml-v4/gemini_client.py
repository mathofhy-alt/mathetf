import os
import asyncio
import google.generativeai as genai
from google.generativeai import caching
import datetime
import urllib.request
from typing import List, Dict, Optional, Callable
import json
import re
import fitz
import tempfile
import time
from PIL import Image

class GeminiMathParser:
    def __init__(self, api_key: str, model_name: str = 'gemini-3-flash-preview', curriculum: str = "고1 수준 (공통수학)"):
        genai.configure(api_key=api_key)
        self.api_key = api_key
        self.model_name = model_name
        self.curriculum = curriculum
        self.model = genai.GenerativeModel(self.model_name)
        
    async def extract_math_problems(self, pdf_path: str, log_callback: Optional[Callable[[str], None]] = None, generate_variants: bool = False, variant_difficulty: str = "1단계: 하") -> List[Dict]:
        """
        [고속 분석 엔진 V2]
        PDF를 이미지로 변환 후, 업로드된 이미지를 모든 문항이 공유하여 
        비동기 병렬(Async Parallel)로 정밀 타겟 추출을 수행합니다.
        """
        all_problems = []
        
        def _log(msg):
            print(msg)
            if log_callback:
                log_callback(msg)

        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        _log(f"🚀 [고속 엔진] 총 {total_pages}장의 PDF 고해상도 병렬 분석을 시작합니다.")

        # 병렬성 제어 (동시성 복구: 원래의 빠른 속도를 위해 25 처리)
        extract_semaphore = asyncio.Semaphore(25) # 문항 추출 동시 처리 수

        async def _process_page_inner(page_num):
            page = doc[page_num]
            _log(f"  -> [{page_num + 1}페이지] 이미지 렌더링 및 패딩 작업 중...")
            
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat)
            mode = "RGBA" if pix.alpha else "RGB"
            img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
            if mode == "RGBA":
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[3])
                img = bg

            padding_height = 2000
            padded_img = Image.new("RGB", (img.width, img.height + padding_height), (255, 255, 255))
            padded_img.paste(img, (0, 0))
            # Create a closed NamedTemporaryFile so Windows doesn't lock it while Image.save accesses it
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                padded_img_path = tmp.name
                
            padded_img.save(padded_img_path)
            
            try:
                # 1. 파일 업로드 (비동기 스레드)
                sample_file = await asyncio.to_thread(genai.upload_file, path=padded_img_path)
                
                # 2. Discovery (문제 번호 찾기) - 매우 강력한 탐색 모드
                discovery_prompt = """시험지 이미지 전체를 샅샅이 스캔하여 존재하는 모든 독립된 '메인 문제 번호'를 하나도 빠짐없이 찾아 오직 파이썬 리스트 형식으로만 응답하세요.
(예: ["1", "2", "3", "서술형 1"]) 
[🚨 초엄격 규칙 - 위반 시 치명적 오류 발생 🚨]
1. 맨 밑이나 맨 위에 적힌 '페이지 번호(예: 1, 2, 3...)' 등 본문이 아닌 숫자는 절대 문항 번호로 추출하지 마십시오!
2. (1), (2), ①, ② 같은 소문항이나 객관식 보기 번호는 절대 포함하지 마십시오.
3. 문제가 실질적으로 시작되는 큰 굵은 글씨의 메인 번호만 찾으십시오.
4. 문제를 하나 찾았다고 절대 도중에 파싱을 멈추지 마십시오. 이미지 끝(바닥)에 도달할 때까지 모든 문제 번호를 100% 샅샅이 긁어모아 완전한 배열을 만드십시오.
5. 1., 2., 3. 처럼 점이 찍힌 번호라도 "1", "2", "3"으로 깔끔하게 리스트 정수로 만드세요."""
                
                retries = 0
                problem_numbers = []
                while retries < 4:
                    try:
                        resp = await self.model.generate_content_async(
                            [sample_file, discovery_prompt],
                            generation_config=genai.types.GenerationConfig(
                                temperature=0.0,
                                response_mime_type="application/json"
                            )
                        )
                        parsed = self._parse_list(resp.text)
                        if parsed is not None:
                            parsed = [str(x).replace(".", "").strip() for x in parsed if str(x).strip()]
                            seen = set()
                            problem_numbers = [x for x in parsed if not (x in seen or seen.add(x))]
                            break
                        else:
                            raise ValueError("Parse failed during discovery (no JSON array found)")
                    except Exception as e:
                        retries += 1
                        err_str = str(e).lower()
                        if "429" in err_str or "quota" in err_str or "exhausted" in err_str:
                            wait_time = retries * 15  # 15s, 30s, 45s, 60s
                            _log(f"  ⏳ [{page_num + 1}페이지] API 할당량 초과(429). {wait_time}초 대기 후 재시도... ({retries}/4)")
                            await asyncio.sleep(wait_time)
                        else:
                            _log(f"  !! [{page_num + 1}페이지] Discovery 오류: {e}")
                            await asyncio.sleep(3)
                        
                        if retries == 4:
                            _log(f"  !! [{page_num + 1}페이지] 재시도 초과. 건너뜁니다.")
                            return []
                
                if not problem_numbers:
                    _log(f"  -> [{page_num + 1}페이지] 유효 문항 없음.")
                    return []

                _log(f"  -> [{page_num + 1}페이지] {len(problem_numbers)}개 문항 발견: {problem_numbers}")

                # 3. 개별 문항 병렬 추출 (이미지 공유)
                tasks = []
                for idx, q_num in enumerate(problem_numbers):
                    tasks.append(self._extract_single_problem(q_num, sample_file, extract_semaphore, _log))
                
                page_results = await asyncio.gather(*tasks)
                
                # 업로드된 파일 삭제 (필수)
                await asyncio.to_thread(sample_file.delete)
                
                return [r for r in page_results if r]

            except Exception as e:
                _log(f"  !! [{page_num + 1}페이지] 치명적 오류: {e}")
                return []
            finally:
                if os.path.exists(padded_img_path):
                    try:
                        os.remove(padded_img_path)
                    except OSError:
                        pass

        # 모든 페이지 순차적 간격을 두고 동시 시작 (세마포어가 1개라서 어차피 1장씩 처리됨)
        all_page_tasks = [_process_page_inner(i) for i in range(total_pages)]
        pages_results = await asyncio.gather(*all_page_tasks)
        
        for p_res in pages_results:
            all_problems.extend(p_res)

        if generate_variants and all_problems:
            _log("\n🤖 [변형 문항 생성] 각 추출된 원본 문항당 3개의 변형 문항 추가 생성을 병렬로 시작합니다...")
            variant_tasks = []
            for p in all_problems.copy():
                for v_idx in range(1, 4):
                    variant_tasks.append(self._generate_single_variant(p, v_idx, variant_difficulty, extract_semaphore, _log))
            
            if variant_tasks:
                var_results = await asyncio.gather(*variant_tasks)
                for var_res in var_results:
                    if var_res:
                        all_problems.append(var_res)

        # 최종 정렬
        all_problems.sort(key=self._natural_sort_key)
        _log(f"\n✅ 분석 완료! 총 {len(all_problems)}개 문항 추출 및 정렬됨.")
        return all_problems

    async def _extract_single_problem(self, q_num, sample_file, extract_semaphore, log_fn):
        async with extract_semaphore:
            retries = 0
            while retries < 4:
                try:
                    log_fn(f"    [문항 {q_num}] 병렬 추출 시작... (시도 {retries + 1}/4)")
                    
                    if "고1" in self.curriculum:
                        level_instr = "🚨[제한 사항] 모든 풀이 방식은 반드시 '고등학교 1학년(고1) 공통수학' 수준 내에서만 해결해야 합니다. 절대로 고2/고3 수학(수1, 수2, 미적분, 확통 등)의 선행 개념을 사용하지 마세요. (상용로그 특성, 지수/로그함수, 삼각함수, 미분, 적분 절대 금지 및 로피탈, 외적 등 교과 외 과정 금지). 특히 복소수 거듭제곱 문제 등에서 극좌표계 변환이나 삼각함수(sin, cos), 오일러 공식을 절대로 쓰지 마세요! 오직 (1+i)^2=2i 와 같이 순수 대수적으로 직접 제곱하여 주기성을 찾는 고1 방식만 사용해야 합니다."
                    else:
                        level_instr = "모든 풀이 방식은 '고등학교 2학년/3학년(수1, 수2, 선택과목)' 수준 내에서 해결하세요. 단, 극좌표계, 로피탈의 정리, 대학교 전공 수학 개념은 절대 금지합니다."
                        
                    instr = f"해설을 너무 길게 작성하지 마십시오. 반드시 3~4단계 이내로 설명하고 전체 텍스트를 500자 내부로 제한하세요. 모델 내부의 '사고/생각(thought)' 과정을 길게 만들면 에러가 발생하므로 직관적이고 즉각적인 풀이만 출력해야 합니다. 오직 고난이도 문제에서만 연산 과정을 약간 상세히 적으세요. {level_instr}"
                    if retries > 0:
                        instr = "!!초긴급 압축 모드!! 설명은 생략하고 핵심 수식 1줄만 [[EQUATION:...]] 형태로 작성."
                    if retries > 1:
                        instr = "최소한의 텍스트만 출력하세요. 해설은 1문장 이내로 끝내세요."

                    prompt = f"""당신은 수학 해설 타이핑 전문가입니다.
첨부된 이미지에서 **오직 '{q_num}' 문제 딱 하나만** 찾아서, 아래 JSON 구조로 완벽하게 해설을 작성해 주세요.
[
  {{
    "question_num": "{q_num}",
    "question": "문제 본문 전체 텍스트 (조건, 구하는 값 등)",
    "answer_options": ["① 1", "② 2"],
    "explanation": "이곳에 문제에 대한 상세한 해설을 오직 '문자열'로 작성하세요. (객체나 배열 불가)"
  }}
]

[핵심 규칙]
- 🚨 **[가장 중요한 초정밀 전사 원칙] 원본 이미지에 있는 수식을 전사할 때 단 하나의 글자, 숫자, 기호, 괄호 등도 절대 누락하거나 임의로 축약/변경하지 마세요. (예: `{{g(x) - x}}^3` 을 `{{g(x)}}^3` 으로 마음대로 생략/요약하면 절대 안 됩니다. 눈에 보이는 픽셀 그대로 100% 똑같이 부활시키세요.)**
- 🚨 **[문항 본문(`question`) 100% 거울 복사 원칙 - 절대 오역/창작 금지]** 🚨
  AI가 임의로 문제를 '해석'하거나 '요약'하거나 '변수를 바꾸거나(예: t를 c로)', '없는 기호(예: 적분)를 추가'하는 행위를 묻지도 따지지도 말고 절대 금지합니다.
  `question` 필드는 반드시 이미지에 적힌 글자와 수식 그대로, 토씨 하나 틀리지 않고 100% 완벽하게 똑같이 타이핑하세요.
- 🚨 **[해설 작성 특별 지시사항]** 🚨
  {instr}
- `{q_num}` 문항의 모든 내용(딸린 소문항 포함)을 작성하세요.
- 보기(answer_options) 배열 안에 포함되는 모든 숫자, 변수, 기호, 수식 등은 반드시 `[[EQUATION:...]]` 태그로 감싸야 합니다!
- 문자열 안의 따옴표(")는 이스케이프(`\\"`) 처리하십시오.
- 역슬래시 에스케이핑 문제가 생기지 않도록 `\\\\alpha` 와 같이 백슬래시를 이스케이프 하십시오.
- 해설(explanation) 작성 시 반드시 다음 [해설 서식 규칙]을 100% 준수하세요:
  1. 절대로 본문 맨 앞에 '[해설]'이라는 단어를 쓰지 마세요.
  2. "1단계 다항식의 인수분해" 같은 단계별 소제목이나 번호는 절대 달지 마세요.
  3. 줄글이나 산문으로 빽빽하게 설명하지 말고, 수식 전개 단계를 기준으로 "문단 바꿈(엔터)"을 하여 시원시원하게 읽히도록 작성하세요. 
  4. 수식을 중심으로 간결한 코멘트 형식의 문장을 다세요.
     [올바른 작성 예시]
     [[EQUATION:(x+y)^2]] 를 전개하면
     [[EQUATION:x^2+2xy+y^2=3]] 으로 정리됨을 알 수 있다.
     [[EQUATION:x=1]] 을 대입하면
     [[EQUATION:1^2+2y+y^2=3]]
  5. 절대로 굵은 글씨를 뜻하는 마크다운 기호 `**`를 사용하지 마세요. (예: `**상수 값 구하기**` -> `상수 값 구하기`)
  6. 조건제시법(집합) 표현 시 반드시 `\\left\\{{ x \\mid f(x) \\right\\}}` 형태로 작성하세요. 단순 `|` 기호나 괄호 누락은 절대 금지합니다.
  7. n제곱근 작성 시 반드시 `\\sqrt[n]{{x}}` 형태를 사용하세요.
  8. 🚨 [매우 중요] 해설의 모든 문장은 반드시 한국 초중고 수학 해설지의 표준 어투인 '해라체(-다, -이다, -한다)'를 사용해야 합니다. 절대로 존댓말('해요체(-요)', '합쇼체(-습니다)')을 쓰지 마세요!
  9. 해설의 맨 마지막 문장은 반드시 "따라서 정답은 [최종답안]이다." 형태로 새 줄에 끝맺어야 합니다. 객관식 기호나 수식을 [최종답안] 괄호 없이 안에 넣어주세요. (단답형 예: "따라서 정답은 [[EQUATION:5\\sqrt{2}]]이다.")
  9. [난이도별 서술 탄력성] 문제의 난이도에 맞춰 해설의 깊이를 조절하세요. 쉬운 문제는 '동류항을 계산하면', '양변을 x로 제하면' 같은 뻔한 서술을 완전히 생략하고 핵심 수식만 짧게 이어가세요.
[수식 포맷팅 (매우 중요)]
- 모든 수학 수식, 변수, 숫자, 기호는 절대 일반 텍스트로 쓰지 말고, 반드시 아래의 특수 테그 형식으로 감싸야 합니다.
  [[EQUATION:수식]]
- 🚨 **[초비상 규정] 명심하세요! 숫자 하나(예: 1, 2, 0, 3)나 단순 알파벳 변수(예: a, x, y, f)가 나오는 아주 짧고 사소한 순간조차도 무조건 [[EQUATION:1]], [[EQUATION:x]] 처럼 예외 없이 감싸야 합니다.** (예: "[[EQUATION:x]]의 값은 [[EQUATION:3]]이다.") 텍스트로 숫자를 그대로 노출하는 것은 치명적인 오류입니다.
- 🚨 절대 `$수식$`, `$$수식$$`, `\\(수식\\)`, `\\[수식\\]` 같은 마크다운 수식 래퍼를 사용하지 마세요!!! 무조건 `[[EQUATION:수식]]` 형태로만 감싸야 합니다.
- 🚨 **[문항 본문 특별 주의]** `question` 필드에 들어가는 문제의 원문 텍스트 내에서도 수식, 숫자, 변수는 예외 없이 `[[EQUATION:...]]` 태그로 감싸야 합니다. 절대 평문으로 방치하지 마세요. (예: `[[EQUATION:f(x)=x^2-2x+2]]의 그래프와...`)
- 🚨 **괄호가 복잡하게 얽힌 수식(예: `\\\\left\\\\{{ \\\\left( \\\\dots \\\\right) \\\\right\\\\}}^2`)이나 길이가 긴 다항식, 분수식 등도 중간에 끊지 말고 통째로 `[[EQUATION:...]]` 단 하나로 완벽하게 감싸야 합니다. 긴 수식을 절대로 텍스트 공간에 방치하지 마세요.**
- 🚨 절대로 "x가 1보다 크다" 라고 텍스트로 적지 마세요. 무조건 "[[EQUATION:x > 1]]이다" 라고 적어야 합니다.
- 수식 블록 안에서 백슬래시(\\)를 사용할 때 이스케이프 문제가 생기지 않도록 `\\\\alpha` 와 같이 백슬래시를 이스케이프 하십시오.
- 다항식 지수 표기 시 절대 주의: `x^{{2}}+x+1` 처럼 지수 부분만 정확히 적용해야 하며, 절대로 뒤의 수식까지 묶어서 올려버리지 마세요!
- 🚨 **[분수 및 괄호 수식 절대 규칙 - 필수]** 🚨
  절대로 수식 안에 `LEFT {{ ... RIGHT` 혹은 `... over ...` 같은 한글 수식 편집기 고유 문법을 임의로 상상해서 쓰지 마세요!!! 
  분수는 반드시 표준 LaTeX인 `\\\\frac{{분자}}{{분모}}` 형태로만 작성해야 합니다. (예: `\\\\frac{{5}}{{4}}`)
  연립방정식 등도 `\\\\begin{{cases}} ... \\\\end{{cases}}` 등 표준 LaTeX 문법만 사용하세요."""


                    # Google Generative AI SDK (원본) 복구
                    # gemini-3-flash-preview 등 추론형(Thinking) 모델은 내부적으로 거대한 |thought| 블록을 생성하므로 
                    # 출력 토큰을 최대치(65536)로 개방해야 잘림 현상(MAX_TOKENS)이 발생하지 않습니다.
                    resp = await self.model.generate_content_async(
                        [sample_file, prompt], 
                        generation_config=genai.types.GenerationConfig(
                            temperature=0.1,
                            max_output_tokens=65536
                        )
                    )
                    
                    raw_text = getattr(resp, 'text', '')
                    finish_reason = resp.candidates[0].finish_reason.name if hasattr(resp, 'candidates') and resp.candidates else 'UNKNOWN'
                    
                    text = self._sanitize_json(raw_text)
                    extracted = None
                    
                    # 1차 시도: 전체를 안전 범위로 잡아 파싱 시도 (단일 객체일 수 있음)
                    try:
                        # 정규화된 text가 [ { ... } ] 형태거나 단일 { ... } 형태일 수 있음
                        first_idx = text.find('{')
                        last_idx = text.rfind('}')
                        if first_idx != -1 and last_idx != -1:
                            clean_candidate = text[first_idx:last_idx+1]
                            # JSON의 문자열 안에서 개행이 섞여 있을 때를 대비해 strict=False
                            parsed_obj = json.loads(clean_candidate, strict=False)
                            extracted = [parsed_obj]
                    except:
                        pass
                        
                    # 2차 시도: 정규식 기반 자체 파서
                    if not extracted:
                        extracted = self._extract_json_objects(text)
                        
                    if extracted:
                        obj = extracted[0]
                        # --- 방어적 키 매핑 및 기본값 채우기 ---
                        # 1. 문제 본문 (question)
                        if 'question' not in obj:
                            obj['question'] = obj.pop('text', obj.pop('problem', obj.pop('content', '')))
                        
                        # 2. 문제 번호 (question_num)
                        if 'question_num' not in obj:
                            obj['question_num'] = obj.pop('number', obj.pop('id', q_num))
                        
                        # 3. 선택지 (answer_options)
                        if 'answer_options' not in obj:
                            obj['answer_options'] = obj.pop('options', obj.pop('choices', []))
                        
                        # 4. 해설 (explanation)
                        if 'explanation' not in obj:
                            obj['explanation'] = obj.pop('expl', obj.pop('desc', ''))

                        # 최종 보정: 핵심 키가 여전히 비어있다면 기본값 할당
                        if not obj.get('question'): obj['question'] = f"({q_num}번 문항 본문 추출 실패)"
                        if not isinstance(obj['answer_options'], list): obj['answer_options'] = []
                        
                        log_fn(f"    [문항 {q_num}] ✅ 추출 완료!")
                        return obj
                    
                    retries += 1
                    if retries == 4:
                        log_fn(f"    [문항 {q_num}] ❌ 추출 실패 (최종): JSON 파싱 불가 또는 토큰 제한 도달 (Finish Reason: {finish_reason})")
                    else:
                        # 토큰 제한(MAX_TOKENS) 거부 시 로깅 및 짧은 대기 추가
                        if "max_tokens" in finish_reason.lower():
                            try:
                                with open("debug_max_tokens_raw.txt", "a", encoding="utf-8") as raw_f:
                                    raw_f.write(f"\n\n--- [MAX_TOKENS DUMP - Q{q_num} | 기도 {retries}/4] ---\n")
                                    raw_f.write(raw_text)
                            except Exception:
                                pass
                                
                            wait_time = (retries + 1) * 5 # 5s, 10s, 15s, 20s
                            log_fn(f"    [문항 {q_num}] ⚠️ 토큰 제한(MAX_TOKENS) 도달. {wait_time}초 대기 후 재시도... ({retries}/4)")
                            await asyncio.sleep(wait_time)
                        else:
                            log_fn(f"    [문항 {q_num}] ⚠️ 파싱 실패 (시도 {retries}/4). Finish Reason: {finish_reason}")
                            await asyncio.sleep(2) # 일반 파싱 실패 시 짧은 대기
                except Exception as e:
                    retries += 1
                    err_str = str(e).lower()
                    if retries == 4:
                        log_fn(f"    [문항 {q_num}] ❌ 추출 실패 (최종): {str(e)[:50]}...")
                    else:
                        if "429" in err_str or "quota" in err_str or "exhausted" in err_str:
                            wait_time = retries * 15  # 15, 30, 45, 60s
                            log_fn(f"    [문항 {q_num}] ⏳ API 할당량 초과(429). {wait_time}초 대기 중... ({retries}/4)")
                            await asyncio.sleep(wait_time)
                        else:
                            log_fn(f"    [문항 {q_num}] ⚠️ 예외 발생 (시도 {retries}/4): {str(e)[:50]}...")
                            await asyncio.sleep(2)
            return None

    def _parse_list(self, text):
        try:
            start = text.find('[')
            end = text.rfind(']')
            if start != -1 and end != -1:
                return json.loads(text[start:end+1])
        except: pass
        return None

    def _sanitize_json(self, text):
        first = text.find('[')
        last = text.rfind(']')
        if first != -1 and last != -1:
            text = text[first:last+1]
        
        kw_regex = r'(?<!\\)\\(times|tan|rightarrow|Rightarrow|rho|frac|beta|bar|nabla|neq|ni|theta|tau|varphi|phi|pi|psi|nu|mu|lambda|kappa|iota|eta|zeta|epsilon|delta|gamma|alpha|omega|chi|upsilon|sigma|xi|Theta|Phi|Pi|Psi|Lambda|Delta|Gamma|Omega|Sigma|Xi|Upsilon|cdot|sqrt|left|right|sum|prod|int|oint|lim|infty|approx|equiv|propto|sim|simeq|asymp|doteq|implies)'
        text = re.sub(kw_regex, r'\\\\\1', text)
        text = re.sub(r'(?<!\\)\\([^"\\/bfnrtu])', r'\\\\\1', text)
        text = text.replace('\r', '')
        return text

    def _extract_json_objects(self, text):
        objects = []
        pattern = re.compile(r'\{\s*"(question|number|question_num)"')
        start_indices = [match.start() for match in pattern.finditer(text)]
        
        for start_idx in start_indices:
            brace_count = 0
            in_string = False
            escape = False
            candidate = None
            
            for i in range(start_idx, len(text)):
                char = text[i]
                if not in_string:
                    if char == '{': brace_count += 1
                    elif char == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            candidate = text[start_idx:i+1]
                            try:
                                cand_clean = re.sub(r'[\x00-\x19]', '', candidate)
                                objects.append(json.loads(cand_clean, strict=False))
                                break
                            except: pass
                    elif char == '"': in_string = True
                else:
                    if escape: escape = False
                    elif char == '\\': escape = True
                    elif char == '"': in_string = False
        return objects

    def _natural_sort_key(self, problem):
        q_num_str = str(problem.get("question_num", ""))
        if not q_num_str:
            return (99, 999999) # 번호가 없으면 맨 뒤로
            
        # 서답/서술/단답형 식별
        is_essay = any(keyword in q_num_str for keyword in ["서답", "서술", "단답", "주관"])
        group = 2 if is_essay else 1
            
        # 문자열 안에서 숫자만 추출
        digits = re.findall(r'\d+', q_num_str)
        num_val = int(digits[0]) if digits else 999999
        
        # 변형 문항 여부 및 서브 번호 식별
        is_variant = "변형" in q_num_str
        sub_val = int(digits[-1]) if is_variant and len(digits) > 1 else 0
                
        return (group, num_val, 1 if is_variant else 0, sub_val)

    async def _generate_single_variant(self, original_obj: Dict, variant_idx: int, difficulty: str, extract_semaphore, log_fn):
        q_num = original_obj.get('question_num', '')
        var_q_num = f"{q_num}-변형{variant_idx}"
        
        # 난이도 문자열 파싱
        diff_level = 1
        if "2단계" in difficulty: diff_level = 2
        elif "3단계" in difficulty: diff_level = 3
        
        async with extract_semaphore:
            retries = 0
            while retries < 4:
                try:
                    if retries == 0:
                        log_fn(f"    [{var_q_num}] 병렬 생성 시작 (난이도 {diff_level}단계)...")
                    else:
                        log_fn(f"    [{var_q_num}] 병렬 생성 재시도 ({retries}/4)...")
                        
                    # 공통 지시사항
                    base_prompt = f"""당신은 수학 문제 출제 및 변형 전문가입니다.
아래 제공된 '원본 수학 문제'와 그 해설을 완벽하게 분석하여, 새로운 '변형 문제' 1개를 만들어주세요.

[원본 문제]
{original_obj.get('question', '')}

[원본 해설]
{original_obj.get('explanation', '')}

[새로 생성할 변형 문제 규칙]
1. 변형 문제에 대한 해설도 원본 해설과 유사한 스텝으로 제공해야 합니다.
2. 출력은 반드시 아래 형태의 단일 JSON 객체를 포함하는 배열이어야 합니다.
[
  {{
    "question_num": "{var_q_num}",
    "question": "출제한 변형 문제 본문",
    "answer_options": ["① 1", "② 2"],
    "explanation": "해당 변형 문제에 대한 매우 간결한 해설"
  }}
]

[수식 포맷팅 (매우 중요)]
- 모든 수학 수식, 변수, 숫자, 기호는 절대 일반 텍스트로 쓰지 말고, 반드시 아래의 특수 테그 형식으로 감싸야 합니다.
  [[EQUATION:수식]]
- 🚨 **[초비상 규정] 명심하세요! 숫자 하나(예: 1, 2, 0, 3)나 단순 알파벳 변수(예: a, x, y, f)가 나오는 아주 짧고 사소한 순간조차도 무조건 [[EQUATION:1]], [[EQUATION:x]] 처럼 예외 없이 감싸야 합니다.** (예: "[[EQUATION:x]]의 값은 [[EQUATION:3]]이다.") 텍스트로 숫자를 그대로 노출하는 것은 치명적인 오류입니다.
- 🚨 절대 `$수식$`, `$$수식$$`, `\\(수식\\)`, `\\[수식\\]` 같은 마크다운 수식 래퍼를 사용하지 마세요!!! 무조건 `[[EQUATION:수식]]` 형태로만 감싸야 합니다.
- 🚨 **[문항 본문 특별 주의]** `question` 필드에 들어가는 문제의 원문 텍스트 내에서도 수식, 숫자, 변수는 예외 없이 `[[EQUATION:...]]` 태그로 감싸야 합니다. 절대 평문으로 방치하지 마세요. (예: `[[EQUATION:f(x)=x^2-2x+2]]의 그래프와...`)
- 🚨 **괄호가 복잡하게 얽힌 수식(예: `\\\\left\\\\{{ \\\\left( \\\\dots \\\\right) \\\\right\\\\}}^2`)이나 길이가 긴 다항식, 분수식 등도 중간에 끊지 말고 통째로 `[[EQUATION:...]]` 단 하나로 완벽하게 감싸야 합니다. 긴 수식을 절대로 텍스트 공간에 방치하지 마세요.**
- 🚨 절대로 "x가 1보다 크다" 라고 텍스트로 적지 마세요. 무조건 "[[EQUATION:x > 1]]이다" 라고 적어야 합니다.
- 🚨 **[백슬래시 이스케이프 절대 규칙]** JSON 안에서 백슬래시(\\)를 사용할 때는 반드시 이중 백슬래시(\\\\\\\\)로 이스케이프 해야 합니다. (예: [[EQUATION:\\\\alpha + \\\\beta]]) 이스케이프하지 않으면 크래시가 발생합니다!
- 다항식 지수 표기 시 절대 주의: `x^{{2}}+x+1` 처럼 지수 부분만 정확히 적용해야 하며, 절대로 뒤의 수식까지 묶어서 올려버리지 마세요!
- 🚨 **[분수 및 괄호 수식 절대 규칙 - 필수]** 🚨
  절대로 수식 안에 `LEFT {{ ... RIGHT` 혹은 `... over ...` 같은 한글 수식 편집기 고유 문법을 임의로 상상해서 쓰지 마세요!!! 
  분수는 반드시 표준 LaTeX인 `\\\\frac{{분자}}{{분모}}` 형태로만 작성해야 합니다.
  연립방정식 등도 `\\\\begin{{cases}} ... \\\\end{{cases}}` 등 표준 LaTeX 문법만 사용하세요.
해설 텍스트 길이는 400자 이내로 핵심만 간결하게 설명하고 깊은 내부 추론(thought 등)을 피하세요.
"""

                    # 난이도별 변형 지시사항 분기
                    if diff_level == 1:
                        diff_instruction = """
[변형 양상: 1단계 하 - 단순 숫자/기호 변형]
원본 문제의 구조, 묻는 방식, 출제 의도를 100% 동일하게 유지하십시오.
단순히 주어진 식의 계수, 상수항, 부호, 도형의 기본 길이 등만 '계산이 깔끔하게 떨어지도록' 살짝 변경하여, 원본 문제를 풀어본 학생이 똑같은 기계적 방법으로 바로 풀 수 있는 쌍둥이 문제를 만드세요."""
                    elif diff_level == 2:
                        diff_instruction = """
[변형 양상: 2단계 중 - 모의고사 스타일 응용]
원본 문제의 핵심 '수학적 원리'는 유지하되 문제의 '외형'과 '조건 방향'을 바꾸십시오.
예를 들어, 
1) 원본에서 원인(조건)을 주고 결과(최대값)를 물었다면, 결과를 조건으로 주고 원인(a, b값)을 묻는 역구조로 변형하세요.
2) 묻는 방식을 직접적으로 주지 않고, 조건제시법이나 그래프의 특징 등 한 단계 해석을 거치도록 포장하세요.
3) 계산 과정이 원본보다 한 스텝 더 길어지도록 식의 차수를 올리거나 조건을 하나 더 추가하세요."""
                    else:
                        diff_instruction = """
[변형 양상: 3단계 상 - 심화 고난도 융합]
상위권을 위한 창의적이고 까다로운 최고난도 문제를 출제하십시오. 원본 문제의 코어 수학 개념 '단 하나'만 남기고 완전히 새로운 상황으로 재창조하세요.
1) 다른 단원의 개념(예: 방정식 + 도형 융합, 집합 + 함수 융합)을 강력하게 결합하세요.
2) 원본이 단순 대수 문제였다면, 실생활 활용 문제나 기하학적 의미를 묻는 문제로 둔갑시키십시오.
3) 케이스 분류(경우의 수 나누기)가 들어가도록 조건을 모호하거나 넓게 주어서 학생의 사고력을 깊게 요구하세요.
(주의: 풀이 아이디어는 어렵게 짜되, 해설지의 텍스트 길이는 여전히 짧고 타격감 있게 요약해야 에러가 나지 않습니다.)"""

                    prompt = base_prompt + diff_instruction

                    resp = await self.model.generate_content_async(
                        prompt, 
                        generation_config=genai.types.GenerationConfig(
                            temperature=0.7,
                            max_output_tokens=65536
                        )
                    )
                    
                    raw_text = getattr(resp, 'text', '')
                    finish_reason = resp.candidates[0].finish_reason.name if hasattr(resp, 'candidates') and resp.candidates else 'UNKNOWN'
                    
                    text = self._sanitize_json(raw_text)
                    extracted = None
                    
                    # 1차 시도
                    try:
                        first_idx = text.find('{')
                        last_idx = text.rfind('}')
                        if first_idx != -1 and last_idx != -1:
                            clean_candidate = text[first_idx:last_idx+1]
                            parsed_obj = json.loads(clean_candidate, strict=False)
                            extracted = [parsed_obj]
                    except: pass
                        
                    # 2차 시도
                    if not extracted:
                        extracted = self._extract_json_objects(text)
                        
                    if extracted:
                        obj = extracted[0]
                        if 'question' not in obj: obj['question'] = obj.pop('text', obj.pop('problem', obj.pop('content', '')))
                        if 'question_num' not in obj: obj['question_num'] = obj.pop('number', obj.pop('id', var_q_num))
                        if 'answer_options' not in obj: obj['answer_options'] = obj.pop('options', obj.pop('choices', []))
                        if 'explanation' not in obj: obj['explanation'] = obj.pop('expl', obj.pop('desc', ''))

                        if not obj.get('question'): obj['question'] = f"({var_q_num} 문항 본문 생성 실패)"
                        if not isinstance(obj['answer_options'], list): obj['answer_options'] = []
                        
                        log_fn(f"    [{var_q_num}] ✅ 문항 생성 완료!")
                        return obj
                        
                    retries += 1
                    if retries == 4:
                        log_fn(f"    [{var_q_num}] ❌ 생성 실패 (최종): JSON 파싱 불가 (Finish Reason: {finish_reason})")
                    else:
                        if "max_tokens" in finish_reason.lower():
                            wait_time = (retries + 1) * 5
                            log_fn(f"    [{var_q_num}] ⚠️ 토큰 제한 도달. {wait_time}초 대기 후 재시도... ({retries}/4)")
                            await asyncio.sleep(wait_time)
                        else:
                            log_fn(f"    [{var_q_num}] ⚠️ 파싱 실패. 2초 대기 후 재시도... ({retries}/4)")
                            await asyncio.sleep(2)
                except Exception as e:
                    retries += 1
                    err_str = str(e).lower()
                    if retries == 4:
                        log_fn(f"    [{var_q_num}] ❌ 생성 실패 (최종): {str(e)[:50]}...")
                    else:
                        if "429" in err_str or "quota" in err_str:
                            wait_time = retries * 15
                            log_fn(f"    [{var_q_num}] ⏳ API 할당량 초과. {wait_time}초 대기... ({retries}/4)")
                            await asyncio.sleep(wait_time)
                        else:
                            log_fn(f"    [{var_q_num}] ⚠️ 오류. 2초 대기... ({retries}/4)")
                            await asyncio.sleep(2)
            return None
