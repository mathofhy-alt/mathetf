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
import google.generativeai as genai

class OpenAIMathParser:
    def __init__(self, api_key: str, model_name: str, curriculum: str = "고1 수준 (공통수학)", gemini_api_key: str = ""):
        self.api_key = api_key
        self.model_name = model_name
        self.curriculum = curriculum
        self.gemini_api_key = gemini_api_key
        self.gemini_model = None
        
        if self.gemini_api_key:
            genai.configure(api_key=self.gemini_api_key)
            self.gemini_model = genai.GenerativeModel('gemini-3-flash-preview')
        
        # Map user's UI selection to actual OpenAI model IDs
        self.actual_model = model_name
        self.reasoning_model = model_name
        
        if model_name == "o3": 
            self.actual_model = "gpt-4o" # 초정밀 비전 추출은 항상 4o 폴백 (제미나이 없대비용)
            self.reasoning_model = "o3"
        elif model_name == "o3mini":
            self.actual_model = "gpt-4o"
            self.reasoning_model = "o3-mini"
            # AB 테스트를 위해 o3mini 선택 시 명시적으로 Gemini 비활성화 (gpt-4o 시력 사용)
            self.gemini_api_key = ""
            self.gemini_model = None
        elif model_name == "o1":
            self.actual_model = "gpt-4o"
            self.reasoning_model = "o1"
        elif model_name == "gpt5.2": 
            self.actual_model = "gpt-4o"
            self.reasoning_model = "gpt-4o"
        elif model_name == "gpt5.4pro": 
            self.actual_model = "gpt-4o" 
            self.reasoning_model = "gpt-5.4-pro" 
        elif model_name == "o4mini": 
            self.actual_model = "gpt-4o-mini"
            self.reasoning_model = "gpt-4o-mini"
        
    async def extract_math_problems(self, pdf_path: str, log_callback: Optional[Callable[[str], None]] = None, generate_variants: bool = False, variant_difficulty: str = "1단계") -> List[Dict]:
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

        # OpenAI Rate Limits 고려
        extract_semaphore = asyncio.Semaphore(3)

        async def _call_openai_api(prompt: str, base64_image: str = None, retries: int = 0, is_discovery=False, **kwargs):
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}"
            }
            
            # 사용자 지정 모델 할당
            api_model = kwargs.get("force_model", self.actual_model)
            
            # 비전(Vision)이 필요한데 o3/o1 등 추론 전용 모델이 선택된 경우에만 gpt-4o로 폴백
            if base64_image and not kwargs.get("force_model"):
                if "o3" in api_model.lower() or "o1" in api_model.lower() or "gpt-5" in api_model.lower():
                    api_model = "gpt-4o"
            
            url = "https://api.openai.com/v1/chat/completions"
            is_responses_api = False
            
            if "4.5" in api_model or "5.4" in api_model:
                url = "https://api.openai.com/v1/responses"
                is_responses_api = True

            if not base64_image and ("o3" in api_model or "o1" in api_model):
                content = prompt
            else:
                text_type = "input_text" if is_responses_api else "text"
                content = [{"type": text_type, "text": prompt}]
                if base64_image:
                    img_type = "input_image" if is_responses_api else "image_url"
                    img_payload = {
                        "url": f"data:image/png;base64,{base64_image}",
                        "detail": "high" if is_discovery else "auto"
                    }
                    
                    if is_responses_api:
                        content.append({
                            "type": img_type,
                            img_type: img_payload
                        })
                    else:
                        content.append({
                            "type": img_type,
                            "image_url": img_payload
                        })

            data = {
                "model": api_model
            }
            
            if is_responses_api:
                data["input"] = [
                    {
                        "role": "user",
                        "content": content
                    }
                ]
            else:
                data["messages"] = [
                    {
                        "role": "user",
                        "content": content
                    }
                ]
                
            if is_responses_api:
                data["max_output_tokens"] = 16000
            elif "o3" in api_model or "o1" in api_model:
                data["max_completion_tokens"] = 100000
            else:
                data["temperature"] = 0.1
                data["max_tokens"] = 3000
                
            json_data = json.dumps(data).encode('utf-8')
            req = urllib.request.Request(url, data=json_data, headers=headers, method="POST")
            
            def _make_req():
                try:
                    with urllib.request.urlopen(req) as response:
                        resp_json = json.loads(response.read().decode('utf-8'))
                        return resp_json
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
            gemini_files_to_delete = []
            
            try:
                sample_file = None
                base64_img = None
                
                if self.gemini_api_key and self.gemini_model:
                    sample_file = await asyncio.to_thread(genai.upload_file, path=padded_img_path)
                else:
                    with open(padded_img_path, "rb") as f:
                        base64_img = base64.b64encode(f.read()).decode('utf-8')
                
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
                        if self.gemini_api_key and self.gemini_model:
                            resp = await self.gemini_model.generate_content_async(
                                [sample_file, discovery_prompt],
                                request_options={"timeout": 600},
                                generation_config=genai.types.GenerationConfig(
                                    temperature=0.0,
                                    response_mime_type="application/json"
                                )
                            )
                            resp_text = resp.text
                        else:
                            resp = await _call_openai_api(discovery_prompt, base64_image=base64_img, is_discovery=True)
                            resp_text = resp['choices'][0]['message']['content']
                            
                        problem_numbers = self._parse_list(resp_text)
                        if problem_numbers:
                           problem_numbers = [str(x).replace(".", "").strip() for x in problem_numbers if str(x).strip()]
                           seen = set()
                           problem_numbers = [x for x in problem_numbers if not (x in seen or seen.add(x))]
                           break
                        else:
                           raise ValueError("Empty array or parse failed during discovery")
                    except Exception as e:
                        retries += 1
                        err_str = str(e).lower()
                        if "429" in err_str or "quota" in err_str or "rate limits" in err_str or "exhausted" in err_str:
                            wait_time = retries * 20
                            _log(f"  [대기] [{page_num + 1}페이지] API 할당량/속도 초과(429). {wait_time}초 대기 후 재시도... ({retries}/4)")
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

                blocks = page.get_text("dict")["blocks"]
                prob_bboxes = {}
                
                for b in blocks:
                    if "lines" in b:
                        text = ""
                        for line in b["lines"]:
                            for span in line["spans"]:
                                text += span["text"]
                        text = text.strip()
                        if text:
                            for q_num in problem_numbers:
                                escaped_num = re.escape(q_num)
                                pattern1 = r'^' + escaped_num + r'[\.\)\s가-힣]' 
                                pattern2 = r'^\[' + escaped_num + r'\]'
                                pattern3 = r'^' + escaped_num + r'[가-힣a-zA-Z]' 
                                
                                is_exact = (text == q_num)
                                is_pattern = bool(re.match(pattern1, text) or re.match(pattern2, text) or re.match(pattern3, text))
                                
                                y0_unscaled = b["bbox"][1]
                                header_footer = (y0_unscaled < 150 or y0_unscaled > page.rect.height - 150)
                                if is_exact and header_footer:
                                    continue
                                    
                                if is_pattern:
                                    prob_bboxes[q_num] = b["bbox"]
                                elif is_exact and q_num not in prob_bboxes:
                                    prob_bboxes[q_num] = b["bbox"]

                tasks = []
                center_x = page.rect.width / 2
                left_probs, right_probs, missing_probs = [], [], []

                for q_num in problem_numbers:
                    if q_num in prob_bboxes:
                        bbox = prob_bboxes[q_num]
                        if bbox[0] < center_x:
                            left_probs.append((q_num, bbox[1]))
                        else:
                            right_probs.append((q_num, bbox[1]))
                    else:
                        missing_probs.append(q_num)

                left_probs.sort(key=lambda x: x[1])
                right_probs.sort(key=lambda x: x[1])

                crop_regions = {}
                center_x_scaled = int(center_x * 2)
                padded_height = int(page.rect.height * 2) + 2000

                prev_y_end_scaled = 0
                for idx, (q_num, y_start) in enumerate(left_probs):
                    current_y_scaled = y_start * 2
                    y_start_scaled = 0 if idx == 0 else max(prev_y_end_scaled, current_y_scaled - 120)
                    if idx + 1 < len(left_probs):
                        next_y_start = left_probs[idx+1][1]
                        y_end_scaled = min(padded_height, int(next_y_start * 2) - 20)
                    else:
                        y_end_scaled = int(page.rect.height * 2) + 200
                    prev_y_end_scaled = y_end_scaled
                    crop_regions[q_num] = (0, y_start_scaled, center_x_scaled + 20, y_end_scaled)

                prev_y_end_scaled = 0
                for idx, (q_num, y_start) in enumerate(right_probs):
                    current_y_scaled = y_start * 2
                    y_start_scaled = 0 if idx == 0 else max(prev_y_end_scaled, current_y_scaled - 120)
                    if idx + 1 < len(right_probs):
                        next_y_start = right_probs[idx+1][1]
                        y_end_scaled = min(padded_height, int(next_y_start * 2) - 20)
                    else:
                        y_end_scaled = int(page.rect.height * 2) + 200
                    prev_y_end_scaled = y_end_scaled
                    page_width_scaled = int(page.rect.width * 2)
                    crop_regions[q_num] = (max(0, center_x_scaled - 20), y_start_scaled, page_width_scaled, y_end_scaled)

                for q_num in missing_probs:
                    crop_regions[q_num] = (0, 0, int(page.rect.width * 2), padded_height)

                for idx, q_num in enumerate(problem_numbers):
                    region = crop_regions[q_num]
                    cropped = padded_img.crop(region)
                    
                    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_crop:
                        cropped.save(tmp_crop.name)
                        
                    img_data = None
                    sample_file_crop = None
                    if self.gemini_api_key and self.gemini_model:
                        sample_file_crop = await asyncio.to_thread(genai.upload_file, path=tmp_crop.name)
                        img_data = sample_file_crop
                        gemini_files_to_delete.append(sample_file_crop)
                    else:
                        with open(tmp_crop.name, "rb") as f_crop:
                            img_data = base64.b64encode(f_crop.read()).decode('utf-8')
                        
                    try:
                        os.remove(tmp_crop.name)
                    except: pass

                    jitter = idx * random.uniform(0.5, 1.5)
                    async def delayed_extract(q, data, j):
                        await asyncio.sleep(j)
                        return await self._extract_single_problem(q, data, extract_semaphore, _log, _call_openai_api, self.actual_model)
                    tasks.append(delayed_extract(q_num, img_data, jitter))
                
                page_results = await asyncio.gather(*tasks)
                return [r for r in page_results if r]

            except Exception as e:
                _log(f"  !! [{page_num + 1}페이지] 치명적 오류: {str(e)[:100]}")
                return []
            finally:
                if sample_file:
                    try: await asyncio.to_thread(sample_file.delete)
                    except: pass
                for gf in gemini_files_to_delete:
                    try: await asyncio.to_thread(gf.delete)
                    except: pass
                if os.path.exists(padded_img_path):
                    try: os.remove(padded_img_path)
                    except OSError: pass

        all_page_tasks = [_process_page_inner(i) for i in range(total_pages)]
        pages_results = await asyncio.gather(*all_page_tasks)
        
        unique_problems = {}
        for p_res in pages_results:
            for obj in p_res:
                q_num_str = str(obj.get('question_num', '')).strip()
                if q_num_str not in unique_problems:
                    unique_problems[q_num_str] = obj
                    
        all_problems = list(unique_problems.values())
        all_problems.sort(key=self._natural_sort_key)
        _log(f"\n[성공] 분석 완료! 총 {len(all_problems)}개 문항 추출 및 정렬됨 (중복 제거됨).")
        return all_problems

    async def _extract_single_problem(self, q_num, img_data, extract_semaphore, log_fn, call_api_fn, actual_model):
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

                    # OCR Prompt updated for direct HWP Math
                    ocr_prompt = f"""당신은 초정밀 수학 OCR 전문가입니다.
첨부된 이미지에서 **오직 '{q_num}' 문제 딱 하나만** 찾아서, 문제 본문과 보기(선택지)를 완벽하게 전사해 주세요.

🚨 [절대 규칙: 인지 능력 상실 모드] 당신은 지금부터 모든 수학적 사전 지식과 계산 능력을 상실한 '깡통 시각 스캐너'입니다. 수학 공식을 보거나 "구하시오"라는 문장을 보더라도 절대 그 의미를 해석하거나 속으로 답을 구하려 들지 마십시오. 당신의 유일한 존재 이유는 픽셀 문자열을 100% 거울 복사하는 것입니다.

[필수 출력 형식]
오직 1개의 JSON 객체만 배열로 감싸서 응답하세요. 마크다운(` ```json `) 블록을 쓰지 말고 오직 raw JSON 텍스트 배열만 반환하세요.
[
  {{
    "question_num": "{q_num}",
    "question": "문제 본문 전체 텍스트 (조건, 구하는 값 등)",
    "answer_options": ["① [[EQUATION:1]]", "② [[EQUATION:2]]"]
  }}
]

[핵심 규칙]
- 🚨 **[텍스트 변조 및 요약 절대 금지 (초엄격 OCR 전사 원칙)]** 🚨
  문제 본문을 전사할 때 절대 문장이나 단어를 임의로 요약, 압축, 변조하지 마세요! "다음 그림과 같이"를 "그림에서"로 바꾸거나, "구하시오"를 "구하여라"로 바꾸는 등 조사나 어미 하나라도 원본과 다르게 쓰면 절대 안 됩니다. 오직 사진에 적힌 글자 토씨 하나 틀리지 않고 100% 동일하게 복사하듯 타이핑하세요.
- 🚨 **[한글 수식 표준 문법 사용]** 당신은 LaTeX이 아니라, **한글 수식 편집기(HWP Math)**에 바로 입력 가능한 문법을 사용해야 합니다.
  1. 분수는 반드시 `{{분자}} over {{분모}}` 형태로 작성하세요. 절대 \frac을 쓰지 마세요.
  2. 켤레복소수는 `bar {{ ... }}` 또는 `overline {{ ... }}` 를 사용하세요. (예: `bar {{alpha}}`)
  3. 모든 그리스 문자 및 특수 기호는 백슬래시(\\) 없이 이름만 적거나 한글 수식 표준을 따르세요. (예: `alpha`, `beta`, `inf`, `times`, `sum`, `root` 등). 거듭제곱근은 반드시 `root {{n}} of {{x}}` 형태를 사용하세요.
  4. 🚨 편의상 분수를 감싸는 괄호가 있다면 일반 괄호 `( )` 대신 반드시 `LEFT ( ... RIGHT )`를 사용해야 크기가 자동 조절됩니다.
  5. **부등호 기호 주의**: `<=`나 `>=` 대신 반드시 단일 선 부등호인 `le` (또는 `<=`) 와 `ge` (또는 `>=`) 대신 **`le` 와 `ge`** 명령어 자체를 사용하세요. (예: `x le 3`)
- 보기(answer_options) 배열 안에 포함되는 모든 숫자, 변수, 기호, 수식 등은 반드시 `[[EQUATION:...]]` 태그로 감싸야 합니다!

[수식 포맷팅 (매우 중요)]
- 모든 수학 수식, 변수, 숫자, 기호는 반드시 아래의 태그 형식으로 감싸야 합니다.
  [[EQUATION:수식]]
- 숫자 하나나 단순 알파벳 변수도 무조건 감싸세요 (예: [[EQUATION:1]], [[EQUATION:x]])
- 🚨 절대 `$수식$`, `$$수식$$`, `\\(수식\\)`, `\\[수식\\]` 및 **마크다운 백틱(\`\`)** 같은 마크다운 수식 래퍼를 사용하지 마세요!!! 무조건 `[[EQUATION:수식]]` 형태로만 감싸야 합니다. (틀린 예: \`x+1\`, 올바른 예: [[EQUATION:x+1]])
- 🚨 **[문항 본문 특별 주의]** `question` 필드 안에서도 **'수식'과 '숫자'만** 예외 없이 `[[EQUATION:...]]` 태그로 감싸야 합니다. **단, 한글 문장이나 텍스트를 통째로 태그 안에 넣지 마세요.** (올바른 예: `[[EQUATION:f(x)]]는 짝수이다` / 틀린 예: `[[EQUATION:f(x)는 짝수이다]]`)
- 🚨 **[치명적 태그 오류 주의]** 태그를 열 때는 `[[EQUATION:` 로 열고, 닫을 때는 `]]` 로 정확하게 닫아야 합니다.

- 🚨 **[<보기> 박스 문항 특별 주의 (선지와 혼동 금지!)]** 🚨
  <보기> 상자 안에 제시된 'ㄱ. ...', 'ㄴ. ...', 'ㄷ. ...' 등의 내용은 **반드시 문제 본문(question 필드)의 끝부분에 모두 포함하여 100% 전사**해야 합니다. 절대 객관식 선지 배열로 분리하거나 누락하지 마세요.
  🚨 **[보기 내용 스스로 평가/풀이 절대 금지]** `<보기>`에 주어진 명제나 수식을 당신이 먼저 머릿속으로 풀어서 '참/거짓'을 판별해 변조하거나, 수식을 정리(단순화)해서 적지 마세요! 오직 픽셀에 적힌 글자 그대로 100% 타이핑해야 합니다.
- 🚨 **[객관식 선지 중복 기재 절대 금지]** 🚨
  `question` 필드 안에는 ①, ②, ③, ④, ⑤ 와 같은 객관식 선지 내용이 단 한 글자도 들어가서는 안 됩니다. 무조건 `answer_options` 배열 안으로만 완벽하게 분리하십시오.
- 문항 번호(예: "15.", "16번")는 제외하고 문제 본문 텍스트만 작성하세요.

[올바른 추출 예시]
원본 이미지 내용:
"다음 중 옳은 것을 <보기>에서 고르시오.
<보기>
ㄱ. [[EQUATION:x^2 > 0]]
ㄴ. [[EQUATION:y = 3]]
① ㄱ  ② ㄴ  ③ ㄱ, ㄴ"

올바른 JSON 추출:
{
  "question_num": "1",
  "question": "다음 중 옳은 것을 <보기>에서 고르시오.\\n<보기>\\nㄱ. [[EQUATION:x^2 > 0]]\\nㄴ. [[EQUATION:y = 3]]",
  "answer_options": ["① ㄱ", "② ㄴ", "③ ㄱ, ㄴ"]
}"""

                    if self.gemini_api_key and self.gemini_model:
                        resp = await self.gemini_model.generate_content_async(
                            [img_data, ocr_prompt],
                            request_options={"timeout": 600},
                            generation_config=genai.types.GenerationConfig(
                                temperature=0.0,
                                response_mime_type="application/json"
                            )
                        )
                        ocr_text = self._sanitize_json(resp.text)
                    else:
                        ocr_resp = await call_api_fn(ocr_prompt, base64_image=img_data, is_discovery=False)
                        ocr_text = self._sanitize_json(ocr_resp['choices'][0]['message']['content'])
                        
                    ocr_extracted = self._extract_json_objects(ocr_text)
                    if not ocr_extracted: raise Exception("Hybrid OCR failed to produce valid JSON.")
                    ocr_obj = ocr_extracted[0]
                    
                    def force_equation_tags(text):
                        if not isinstance(text, str): return text
                        text = re.sub(r'\\\(\s*(.*?)\s*\\\)', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
                        text = re.sub(r'\\\[\s*(.*?)\s*\\\]', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
                        text = re.sub(r'\$\$\s*(.*?)\s*\$\$', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
                        text = re.sub(r'\$\s*(.*?)\s*\$', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
                        text = re.sub(r'\[\[EQUATION\{([^{}]+)\}\]\]', r'[[EQUATION:\1]]', text)
                        text = re.sub(r'\[\[EQUATION\{([^{}]+)\}\}', r'[[EQUATION:\1]]', text)
                        text = re.sub(r'\[\[EQUATION\{([^{}]+)\]\]', r'[[EQUATION:\1]]', text)
                        text = re.sub(r'\[\[EQUATION=([^{}]+)\]\]', r'[[EQUATION:\1]]', text)
                        text = re.sub(r'\[\[EQUATION:([^{}]+)\}\}', r'[[EQUATION:\1]]', text)
                        return text

                    extracted_question = force_equation_tags(ocr_obj.get('question', ''))
                    extracted_options = [force_equation_tags(opt) for opt in ocr_obj.get('answer_options', [])]
                    
                    reasoning_prompt = f"""당신은 수학 해설 타이핑 전문가입니다.
다음은 OCR로 완벽하게 전사된 문제 번호 {q_num}의 본문과 선택지입니다.

[문제 본문]
{extracted_question}

[선택지]
{str(extracted_options)}

위 문제를 풀이하고, 아래 JSON 구조로 완벽하게 해설을 작성해 주세요.
🚨 **[단답형/찍기 수식 절대 금지!]** 과정을 생략하고 정답 수식만 띡 적어놓는 것은 치명적 시스템 오류입니다. 반드시 1단계, 2단계 논리 비약 없이 칠판에 판서하듯 풀이 과정을 빼곡하게 적으세요.

[필수 출력 형식]
아래 3개의 키("problem_num", "thought_process", "explanation")만 포함된 JSON 객체를 하나 포함하는 배열 형식(`[...]`)으로 출력하십시오. 마크다운 불필요.
(절대 "question"이나 "answer_options" 키를 중복해서 출력하거나 임의로 텍스트를 수정하지 마십시오.)
[
  {{
    "problem_num": "{q_num}",
    "thought_process": "이곳에 수단과 방법을 가리지 말고 자유롭게 연습장처럼 먼저 다 풀어보세요. 모든 중간 계산과 수식 전개 과정을 단 하나도 빠짐없이 전부 작성하세요.",
    "explanation": "위 'thought_process'에서 검산이 끝난 풀이 과정을 바탕으로, 학생이 보고 100% 이해할 수 있도록 아주 상세하고 친절한 '해설지 본문'을 이 필드에 작성합니다. {instr}"
  }}
]

[수식 포맷팅 (매우 중요)]
- 🚨 **[초엄격: LaTeX 절대 금지, 오직 HWP(한글) 수식 문법 사용]**
  - 분수: `\frac{{A}}{{B}}` (X) -> `{{A}} over {{B}}` (O)
  - 그리스 문자: `\alpha`, `\beta`, `\pi` (X) -> `alpha`, `beta`, `pi` (O) - 역슬래시 떼기
  - 곱하기/나누기: `\times`, `\div`, `\cdot` (X) -> `TIMES`, `DIV`, `cdot` (O)
  - 부등호/등호: `\le`, `\ge`, `<=`, `>=`, `\neq` (X) -> `le`, `ge`, `!=` (O)
  - 무한대/루트: `\infty`, `\sqrt` (X) -> `inf`, `sqrt` (O). 거듭제곱근은 반드시 `root {{n}} of {{A}}` (예: `root {{3}} of {{2}}`)
  - 🚨 대괄호 유지: 구간 표현 시 `(0, 1]`을 `(0, 1}}`로 잘못 닫지 말고 대괄호 `]`를 반드시 유지하세요.
  - 상단 선/벡터: `\bar`, `\overline`, `\vec` (X) -> `bar`, `overline`, `vec` (O)
  - 행렬 줄바꿈: `\\\\` (X) -> `#` (O)
- 🚨 **크기 조절 괄호 필수**: 분수(`over`)를 감싸는 괄호는 일반 괄호 `( )` 대신 반드시 `LEFT ( ... RIGHT )` 또는 `LEFT {{{{ ... RIGHT }}}}`를 사용하세요. (예: `LEFT ( {{{{1}}}} over {{{{5}}}} RIGHT )^{{{{root {{{{2}}}}}}}}`)
- 🚨 **극한(Limit) 문제 시각적 풀이 필수**: 함수 극한 문제에서 그래프 이미지가 주어졌다면, 절대 수식만으로 유추하지 말고 반드시 주어진 그래프 이미지를 눈으로 읽고 좌극한/우극한 값을 도출하세요.
- 모든 수학 수식, 변수, 숫자, 기호는 반드시 `[[EQUATION:수식]]` 태그로 감싸야 합니다.
- 🚨 **[최종 자체 검수 필수]**: JSON으로 응답을 출력하기 직전에, 본인이 작성한 모든 수식(`[[EQUATION:...]]`)을 다시 한번 전수조사하여 위 HWP 문법(LaTeX 잔재 여부)을 어긴 곳이 있는지 검사하세요. 만약 `\frac`이나 역슬래시가 발견되면 반드시 HWP 표준 구문으로 수정한 뒤에 최종 JSON을 반환하세요.
- 🚨 **[본문 텍스트 일치 여부 재검증]** 해설까지 전부 작성한 후, 마지막으로 반드시 원본 이미지를 눈으로 다시 한번 확인하여 대조해 보세요. 만약 당신이 타이핑한 문제 본문 텍스트(한글, 영어 등)나 수식이 이미지 원본과 단 1글자라도 다르거나, 문제를 풀다가 본문 내용이 조작/변형되었다면, 즉시 폐기하고 처음부터 원본과 100% 동일하게 일치하도록 완벽히 다시 작성하세요.
- 🚨 [매우 중요] 해라체(-다, -이다, -한다)를 사용하세요.
- 해설 마지막에 "따라서 정답은 [최종답안]이다."를 포함하세요."""

                    reason_resp = await call_api_fn(reasoning_prompt, base64_image=None, is_discovery=False, force_model=self.reasoning_model)
                    
                    resp_text = ""
                    if "output" in reason_resp:
                        out_val = reason_resp["output"]
                        if isinstance(out_val, list) and out_val:
                            resp_text = out_val[0].get("text", "")
                        elif isinstance(out_val, dict):
                            resp_text = out_val.get("text", "")
                    else:
                        if 'choices' in reason_resp and len(reason_resp['choices']) > 0:
                            resp_text = reason_resp['choices'][0].get('message', {}).get('content', "")
                    
                    text = self._sanitize_json(resp_text)
                    extracted = self._extract_json_objects(text)
                    if extracted:
                        obj = extracted[0]
                        # 🚨 [True Cognitive Separation]
                        # Python 메모리에 저장된 OCR 데이터를 절대 불침번으로 고정.
                        # Pass 2(해설 모델)가 아무리 엉뚱한 데이터를 반환해도 무시하고 원본 복사.
                        final_obj = {{
                            "question_num": q_num,
                            "question": extracted_question,
                            "answer_options": extracted_options,
                            "thought_process": obj.get('thought_process', ''),
                            "explanation": force_equation_tags(obj.get('explanation', obj.get('expl', '')))
                        }}
                        log_fn(f"    [문항 {q_num}] [성공] 추출 완료!")
                        return final_obj
                    
                    retries += 1
                except Exception as e:
                    retries += 1
                    err_str = str(e).lower()
                    if retries == 4:
                        log_fn(f"    [문항 {q_num}] [실패] 추출 실패 (최종): {str(e)}")
                    else:
                        if "429" in err_str or "quota" in err_str or "rate limits" in err_str:
                            await asyncio.sleep(retries * 20)
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
        text = re.sub(r'```json\s*', '', text)
        text = re.sub(r'```\s*', '', text)
        
        first = text.find('[') if '[' in text else text.find('{')
        if first != -1:
            text = text[first:]
            
        def escape_newlines(match):
            return match.group(0).replace('\n', '\\n').replace('\r', '')

        text = re.sub(r'"([^"\\]*(?:\\.[^"\\]*)*)"', escape_newlines, text)
        text = text.replace(r'\{', '{').replace(r'\}', '}').replace(r'\[', '[').replace(r'\]', ']')
            
        return text

    def _extract_json_objects(self, text):
        import ast
        try:
            obj, _ = json.JSONDecoder(strict=False).raw_decode(text.lstrip())
            return [obj] if isinstance(obj, dict) else obj
        except:
            pass
            
        try:
            py_text = text.replace('true', 'True').replace('false', 'False').replace('null', 'None')
            obj = ast.literal_eval(py_text)
            return [obj] if isinstance(obj, dict) else obj
        except:
            pass

        objects = []
        pattern = re.compile(r'\{\s*"(question|number|question_num)"')
        for match in pattern.finditer(text):
            start = match.start()
            count = 0
            for i in range(start, len(text)):
                if text[i] == '{': count += 1
                elif text[i] == '}':
                    count -= 1
                    if count == 0:
                        try:
                            objects.append(json.loads(text[start:i+1], strict=False))
                            break
                        except: pass
        return objects

    def _natural_sort_key(self, problem):
        q_num_str = str(problem.get("question_num", ""))
        if not q_num_str: return (99, 999999)
        is_essay = any(keyword in q_num_str for keyword in ["서답", "서술", "단답", "주관"])
        group = 2 if is_essay else 1
        digits = re.findall(r'\d+', q_num_str)
        num_val = int(digits[0]) if digits else 999999
        return (group, num_val)
