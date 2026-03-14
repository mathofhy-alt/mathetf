import os
import asyncio
import datetime
from typing import List, Dict, Optional, Callable
import json
import re
import fitz
import tempfile
import time
from PIL import Image
import urllib.request
import urllib.error
import base64

class OpenAIMathParser:
    def __init__(self, api_key: str, model_name: str, curriculum: str = "고1 수준 (공통수학)"):
        self.api_key = api_key
        self.model_name = model_name
        self.curriculum = curriculum
        
        # Map user's UI selection to actual OpenAI model IDs
        self.actual_model = model_name
        if model_name == "o3": self.actual_model = "o3-mini"
        elif model_name == "gpt5.2": self.actual_model = "gpt-4o"
        elif model_name == "o4mini": self.actual_model = "gpt-4o-mini"
        
    async def extract_math_problems(self, pdf_path: str, log_callback: Optional[Callable[[str], None]] = None) -> List[Dict]:
        """
        [고속 분석 엔진 V2 - OpenAI 연동 버전]
        """
        all_problems = []
        
        def _log(msg):
            print(msg)
            if log_callback:
                log_callback(msg)

        doc = fitz.open(pdf_path)
        total_pages = len(doc)

        # OpenAI Rate Limits 고려: 비전(Vision) 요청의 막대한 토큰 사이즈로 인해
        # Tier 3라 할지라도 순간적인 동시 다발적 요청은 TPM(Tokens Per Minute) 제한에 걸립니다.
        # 따라서 동시 처리 수를 10에서 3으로 대폭 하향 조정합니다.
        extract_semaphore = asyncio.Semaphore(3)

        async def _call_openai_api(prompt: str, base64_image: str = None, retries: int = 0, is_discovery=False, **kwargs):
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}"
            }
            
            content = [{"type": "text", "text": prompt}]
            if base64_image:
                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{base64_image}",
                        "detail": "high" if is_discovery else "auto"
                    }
                })
                
            # 사용자 지정 모델 할당
            api_model = kwargs.get("force_model", self.actual_model)
            
            # 비전(Vision)이 필요한데 o3/o1 등 추론 전용 모델이 선택된 경우에만 gpt-4o로 폴백
            if base64_image and not kwargs.get("force_model"):
                if "o3" in api_model.lower() or "o1" in api_model.lower():
                    api_model = "gpt-4o"
            
            data = {
                "model": api_model,
                "messages": [
                    {
                        "role": "user",
                        "content": content
                    }
                ]
            }
            
            # o1, o3-mini doesn't support temperature
            if "o3" in api_model or "o1" in api_model:
                data["max_completion_tokens"] = 4000
            else:
                data["temperature"] = 0.1
                data["max_tokens"] = 3000
                
            json_data = json.dumps(data).encode('utf-8')
            req = urllib.request.Request(url, data=json_data, headers=headers, method="POST")
            
            def _make_req():
                try:
                    with urllib.request.urlopen(req) as response:
                        return json.loads(response.read().decode('utf-8'))
                except urllib.error.HTTPError as e:
                    err_msg = e.read().decode('utf-8')
                    raise Exception(f"HTTP {e.code}: {err_msg}")
                    
            return await asyncio.to_thread(_make_req)

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
            
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                padded_img_path = tmp.name
                
            padded_img.save(padded_img_path)
            
            try:
                # 1. 파일을 Base64로 인코딩
                with open(padded_img_path, "rb") as f:
                    base64_img = base64.b64encode(f.read()).decode('utf-8')
                
                # 2. Discovery (문제 번호 찾기)
                discovery_prompt = """시험지 이미지 전체를 샅샅이 스캔하여 존재하는 모든 독립된 '메인 문제 번호'를 하나도 빠짐없이 찾아 오직 파이썬 리스트 형식으로만 응답하세요.
(예: ["1", "2", "3", "서술형 1"]) 
[🚨 초엄격 규칙 - 위반 시 치명적 오류 발생 🚨]
1. 맨 밑이나 맨 위에 적힌 '페이지 번호(예: 1, 2, 3...)' 등 본문이 아닌 숫자는 절대 문항 번호로 추출하지 마십시오!
2. (1), (2), ①, ② 같은 소문항이나 객관식 보기 번호는 절대 포함하지 마십시오.
3. 문제가 실질적으로 시작되는 큰 굵은 글씨의 메인 번호만 찾으십시오.
4. 1., 2., 3. 처럼 점이 찍힌 번호라도 "1", "2", "3"으로 깔끔하게 리스트 정수로 만드세요."""
                
                retries = 0
                problem_numbers = []
                while retries < 4:
                    try:
                        resp = await _call_openai_api(discovery_prompt, base64_image=base64_img, is_discovery=True)
                        resp_text = resp['choices'][0]['message']['content']
                        problem_numbers = self._parse_list(resp_text)
                        if problem_numbers:
                           # Clean whitespace/dots
                           problem_numbers = [str(x).replace(".", "").strip() for x in problem_numbers if str(x).strip()]
                           
                           # Deduplication in case the model hallucinates the same number multiple times within the same list
                           seen = set()
                           problem_numbers = [x for x in problem_numbers if not (x in seen or seen.add(x))]
                           break
                        else:
                           raise ValueError("Empty array or parse failed during discovery")
                    except Exception as e:
                        retries += 1
                        err_str = str(e).lower()
                        if "429" in err_str or "quota" in err_str or "rate limits" in err_str:
                            wait_time = retries * 20
                            _log(f"  ⏳ [{page_num + 1}페이지] API 할당량/속도 초과(429). {wait_time}초 대기 후 재시도... ({retries}/4)")
                            await asyncio.sleep(wait_time)
                        else:
                            _log(f"  !! [{page_num + 1}페이지] Discovery 오류: {str(e)[:100]}...")
                            await asyncio.sleep(3)
                        
                        if retries == 4:
                            _log(f"  !! [{page_num + 1}페이지] 재시도 초과. 건너뜁니다.")
                            return []
                
                if not problem_numbers:
                    _log(f"  -> [{page_num + 1}페이지] 유효 문항 없음.")
                    return []

                _log(f"  -> [{page_num + 1}페이지] {len(problem_numbers)}개 문항 발견: {problem_numbers}")

                # 3. 개별 문항 병렬 추출
                tasks = []
                import random
                for idx, q_num in enumerate(problem_numbers):
                    # 순식간에 API 호출이 몰리지 않도록 약간의 시차(Jitter)를 둡니다.
                    jitter = idx * random.uniform(0.5, 1.5)
                    async def delayed_extract(q, j):
                        await asyncio.sleep(j)
                        return await self._extract_single_problem(q, base64_img, extract_semaphore, _log, _call_openai_api, self.actual_model)
                    tasks.append(delayed_extract(q_num, jitter))
                
                page_results = await asyncio.gather(*tasks)
                
                return [r for r in page_results if r]

            except Exception as e:
                _log(f"  !! [{page_num + 1}페이지] 치명적 오류: {str(e)[:100]}")
                return []
            finally:
                if os.path.exists(padded_img_path):
                    try:
                        os.remove(padded_img_path)
                    except OSError:
                        pass

        # 모든 페이지 동시 시작
        all_page_tasks = [_process_page_inner(i) for i in range(total_pages)]
        pages_results = await asyncio.gather(*all_page_tasks)
        
        # 페이지 간 동일 문항 번호 중복 추출 방지 (Deduplication)
        unique_problems = {}
        for p_res in pages_results:
            for obj in p_res:
                q_num_str = str(obj.get('question_num', '')).strip()
                # 이미 존재하는 번호면, 덮어쓰지 않고 최초 등장(가장 완벽한 원본 확률이 높음) 우선 유지
                if q_num_str not in unique_problems:
                    unique_problems[q_num_str] = obj
                    
        all_problems = list(unique_problems.values())

        # 최종 정렬
        all_problems.sort(key=self._natural_sort_key)
        _log(f"\n✅ 분석 완료! 총 {len(all_problems)}개 문항 추출 및 정렬됨 (중복 제거됨).")
        return all_problems

    async def _extract_single_problem(self, q_num, base64_img, extract_semaphore, log_fn, call_api_fn, actual_model):
        async with extract_semaphore:
            retries = 0
            while retries < 4:
                try:
                    log_fn(f"    [문항 {q_num}] 병렬 추출 시작... (시도 {retries + 1}/4)")
                    
                    if "고1" in self.curriculum:
                        level_instr = "🚨[제한 사항] 모든 풀이 방식은 반드시 '고등학교 1학년(고1) 공통수학' 수준 내에서만 해결해야 합니다. 절대로 고2/고3 수학(수1, 수2, 미적분, 확통 등)의 선행 개념을 사용하지 마세요. (상용로그 특성, 지수/로그함수, 삼각함수, 미분, 적분 절대 금지 및 로피탈, 외적 등 교과 외 과정 금지). 특히 복소수 거듭제곱 문제 등에서 극좌표계 변환이나 삼각함수(sin, cos), 오일러 공식을 절대로 쓰지 마세요! 오직 (1+i)^2=2i 와 같이 순수 대수적으로 직접 제곱하여 주기성을 찾는 고1 방식만 사용해야 합니다."
                    else:
                        level_instr = "모든 풀이 방식은 '고등학교 2학년/3학년(수1, 수2, 선택과목)' 수준 내에서 해결하세요. 단, 극좌표계, 로피탈의 정리, 대학교 전공 수학 개념은 절대 금지합니다."
                        
                    instr = f"전체 내용을 3~4단계(단계별 요약)로 구성하여 학생들이 이해하기 쉽도록 친절하고 논리적으로 설명하세요. 풀이 중간에 생략되는 과정이 없도록 상세히 풀어서 적어주세요. {level_instr}"
                    if retries > 0:
                        instr = "!!초긴급 압축 모드!! 설명은 생략하고 핵심 수식 1줄만 [[EQUATION:...]] 형태로 작성."

                    # ==========================================================
                    # [단계 1: gpt-4o를 이용한 초정밀 OCR (문제 및 보기 추출)]
                    # ==========================================================
                    ocr_prompt = f"""당신은 초정밀 수학 OCR 전문가입니다.
첨부된 이미지에서 **오직 '{q_num}' 문제 딱 하나만** 찾아서, 문제 본문과 보기(선택지)를 완벽하게 전사해 주세요.

[필수 출력 형식]
오직 1개의 JSON 객체만 배열로 감싸서 응답하세요. 마크다운(` ```json `) 블록을 쓰지 말고 오직 raw JSON 텍스트 배열만 반환하세요.
[
  {{
    "question_num": "{q_num}",
    "question": "문제 본문 전체 텍스트 (조건, 구하는 값 등)",
    "answer_options": ["① 1", "② 2"]
  }}
]

[핵심 규칙]
- 🚨 **[가장 중요한 초정밀 전사 원칙] 원본 이미지에 있는 수식을 전사할 때 절대 누락하거나 임의로 축약/변경하지 마세요.**
- 🚨 **[문항 본문(`question`) 100% 거울 복사 원칙 - 절대 오역/창작 금지]** 🚨
  AI가 임의로 문제를 '해석'하거나 '요약'하거나 '변수를 바꾸거나(예: t를 c로)', '없는 기호(예: 적분)를 추가'하는 행위를 절대 금지합니다.
  `question` 필드는 반드시 이미지에 적힌 글자와 수식 그대로, 토씨 하나 틀리지 않고 100% 완벽하게 똑같이 타이핑하세요.
- 보기(answer_options) 배열 안에 포함되는 모든 숫자, 변수, 기호, 수식 등은 반드시 `[[EQUATION:...]]` 태그로 감싸야 합니다!

[수식 포맷팅 (매우 중요)]
- 모든 수학 수식, 변수, 숫자, 기호는 반드시 아래의 태그 형식으로 감싸야 합니다.
  [[EQUATION:수식]]
- 숫자 하나나 단순 알파벳 변수도 무조건 감싸세요 (예: [[EQUATION:1]], [[EQUATION:x]])
- 🚨 절대 `$수식$`, `$$수식$$`, `\(수식\)`, `\[수식\]` 같은 마크다운 수식 래퍼를 사용하지 마세요!!! 무조건 `[[EQUATION:수식]]` 형태로만 감싸야 합니다.
- 🚨 **[문항 본문 특별 주의]** `question` 필드 안에서도 예외 없이 `[[EQUATION:...]]` 태그로 감싸야 합니다.
- 🚨 **[치명적 태그 오류 주의]** 태그를 임의로 변형하여 `[[EQUATION{{수식}}]]`, `[[EQUATION{{수식}}}}`, `[[EQUATION=수식]]` 따위로 괄호를 바꾸거나 기호를 누락하면 시스템이 붕괴됩니다! 반드시 열 때는 대괄호 두개와 콜론을 써서 `[[EQUATION:` 로 열고, 닫을 때는 대괄호 두개 `]]` 로 **정확하게** 닫아야 합니다.
- 분수는 반드시 표준 LaTeX인 `\\\\frac{{분자}}{{분모}}` 형태로만 작성해야 합니다.
- 🚨 **[구간별 함수 / 조건부 함수 특별 주의]** 중괄호 `{{` 로 묶여서 여러 줄로 나뉘는 함수(예: 구간별로 식이 다른 함수)는 절대 한 줄로 뭉개거나 이상한 기호로 나열하지 마세요!! 반드시 `\\begin{{cases}} 첫번째식 & 조건 \\\\ 두번째식 & 조건 \\end{{cases}}` 와 같은 올바른 강력한 LaTeX 조건문 문법을 사용하여 원래 형태와 동일하게 전사해야 합니다.
- 🚨 **[객관식 vs 주관식 처리 및 보기 누락 금지!!]** 
  - (1) **객관식인 경우:** 한국 수학 문제는 보통 보기가 5개(①~⑤)입니다. ⑤번 보기가 공간이 부족해 줄이 바뀌어 밑에 혼자 떨어져 있는 경우가 매우 많습니다. 대충 4번(④)까지만 읽고 중단하지 말고, 주변을 샅샅이 뒤져서 **반드시 ⑤번 보기까지 100% 찾아내어 5개의 배열을 완성**하세요!
  - (2) **주관식/서술형인 경우:** 이미지에 객관식 보기(①~⑤)가 아예 없다면, 절대다수의 보기를 스스로 지어내거나 창작(Hallucination)하지 마세요! 주관식 문제라면 `answer_options` 배열을 반드시 비워두세요 (`[]`)."""

                    ocr_resp = await call_api_fn(ocr_prompt, base64_image=base64_img, is_discovery=False)
                    ocr_text = self._sanitize_json(ocr_resp['choices'][0]['message']['content'])
                    ocr_extracted = self._extract_json_objects(ocr_text)
                    
                    if not ocr_extracted:
                        raise Exception("GPT-4o OCR failed to produce valid JSON.")
                        
                    ocr_obj = ocr_extracted[0]
                    import re
                    def force_equation_tags(text):
                        if not isinstance(text, str): return text
                        # 마크다운 수식 래퍼 강제 치환
                        text = re.sub(r'\\\(\s*(.*?)\s*\\\)', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
                        text = re.sub(r'\\\[\s*(.*?)\s*\\\]', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
                        text = re.sub(r'\$\$\s*(.*?)\s*\$\$', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
                        text = re.sub(r'\$\s*(.*?)\s*\$', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
                        
                        # AI 환각(Hallucination)으로 인한 잘못된 EQUATION 태그 구조 강제 복구
                        # 수식 내부에 중괄호가 없는 아주 단순한 변수들의 괄호 깨짐(예: [[EQUATION{t}}) 우선 복구
                        text = re.sub(r'\[\[EQUATION\{([^{}]+)\}\]\]', r'[[EQUATION:\1]]', text)
                        text = re.sub(r'\[\[EQUATION\{([^{}]+)\}\}', r'[[EQUATION:\1]]', text)
                        text = re.sub(r'\[\[EQUATION\{([^{}]+)\]\]', r'[[EQUATION:\1]]', text)
                        text = re.sub(r'\[\[EQUATION=([^{}]+)\]\]', r'[[EQUATION:\1]]', text)
                        text = re.sub(r'\[\[EQUATION:([^{}]+)\}\}', r'[[EQUATION:\1]]', text)
                        
                        return text

                    extracted_question = force_equation_tags(ocr_obj.get('question', ''))
                    extracted_options = [force_equation_tags(opt) for opt in ocr_obj.get('answer_options', [])]
                    
                    # ==========================================================
                    # [단계 2: 사용자가 선택한 모델(예: o3-mini)을 이용한 해설 생성]
                    # ==========================================================
                    reasoning_prompt = f"""당신은 수학 해설 타이핑 전문가입니다.
다음은 OCR로 완벽하게 전사된 문제 번호 {q_num}의 본문과 선택지입니다.

[문제 본문]
{extracted_question}

[선택지]
{str(extracted_options)}

위 문제를 풀이하고, 아래 JSON 구조로 완벽하게 해설을 작성해 주세요.
(기존에 넘겨받은 {q_num}, question, answer_options 는 그대로 유지하고 explanation 만 추가하세요)

[필수 출력 형식]
오직 1개의 JSON 객체만 배열로 감싸서 응답하세요. 마크다운(` ```json `) 블록을 쓰지 말고 오직 raw JSON 텍스트 배열만 반환하세요.
[
  {{
    "question_num": "{q_num}",
    "question": "{extracted_question.replace('"', '\\"') if extracted_question else ''}",
    "answer_options": {json.dumps(extracted_options, ensure_ascii=False) if extracted_options else '[]'},
    "explanation": "이곳에 문제에 대한 상세한 해설을 오직 '문자열'로 작성하세요."
  }}
]

[핵심 규칙]
- 🚨 **[해설 작성 특별 지시사항]** 🚨
  {instr}
- 문자열 안의 따옴표(")는 이스케이프(`\\"`) 처리하십시오. 역슬래시는 `\\\\alpha` 와 같이.
- 해설(explanation) 작성 시 반드시 다음 [해설 서식 규칙]을 100% 준수하세요:
  1. 절대로 본문 맨 앞에 '[해설]'이라는 단어를 쓰지 마세요.
  2. "1단계 다항식의 인수분해" 같은 단계별 소제목 달지 마세요.
  3. 시원시원하게 읽히도록 문단 바꿈을 하세요. 
  4. 수식을 중심으로 간결한 코멘트 형식의 문장을 다세요.
  5. 굵은 글씨(`**`) 사용 금지.
  6. 조건제시법(집합) 표현 시 반드시 `\\left\\{{ x \\mid f(x) \\right\\}}` 형태로 작성하세요.
  7. 🚨 [매우 중요] 해설의 모든 문장은 반드시 한국 초중고 수학 해설지의 표준 어투인 '해라체(-다, -이다, -한다)'를 사용해야 합니다. 절대로 존댓말('해요체(-요)', '합쇼체(-습니다)')을 쓰지 마세요!
  8. 해설의 맨 마지막 문장은 반드시 "따라서 정답은 [최종답안]이다." 형태로 작성하세요.

[수식 포맷팅 (매우 중요)]
- 해설 내의 모든 수학 수식, 변수, 숫자, 기호는 반드시 아래의 태그 형식으로 감싸야 합니다.
  [[EQUATION:수식]]
- 숫자 하나나 단순 알파벳 변수도 무조건 감싸세요 (예: [[EQUATION:1]], [[EQUATION:x]])
- 🚨 절대 `$수식$`, `$$수식$$`, `\(수식\)`, `\[수식\]` 같은 마크다운 수식 래퍼를 사용하지 마세요!!!
- 괄호가 복잡한 긴 수식도 통째로 묶으세요.
- 분수는 반드시 표준 LaTeX인 `\\\\frac{{분자}}{{분모}}` 형태로만 작성해야 합니다."""

                    reason_resp = await call_api_fn(reasoning_prompt, base64_image=None, is_discovery=False)
                    resp_text = reason_resp['choices'][0]['message']['content']
                    
                    text = self._sanitize_json(resp_text)
                    extracted = self._extract_json_objects(text)
                    if extracted:
                        obj = extracted[0]
                        if 'question' not in obj:
                            obj['question'] = obj.pop('text', obj.pop('problem', obj.pop('content', '')))
                        if 'question_num' not in obj:
                            obj['question_num'] = obj.pop('number', obj.pop('id', q_num))
                        if 'answer_options' not in obj:
                            obj['answer_options'] = obj.pop('options', obj.pop('choices', []))
                        if 'explanation' not in obj:
                            obj['explanation'] = obj.pop('expl', obj.pop('desc', ''))

                        if not obj.get('question'): obj['question'] = f"({q_num}번 문항 본문 추출 실패)"
                        if not isinstance(obj['answer_options'], list): obj['answer_options'] = []
                        
                        # 해설(explanation) 필드에도 환각 태그 자동 복구 적용
                        obj['explanation'] = force_equation_tags(obj.get('explanation', ''))
                        
                        log_fn(f"    [문항 {q_num}] ✅ 추출 완료!")
                        return obj
                    
                    retries += 1
                except Exception as e:
                    retries += 1
                    err_str = str(e).lower()
                    if retries == 4:
                        log_fn(f"    [문항 {q_num}] ❌ 추출 실패 (최종): {str(e)[:50]}...")
                    else:
                        if "429" in err_str or "quota" in err_str or "rate limits" in err_str:
                            wait_time = retries * 20
                            log_fn(f"      ⏳ [문항 {q_num}] API 할당량 초과(429). {wait_time}초 대기 후 재시도...")
                            await asyncio.sleep(wait_time)
                        else:
                            await asyncio.sleep(2)
            return None

    def _parse_list(self, text):
        try:
            start = text.find('[')
            end = text.rfind(']')
            if start != -1 and end != -1:
                return json.loads(text[start:end+1])
        except: pass
        return []

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
            return (99, 999999)
            
        is_essay = any(keyword in q_num_str for keyword in ["서답", "서술", "단답", "주관"])
        group = 2 if is_essay else 1
            
        digits = re.findall(r'\d+', q_num_str)
        num_val = int(digits[0]) if digits else 999999
                
        return (group, num_val)
