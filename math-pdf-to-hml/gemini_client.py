import os
import asyncio
import google.generativeai as genai
from google.generativeai import caching
import datetime
from typing import List, Dict, Optional, Callable
import json
import re
import fitz
import tempfile
import time
from PIL import Image

class GeminiMathParser:
    def __init__(self, api_key: str, model_name: str = 'gemini-3-flash-preview'):
        genai.configure(api_key=api_key)
        self.model_name = model_name
        self.model = genai.GenerativeModel(self.model_name)
        
    async def extract_math_problems(self, pdf_path: str, log_callback: Optional[Callable[[str], None]] = None) -> List[Dict]:
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

        # 병렬성 제어 (동시 호출 수 제한) - 유료 티어 한도에 맞춰 조절 가능
        semaphore = asyncio.Semaphore(10)

        async def process_page(page_num):
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
                discovery_prompt = """시험지 이미지 전체를 샅샅이 스캔하여 존재하는 모든 독립된 '메인 문제 번호'를 하나도 빠짐없이 찾아 파이썬 리스트 형식으로만 응답하세요.
(예: ["1", "2", "3", "서술형 1"]) 
[중요 규칙]
1. (1), (2), ①, ② 같은 소문항이나 객관식 보기 번호는 절대 포함하지 마세요.
2. 1., 2., 3. 처럼 점이 찍힌 번호라도 "1", "2", "3"으로 깔끔하게 리스트에 넣으세요."""
                
                resp = await self.model.generate_content_async([sample_file, discovery_prompt])
                problem_numbers = self._parse_list(resp.text)
                
                if not problem_numbers:
                    _log(f"  -> [{page_num + 1}페이지] 유효 문항 없음.")
                    return []

                _log(f"  -> [{page_num + 1}페이지] {len(problem_numbers)}개 문항 발견: {problem_numbers}")

                # 3. 개별 문항 병렬 추출 (이미지 공유)
                tasks = []
                for q_num in problem_numbers:
                    tasks.append(self._extract_single_problem(q_num, sample_file, semaphore, _log))
                
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

        # 모든 페이지 동시 시작
        all_page_tasks = [process_page(i) for i in range(total_pages)]
        pages_results = await asyncio.gather(*all_page_tasks)
        
        for p_res in pages_results:
            all_problems.extend(p_res)

        # 최종 정렬
        all_problems.sort(key=self._natural_sort_key)
        _log(f"\n✅ 분석 완료! 총 {len(all_problems)}개 문항 추출 및 정렬됨.")
        return all_problems

    async def _extract_single_problem(self, q_num, sample_file, semaphore, log_fn):
        async with semaphore:
            retries = 0
            while retries < 3:
                try:
                    log_fn(f"    [문항 {q_num}] 병렬 추출 시작... (시도 {retries + 1}/3)")
                    # 유저 피드백 반영: 완전 생략 대신, 핵심 중간 계산 과정은 포함하여 논리가 끊기지 않도록 약간의 디테일 추가
                    # 유저 추가 피드백 (포맷팅): [해설] 단어 금지, '1단계 제목 내용' 포맷 사용, 굵은 글씨(**) 금지
                    # 유저 추가 피드백 (난이도): 고3 수준 제한, 극좌표, mod 등 대학수학/교과외 스킬 구체적 밴
                    instr = "전체 내용을 3~4단계(단계별 요약)로 구성할 것. 풀이의 핵심 개념과 필수적인 중간 계산 과정(논리적 비약 방지)은 반드시 포함하되, 수식 위주로 간결하게 서술할 것. 모든 해설의 난이도와 풀이 방식은 '고등학교 3학년(고3) 수준'을 절대 넘지 말 것. (경고: '극좌표계(Polar coordinates)', '로피탈의 정리', '테일러 급수', '편미분', '외적', '합동식(mod)', '모듈로 연산' 등 대학 수학이나 고교 교과 외 과정은 논리 전개에 절대 사용하지 마시오)."
                    if retries > 0:
                        instr = "!!초긴급 압축 모드!! 설명은 생략하고 핵심 수식 1줄만 [[EQUATION:...]] 형태로 작성."

                    prompt = f"""당신은 수학 해설 타이핑 전문가입니다.
첨부된 이미지에서 **오직 '{q_num}' 문제 딱 하나만** 찾아서, 아래 JSON 구조로 완벽하게 해설을 작성해 주세요.

[필수 출력 형식]
오직 1개의 JSON 객체만 배열로 감싸서 응답하세요. 다른 말은 절대 쓰지 마세요.
[
  {{
    "question_num": "{q_num}",
    "question": "문제 본문 전체 텍스트 (조건, 구하는 값 등)",
    "answer_options": ["① 1", "② 2"],
    "explanation": "{instr}"
  }}
]

[핵심 규칙]
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
  8. 해설의 맨 마지막 문장은 반드시 "따라서 정답은 [최종답안]입니다." 형태로 새 줄에 끝맺어야 합니다. 객관식 기호나 수식을 [최종답안] 괄호 없이 안에 넣어주세요. (단답형 예: "따라서 정답은 [[EQUATION:5\\sqrt{2}]]입니다.")"""
                    
                    # 이미지와 프롬프트를 함께 전송 (무결성 확보)
                    resp = await self.model.generate_content_async(
                        [sample_file, prompt], 
                        generation_config=genai.types.GenerationConfig(temperature=0.1)
                    )
                    
                    text = self._sanitize_json(resp.text)
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
                except Exception as e:
                    retries += 1
                    if retries == 3:
                        log_fn(f"    [문항 {q_num}] ❌ 추출 실패 (최종): {str(e)[:50]}...")
                    await asyncio.sleep(1)
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
            return (99, 999999) # 번호가 없으면 맨 뒤로
            
        # 서답/서술/단답형 식별
        is_essay = any(keyword in q_num_str for keyword in ["서답", "서술", "단답", "주관"])
        group = 2 if is_essay else 1
            
        # 문자열 안에서 숫자만 추출
        digits = re.findall(r'\d+', q_num_str)
        num_val = int(digits[0]) if digits else 999999
                
        return (group, num_val)
