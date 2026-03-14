import os
import google.generativeai as genai
from typing import List, Dict
import json
import re
from pypdf import PdfReader, PdfWriter
import tempfile
import time

class GeminiMathParser:
    def __init__(self, api_key: str, model_name: str = 'gemini-3-flash-preview', curriculum: str = "고1 수준 (공통수학)"):
        genai.configure(api_key=api_key)
        self.model_name = model_name
        self.curriculum = curriculum
        self.model = genai.GenerativeModel(self.model_name)
        
    def extract_math_problems(self, pdf_path: str) -> List[Dict]:
        """
        PDF 파일에서 수학 문제를 추출하여 구조화된 JSON 데이터로 반환합니다.
        문제가 여러 페이지에 걸쳐 있는 경우를 완벽하게 처리하기 위해,
        물리적으로 PDF를 1장씩 분할하여 각각 독립적으로 API에 전송하고 취합합니다.
        """
        
        all_problems = []
        reader = PdfReader(pdf_path)
        total_pages = len(reader.pages)
        print(f"총 {total_pages}장의 PDF 페이지가 감지되었습니다. 1장씩 분할 추출을 시작합니다.")

        # API 응답 텍스트 정제 함수 (수식 보호 및 단일 백슬래시 교정)
        def sanitize_json(text):
            kw_regex = r'(?<!\\)\\(times|tan|rightarrow|Rightarrow|rho|frac|beta|bar|nabla|neq|ni|theta|tau|varphi|phi|pi|psi|nu|mu|lambda|kappa|iota|eta|zeta|epsilon|delta|gamma|alpha|omega|chi|upsilon|sigma|xi|Theta|Phi|Pi|Psi|Lambda|Delta|Gamma|Omega|Sigma|Xi|Upsilon|cdot|sqrt|left|right|sum|prod|int|oint|lim|infty|approx|equiv|propto|sim|simeq|asymp|doteq|implies)'
            text = re.sub(kw_regex, r'\\\\\1', text)
            text = re.sub(r'(?<!\\)\\([^"\\/bfnrtu])', r'\\\\\1', text)
            text = text.replace('\r', '')
            return text

        # 페이지별 순회 시작
        for page_num in range(total_pages):
            print(f"[{page_num + 1}/{total_pages}] 페이지 분석 중...")
            
            # 1. 단일 페이지 추출 및 임시 PDF 파일 생성
            writer = PdfWriter()
            writer.add_page(reader.pages[page_num])
            
            # Windows file locking fix: Create the file but close the handle immediately so PyPDF writer can access it
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
                temp_pdf_path = tmp.name
            
            try:
                with open(temp_pdf_path, 'wb') as f:
                    writer.write(f)
                    
                # 2. 임시 1장짜리 PDF 업로드
                sample_file = genai.upload_file(path=temp_pdf_path)
                # AI에게 시킬 역할과 지시사항 (프롬프트 최적화 - 누락 방지 최우선)
                prompt = """당신은 주어진 시험지 이미지(PDF 페이지)에서 모든 수학 문제를 찾아내어 완벽한 JSON 배열 형식으로 반환하는 초정밀 수학 데이터 추출기입니다.
수동 타이핑 없이 이 데이터를 다른 프로그램에서 즉시 구조화하여 쓸 수 있도록, 아래 지시사항을 문자 그대로 엄격하게(Strictly) 따르십시오.

[STEP 1: 페이지 전체 스캔 및 문제 번호 나열 (사전 작업)]
JSON을 작성하기 전에, **반드시 응답의 첫 줄에 이 페이지에 존재하는 모든 문제의 번호를 빠짐없이 나열하세요.**
예시: `[탐색된 문제 번호: 1, 2, 3, 4, 서술형1, 서술형2]`
작게 적혀있거나 구석에 있는 문제라도 절대 놓치지 마세요.

[STEP 2: JSON 추출 (최우선 필수 지침 - 문제 누락 절대 금지!!!)]
1. 위 'STEP 1'에서 탐색된 "모든" 문제를 하나도 빠짐없이 독립적인 JSON 객체로 변환해야 합니다.
2. 문제 사이의 간격이 넓거나 단이 나뉘어 있어도, 시선을 페이지 끝까지 스캐닝하여 모든 문제를 추출하세요.
3. 객관식, 주관식, 서술형, 그림 유무에 상관없이 번호가 매겨진 모든 문항은 추출 대상입니다. 단계를 건너뛰거나 임의로 스킵하면 치명적인 오류로 간주됩니다.
4. 🚨 [매우 중요] 세트형 문제(예: "다음 그림을 보고 13번, 14번에 답하시오")나 묶음형 지문이 있더라도, 절대로 문제들을 하나의 JSON 객체로 합쳐서 뭉뚱그려 출력하지 마세요! "13번" 문제 객체와 "14번" 문제 객체를 반드시 각각 분리하여 배열에 따로따로 담아야 합니다.
5. 만약 STEP 1에서 7개의 번호를 찾았다면, JSON 배열에는 반드시 정확하게 7개의 객체가 순서대로 들어있어야 합니다.

[STEP 3: ⚠️ 최상위 엄격 출력 통제 (치명적 오류 방지)]
- 당신은 기계적인 파서(Parser)입니다. "Wait", "Let's check", "Ready to generate", 문제 풀이 고민 등 영어/한국어를 불문한 어떠한 형태의 혼잣말(Scratchpad / Thinking / Monologue)도 **절대로, 단 한 글자도 출력해서는 안 됩니다!!!**
- 분석 과정이나 생각 과정을 텍스트로 쓰지 마세요. 무조건 바로 'STEP 1'의 문제 번호 나열 한 줄과 'STEP 2'의 JSON 배열만 출력해야 합니다.
- ⚠️ 절대로 어떠한 형태의 마크다운(```json 등)이나 일반 텍스트를 출력의 처음이나 끝에 포함하지 마십시오. 오직 순수한 JSON 문자열만 존재해야 합니다.

[작업 규칙 설정]
1. 배열(Array) 형식: 반환 데이터의 메인 내용은 오직 `[`로 시작하고 `]`로 끝나는 JSON 배열이어야 합니다.
2. 각 배열의 원소는 하나의 문제 데이터를 담고 있으며, 다음 4개의 키("problem_num", "question", "answer_options", "explanation")를 반드시 가져야 합니다.
   - 키 이름과 값은 모두 쌍따옴표(")로 감싸야 합니다.
   - 보기 문항(1~5번)은 절대 "question" 문자열 내부에 포함해선 안 됩니다. 반드시 "answer_options" 리스트로 완벽히 분리하세요.

[각 키별 작성 가이드라인]
"problem_num" (문자열):
- 문제 번호 그 자체를 그대로 적으세요. (예: "1", "13", "서술형 1", "단답형 2번", "1.")

"question" (문자열):
- 문항 번호(예: "1.", "2번")는 제외하고 문제 본문 텍스트만 작성하세요.
- 이미지 내의 그림이나 그래프는 무시하고, 텍스트와 수식만 정확하게 추출하세요.
- 객관식 보기(①, ②, ③, ④, ⑤ 등)는 **절대 이 안에 넣지 마세요**. 오직 문제를 묻는 본문까지만 포함합니다.

"answer_options" (문자열 배열):
- 객관식 문제인 경우에만 각 보기의 텍스트를 배열로 담습니다.
- 객관식이 아닌 주관식/서술형 문제일 경우 빈 배열 `[]`을 기본값으로 넣습니다.
- 보기 번호 기호(①, ② 등)도 유지하면서 문자열로 추출합니다.
- **[매우 중요]** 보기 번호 기호를 제외한 모든 숫자, 분수, 기호, 수식은 반드시 `[[EQUATION:...]]`으로 감싸야 합니다!
- 예시: `["① [[EQUATION:12]]", "② [[EQUATION:\\frac{1}{2}]]", "③ [[EQUATION:2\\sqrt{3}]]"]`

"explanation" (문자열):
- 입력된 문항에 대한 해설, 정답에 이르는 논리적 과정과 풀이 식을 이 필드에 아주 상세하게 작성해 줍니다.
- 대치동 일타 강사가 4~5등급 학생에게 1:1 과외를 하듯, 아주 친절하고 상세하게 풀이의 모든 단계를 적어주세요.
- 단순히 수식만 나열하지 말고, "왜 이런 식이 나왔는지", "어떤 개념을 써야 하는지" 말하듯 부드럽게 설명하세요.
- 논리적인 흐름에 따라 (조건 분석 -> 식 세우기 -> 정답 도출) 순서대로 설명하되, **절대로 "1단계 다항식의 인수분해", "2단계 소수가 될 조건 확인" 같은 명시적인 단계별 소제목을 텍스트로 적지 마세요.** 
- 숫자로 시작하는 단계별 목차나 제목 양식을 철저하게 배제하고, 오직 물 흐르듯 이어지는 하나의 자연스러운 "글(줄글)" 형태로 풀이 과정을 전개하세요.
- **[매우 중요]** 해설의 맨 마지막 문장은 반드시 **"따라서 정답은 [최종답안]입니다."** 형태로 끝맺어야 합니다.
  - 객관식 문제인 경우 [최종답안] 자리에 원문자 번호(예: ①, ②, ③)를 넣으세요. (예: "따라서 정답은 ②입니다.")
  - 주관식/서답형 문제인 경우 [최종답안] 자리에 도출된 수식이나 숫자를 넣으세요. (예: "따라서 정답은 [[EQUATION:5\\sqrt{2}]]입니다.")
- 모든 수식은 통일되게 HWP 포맷 [[EQUATION:수식]] 형식으로 감싸야 합니다.

[🚨 해설지(Explanation) 작성 핵심 규칙 🚨]
- **[가장 중요한 초정밀 전사 원칙] 원본 이미지에 있는 수식을 전사할 때 단 하나의 글자, 숫자, 기호, 괄호 등도 절대 누락하거나 임의로 축약/변경하지 마세요. (예: `{{g(x) - x}}^3` 을 `{{g(x)}}^3` 으로 마음대로 생략/요약하면 절대 안 됩니다. 눈에 보이는 픽셀 그대로 100% 똑같이 부활시키세요.)**
- **[해설 길이의 탄력적 조절] 문제의 체감 난이도에 따라 해설 깊이를 조절하세요. 어려운 문제는 중간 과정을 상세히 적고, 쉬운 문제(눈으로도 풀리는 식)는 '동류항 계산', '단순 전개' 같은 뻔하고 지루한 기초 연산 서술을 과감히 생략하여 해설이 너무 길어지지 않게 간결히 핵심만 보여주세요.**
- 학생 혼자서 글만 1~2번 읽고도 100% 이해할 수 있을 만큼 구체적으로, 친절한 어투의 한국어 문장으로 서술하세요. (예: "주어진 조건을 이용하면 A=1, B=2이다" 같이 불친절하게 쓰지 마세요. "주어진 조건 ~를 식 ~에 대입하여 정리하면..." 처럼 자세히 쓰세요.)
- 🚨 {LEVEL_INSTR}

[수식 포맷팅 (매우 중요)]
- 모든 수학 수식, 변수, 숫자, 기호는 절대 일반 텍스트로 쓰지 말고, 반드시 아래의 특수 테그 형식으로 감싸야 합니다.
  [[EQUATION:수식]]
- 수식 내부 문법은 한컴오피스 수식표기법(LaTeX와 유사)을 따릅니다.
  - 분수: {분자} over {분모}
  - 제곱: x^{2}
  - 루트: sqrt{x}
  - 거듭제곱근(n제곱근, 예: 세제곱근, 네제곱근 등): 절대로 sqrt[n]{x} 형태를 쓰지 말고, 반드시 **root {n} of {x}** 형태로만 작성하세요. (예: 세제곱근 2는 root {3} of {2})
  - 다중 중첩 루트(이중근호 등) 지양, 괄호로 묶어서 표현.
  - 부등호: <, >, <=, >=
  - 집합 조건제시법: 원본 문제에 `{ x | ... }` 나 `{ x \mid ... }` 형태의 집합 조건제시법이 있다면, 절대로 말로 풀어서 쓰거나 생략하지 말고 **반드시 수식 기호인 \\left\\{{ x \\mid f(x) \\right\\}} 형태를 그대로 유지해서 작성**하세요. (단순 | 기호 금지)
  - 그리스 문자: \\alpha, \\beta, \\gamma, \\theta 등 (백슬래시 사용)
  - 예시 1: "이차함수 [[EQUATION:y = x^{2} + 2x + 1]]의 최솟값은?"
  - 예시 2: "[[EQUATION:\\alpha + \\beta = 3]]일 때, [[EQUATION:\\frac{\\alpha}{\\beta}]]의 값을 구하시오."
  - 변수 하나(예: x, a, n)나 단순 숫자(예: 0, 1, 2)라도 수식 태그로 감싸십시오. (예: "[[EQUATION:x]]의 값은 [[EQUATION:3]]이다.")
- 🚨 **[초비상 규정] 명심하세요! 숫자 하나(예: 1, 2, 0, 3)나 단순 알파벳 변수(예: a, x, y, f)가 나오는 아주 짧고 사소한 순간조차도 무조건 [[EQUATION:1]], [[EQUATION:x]] 처럼 예외 없이 감싸야 합니다.** (예: "[[EQUATION:x]]의 값은 [[EQUATION:3]]이다.") 텍스트로 숫자를 그대로 노출하는 것은 치명적인 오류입니다.
- 🚨 **괄호가 복잡하게 얽힌 수식(예: `\\left\\{ \\left( \\dots \\right) \\right\\}^2`)이나 길이가 긴 다항식, 분수식 등도 중간에 끊지 말고 통째로 `[[EQUATION:...]]` 단 하나로 완벽하게 감싸야 합니다. 긴 수식을 절대로 텍스트 공간에 방치하지 마세요.**
- 🚨 **절대로 "x가 1보다 크다" 라고 텍스트로 적지 마세요. 무조건 "[[EQUATION:x > 1]]이다" 라고 적어야 합니다.**
- 🚨 수식 블록 안에서 백슬래시(`\\`)를 사용할 때 역슬래시 에스케이핑 문제가 생기지 않도록 `\\\\alpha` 와 같이 백슬래시를 이스케이프 하십시오.
- **다항식 지수(거듭제곱) 표기 시 절대 주의**: `x^{2}+x+1` 또는 `x^2+x+1` 처럼 지수 부분만 정확히 적용해야 하며, 절대로 뒤의 수식까지 몽땅 묶어서 `x^{2+x+1}`처럼 지수 위로 올려버리는 오류를 범하지 마세요!

지금 바로 페이지 분석결과를 JSON Array로 엄격하게 출력하세요. 절대 한국어 혼잣말을 섞지 마세요."""
                
                # 🚀 긴 출력(토큰 리밋)에 대응하기 위해 ChatSession 기반으로 연속 생성 처리
                for page_retry_idx in range(3):
                    chat_session = self.model.start_chat(history=[])

                    # API 호출 재시도 로직 (400 Expired, 429 Quota 등 일시적 에러 대비)
                    max_api_retries = 3
                    response = None
                    for api_attempt in range(max_api_retries):
                        try:
                            if "고1" in getattr(self, "curriculum", "고1"):
                                level_instr = "**[제한 사항] 대한민국 고등학교 1학년(고1) 공통수학 교육과정 수준 내에서만 무조건 해결하세요. 절대로 고2/고3 과정(수1, 수2, 미적분, 확통 등)의 선행 개념을 쓰지 마세요.** (예: 상용로그, 삼각함수, 수열, 미분, 적분 등 절대 금지). **특히 복소수(i) 거듭제곱 문제 등에서 극좌표계나 삼각함수(sin, cos), 오일러 공식을 쓰면 절대 안 됩니다. 무조건 직접 제곱((1+i)^2 = 2i)하여 순수 대수적으로 주기성을 찾는 1학년 방식을 쓰세요.**"
                            else:
                                level_instr = "**[제한 사항] 대한민국 고등학교 2학년/3학년(수1, 수2, 선택과목) 교육과정 수준 내에서 해결하세요.** 단, 대학교 서적에 나오는 극좌표계, 로피탈의 정리, 테일러 급수 등 대학 수학 개념은 절대 금지합니다."
                                
                            response = chat_session.send_message(
                                [sample_file, prompt.replace("{LEVEL_INSTR}", level_instr)],
                                generation_config=genai.types.GenerationConfig(
                                    temperature=0.1,
                                    max_output_tokens=8192,
                                )
                            )
                            break # 성공시 루프 탈출
                        except Exception as e:
                            if api_attempt < max_api_retries - 1:
                                err_str = str(e).lower()
                                if "429" in err_str or "quota" in err_str or "exhausted" in err_str:
                                    wait_time = (api_attempt + 1) * 15
                                else:
                                    wait_time = (api_attempt + 1) * 3
                                print(f"[{page_num + 1}페이지] API 응답 에러 발생 ({e}). {wait_time}초 후 재시도합니다... ({api_attempt + 1}/{max_api_retries})")
                                time.sleep(wait_time)
                            else:
                                raise e # 최종 실패시 바깥쪽 except 블록으로 넘김

                    full_response_text = response.text

                    # 출력이 완결되지 않고 잘렸는지 확인 (정상적이면 ']' 로 끝나야 함)
                    # 토큰 제한(MAX_TOKENS)으로 잘린 경우를 구별합니다.
                    def is_response_truncated(resp):
                        if hasattr(resp, 'candidates') and len(resp.candidates) > 0:
                            fr = resp.candidates[0].finish_reason
                            # fr can be an Enum like FinishReason.MAX_TOKENS or int 2
                            if 'MAX_TOKENS' in str(fr) or fr == 2:
                                return True
                        return False

                    max_retries = 3
                    retries = 0

                    while is_response_truncated(response) and retries < max_retries:
                        print(f"[{page_num + 1}페이지] 출력 길이 제한(MAX_TOKENS) 도달. 이어서 생성 요청 중... (시도 {retries+1})")
                        continue_prompt = """🚨 [SYSTEM OVERRIDE: JSON ARRAY CHUNKING MODE] 🚨
    현재 당신이 작성하던 해설이 길이 제한으로 끊겼습니다.
    이전 답변에서 쓰다 만 (중간에 끊긴) 문제 객체는 모두 버리세요. 
    방금 "완벽하게 끝까지 작성하지 못한 문제의 번호"부터 시작해서, 이 페이지의 마지막 번호 문제까지 완전히 **새로운 JSON 배열 `[...]`** 형식으로만 다시 출력하세요.
    어떠한 대화형 문장이나 앞선 내용을 잇는 문구 없이, 오직 새로운 `[` 로 시작해서 `]` 로 끝나는 JSON 코드 블록만 출력해야 합니다.
                        """

                        # API 호출 재시도 로직 (400 Expired, 429 Quota 등 일시적 에러 대비 - 이어쓰기용)
                        continue_response = None
                        for api_attempt in range(max_api_retries):
                            try:
                                continue_response = chat_session.send_message(
                                    continue_prompt,
                                    generation_config=genai.types.GenerationConfig(
                                        temperature=0.1,
                                        max_output_tokens=8192,
                                    )
                                )
                                break
                            except Exception as e:
                                if api_attempt < max_api_retries - 1:
                                    err_str = str(e).lower()
                                    if "429" in err_str or "quota" in err_str or "exhausted" in err_str:
                                        wait_time = (api_attempt + 1) * 15
                                    else:
                                        wait_time = (api_attempt + 1) * 3
                                    print(f"[{page_num + 1}페이지] 이어쓰기 응답 에러 발생 ({e}). {wait_time}초 후 재시도... ({api_attempt + 1}/{max_api_retries})")
                                    time.sleep(wait_time)
                                else:
                                    raise e

                        # 방금 새로 받아온 텍스트에서 마크다운 및 AI의 헛소리(Monologue) 제거
                        # 완전히 새로운 Array를 반환하라고 했으므로 '[' 또는 '{' 앞은 버린다.
                        clean_continue = continue_response.text.strip()
                        if '```' in clean_continue:
                            parts = clean_continue.split('```')
                            for p in parts:
                                p_clean = p.strip()
                                if p_clean.startswith('json'):
                                    clean_continue = p_clean[4:].strip()
                                    break
                                elif p_clean and not p_clean.startswith('Wait') and not p_clean.startswith('Here'):
                                    clean_continue = p_clean
                                    break

                        # 💡 핵심 버그 수정 2: 제미나이가 배열 시작 `[` 앞에 이상한 텍스트 또는 
                        # `[탐색된 문제 번호: 13, 14]` 같은 가짜 배열(Preamble)을 덧붙이는 경우 완벽 제거!
                        # 진짜 JSON 배열의 시작 기호인 `[` 뒤에 곧바로 `{` 가 나오는 패턴을 찾습니다.
                        real_start_idx = -1
                        # 1. `[{` 나 `[ \n {` 형태 찾기
                        match = re.search(r'\[\s*\{', clean_continue)
                        if match:
                            real_start_idx = match.start()
                        else:
                            # 2. 정규식 실패시 그냥 제일 마지막에 등장한 `[` 를 찾는다. (가짜 preamble을 피하기 위해)
                            # 보통 Preamble은 `[탐색된...]` 이고 그 다다음 줄에 진짜 `[` 가 나오기 때문.
                            real_start_idx = clean_continue.rfind('[')
                            if real_start_idx == -1: # `[` 가 아예 없으면 `{` 라도 찾아본다.
                                real_start_idx = clean_continue.find('{')

                        if real_start_idx != -1:
                            clean_continue = clean_continue[real_start_idx:]
                        else:
                            # JSON 시작을 특정할 수 없다면 에러 방지를 위해 비움
                            clean_continue = ""

                        # 기존 텍스트(full_response_text)의 끝부분 정리
                        if full_response_text.strip().endswith('```'):
                            full_response_text = full_response_text.strip()[:-3].strip()

                        # 💡 핵심 버그 수정: 제미나이가 쓰다 만 마지막 문제 객체의 파편이 남아있으면,
                        # 새 chunk에서 그 문제를 통째로 다시 보내줄 때 파편과 겹쳐서 JSON이 깨진다.
                        # 따라서 기존 텍스트의 마지막에 있는 불완전한 `{` 객체 시작 부분을 찾아 잘라낸다.
                        # 단순히 `{` 를 찾는 것은 수식 내부의 괄호 때문에 매우 위험하므로,
                        # 배열의 마지막 쉼표 `,` 다음에 오는 가장 최근의 `{ "question"` 비스무리한 구조를 찾아서 날린다.
                        # 가장 안전한 방법은 정규식으로 온전한 `{"question"...}` 들을 모두 찾은 뒤,
                        # 마지막으로 완전히 닫히지 않은 찌꺼기가 있다면 그 시작점부터 끝까지 지우는 것이다.
                        last_q_idx = full_response_text.rfind('{"question"')
                        if last_q_idx != -1:
                            # 마지막 '{"question"' 이후로 '}' 가 여러 번 나올 수 있지만, 이 문제 객체가 구조적으로 완벽히 닫혔는지 확인.
                            # 정답은 단순 무식하게 마지막 '{"question"' 블록의 끝이 닫힌 중괄호 '}' 인지 보는 것이다.
                            # 그러나 중간에 토큰이 잘리면 중괄호가 닫히지 않았을 확률이 100%이므로,
                            # 그냥 "가장 마지막으로 나타난 '{"question"' 부터 끝까지 전부" 날린다!
                            # 왜냐하면 프롬프트에서 '방금 완벽하게 끝마치지 못한 문제부터 다시 새 배열로 써라'고 했으므로,
                            # 가장 마지막에 쓰다 만 문제는 무조건 날려야 새 chunk와 중복(또는 파손)이 생기지 않는다.
                            full_response_text = full_response_text[:last_q_idx].strip()
                            # 만약 잘라낸 후 끝이 콤마(,) 였다면 콤마도 지운다
                            if full_response_text.endswith(','):
                                full_response_text = full_response_text[:-1].strip()
                            # 끝이 '}' 가 아니라면 구조가 심하게 깨진 것이므로 좀 더 앞의 콤마나 괄호를 정리한다
                            while full_response_text and not full_response_text.endswith('}') and not full_response_text.endswith('['):
                                full_response_text = full_response_text[:-1].strip()

                        # 새 chunk의 바깥 배열 괄호 '[' 와 ']' 를 벗겨냄 (객체들을 기존 배열에 그대로 이어붙이기 위함)
                        if clean_continue.startswith('['):
                            clean_continue = clean_continue[1:].strip()
                        if clean_continue.endswith(']'):
                            clean_continue = clean_continue[:-1].strip()

                        # 기존 텍스트 마지막의 콤마(,) 누락을 방지하고 새 객체들을 이어붙임
                        # (위에서 불완전한 객체를 지웠으므로 끝은 무조건 닫는 중괄호 '}' 혹은 빈 문자열일 것임)
                        if full_response_text.strip().endswith('}'):
                            full_response_text = full_response_text.strip() + ',\n'
                        else:
                            full_response_text += "\n"

                        full_response_text += clean_continue

                        # 다음 루프 판별을 위해 response 객체를 새 응답으로 교체
                        response = continue_response
                        retries += 1

                    break # 성공적으로 완료되었으므로 재시도 루프 탈출
            except Exception as e:
                print(f"[{page_num + 1}페이지] API 통신 또는 파일 에러 (스킵됨): {e}")
                # 에러 나더라도 임시 파일 및 업로드 파일 삭제 시도
                try: sample_file.delete()
                except: pass
                try: os.remove(temp_pdf_path)
                except: pass
                continue
            
            # 3. 데이터 파싱
            response_text = full_response_text
            
            
            response_text = sanitize_json(response_text)
            
            # DEBUG: 덤프 써드파티 파싱 직전의 텍스트
            with open(f"debug_raw_stitched_page_{page_num+1}.txt", "w", encoding="utf-8") as df:
                df.write(response_text)
            
            # 🚀 궁극의 JSON 파싱 로직 🚀
            # 제미나이가 중간에 "Wait, I need to..." 같은 환각 텍스트를 끼워넣어서 배열(List) 전체 파싱이 깨지는 것을 방지하기 위해,
            # 전체 문자열에서 개별 문제 객체 {...} 만 정규식/브래킷 카운팅으로 하나씩 추출하여 파싱합니다.
            
            def extract_json_objects(text):
                objects = []
                pattern = re.compile(r'\{\s*"question"')
                
                # 모든 {"question" 시작 위치를 미리 찾아둡니다
                start_indices = [match.start() for match in pattern.finditer(text)]
                
                for start_idx in start_indices:
                    success = False
                    brace_count = 0
                    in_string = False
                    escape = False
                    
                    # 문자열 내부의 중괄호 '{', '}' 를 무시하기 위해 문자열 상태(in_string) 추적
                    for i in range(start_idx, len(text)):
                        char = text[i]
                        
                        if not in_string:
                            if char == '{':
                                brace_count += 1
                            elif char == '}':
                                brace_count -= 1
                                if brace_count == 0:
                                    candidate = text[start_idx:i+1]
                                    try:
                                        # 엄격한 제어 문자 허용 로직 추가
                                        obj = json.loads(candidate, strict=False)
                                        objects.append(obj)
                                        success = True
                                        break
                                    except BaseException as je:
                                        # 문자열 파싱 실패 시, 혹시 내부 \n 이나 제어 문자가 문제인지 간단히 치환 후 재시도
                                        try:
                                            cand_clean = re.sub(r'[\x00-\x19]', '', candidate)
                                            obj = json.loads(cand_clean, strict=False)
                                            if "problem_num" not in obj:
                                                obj["problem_num"] = ""
                                            objects.append(obj)
                                            success = True
                                            break
                                        except:
                                            pass
                            elif char == '"':
                                in_string = True
                        else:
                            if escape:
                                escape = False
                            elif char == '\\':
                                escape = True
                            elif char == '"':
                                in_string = False
                                
                    if not success:
                        # 끝이 잘린 객체일 경우 강제 복구 시도 (정말 최후의 수단)
                        obj_str = text[start_idx:]
                        # 뒤에 이상한 헛소리 쓰레기 텍스트가 붙었을 수 있으므로 대충 마지막 직전 쌍따옴표 근처에서 잘라봄
                        last_quote = obj_str.rfind('"')
                        if last_quote != -1:
                            obj_str = obj_str[:last_quote+1]
                            
                        for _ in range(5):
                            try:
                                cand_clean = re.sub(r'[\x00-\x19]', '', obj_str + "}")
                                obj = json.loads(cand_clean, strict=False)
                                objects.append(obj)
                                print(f"⚠️ 강제 닫힘 복구형 객체 추가 완료!")
                                break
                            except:
                                obj_str += '"'
                                
                return objects

            def get_unique(objs):
                uniq = []
                seen = set()
                for obj in objs:
                    q_text = obj.get("question", "").strip()
                    expl_text = obj.get("explanation", "").strip()
                    
                    # 질문 내용이 아예 없거나 해설이 누락된 불량 객체 제거 (강제 복구 트리거용)
                    if not q_text or not expl_text:
                        continue
                        
                    if q_text not in seen:
                        seen.add(q_text)
                        uniq.append(obj)
                return uniq

            extracted_objs = get_unique(extract_json_objects(response_text))
            
            # --- Validation Loop 시작 ---
            expected_count = -1
            preamble_match = re.search(r'\[탐색된 문제 번호:\s*(.*?)\]', response_text)
            if preamble_match:
                num_str = preamble_match.group(1)
                nums = [x.strip() for x in num_str.split(',') if x.strip()]
                expected_count = len(nums)
                
            validation_retries = 0
            while expected_count != -1 and expected_count > 0 and len(extracted_objs) < expected_count and validation_retries < 3:
                missing_count = expected_count - len(extracted_objs)
                print(f"[{page_num + 1}페이지] ⚠️ 누락 발생! 탐색된 문제 {expected_count}개 중 {len(extracted_objs)}개 파싱됨. 누락된 {missing_count}개 강제 재요청 중... (시도 {validation_retries + 1})")
                
                regen_prompt = f"""🚨 [SYSTEM OVERRIDE: MISSING PROBLEM RECOVERY] 🚨
이전 출력에서 당신이 처음에 탐색한 문제는 총 {expected_count}개였지만, 실제로 출력한 JSON 배열의 객체는 {len(extracted_objs)}개뿐이었습니다. ({missing_count}개 누락됨)
가장 마지막에 출력했던 문제 이후에 누락된 나머지 문제들만 **완전히 새로운 JSON 배열 `[...]`** 형식으로 다시 출력해 주세요.
어떠한 혼잣말(Scratchpad)도 쓰지 말고 오직 순수한 JSON 문자열만 반환해야 합니다."""

                try:
                    regen_resp = chat_session.send_message(
                        regen_prompt,
                        generation_config=genai.types.GenerationConfig(temperature=0.1, max_output_tokens=8192)
                    )
                    regen_text = regen_resp.text
                    new_objs = extract_json_objects(regen_text)
                    if new_objs:
                        extracted_objs.extend(new_objs)
                        extracted_objs = get_unique(extracted_objs)
                        print(f" => 누락 복구 성공! (누적 {len(extracted_objs)}개 / 목표 {expected_count}개)")
                except Exception as e:
                    print(f"[{page_num + 1}페이지] 누락 재확인 통신 실패: {e}")
                
                validation_retries += 1
            # --- Validation Loop 끝 ---

            unique_objs = extracted_objs
            if unique_objs:
                print(f" => [{page_num + 1}페이지]에서 최종적으로 {len(unique_objs)}문제 파싱 및 병합 완료.")
                all_problems.extend(unique_objs)
            else:
                # 정규식 패턴에 안 맞을 때를 대비한 최후의 Fallback (통풍 파싱 시도)
                try:
                    # 배열의 시작과 끝만 잘라서 시도
                    first_bracket = response_text.find('[')
                    last_bracket = response_text.rfind(']')
                    if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
                        fallback_text = response_text[first_bracket:last_bracket+1]
                        problems = json.loads(fallback_text, strict=False)
                        if problems:
                            all_problems.extend(problems)
                            print(f" => [{page_num + 1}페이지]에서 {len(problems)}문제 성공적 추출 완료.")
                except Exception as e:
                     print(f"[{page_num + 1}페이지] 치명적 파싱 에러 (모든 복구 실패): {e}")
            
            # 4. 루프 마무리 (파일 정리)
            try:
                sample_file.delete()
            except:
                pass
            try:
                os.remove(temp_pdf_path)
            except:
                pass

        print(f"\n최평적으로 총 {len(all_problems)}개의 문제가 추출되었습니다!")
        
        # --- 문제 번호표 기반 스마트 정렬 로직 ---
        def get_sort_key(prob):
            num_str = prob.get("problem_num", "")
            if not num_str:
                return (99, 999999) # 번호가 없으면 맨 뒤로
            
            # 서답/서술/단답형 식별
            is_essay = any(keyword in num_str for keyword in ["서답", "서술", "단답", "주관"])
            group = 2 if is_essay else 1
            
            # 문자열 안에서 숫자만 추출
            digits = re.findall(r'\d+', num_str)
            if digits:
                num_val = int(digits[0])
            else:
                num_val = 999999
                
            return (group, num_val)

        try:
            sorted_problems = sorted(all_problems, key=get_sort_key)
            print("🚀 문제 번호 기반 스마트 정렬이 완료되었습니다.")
            return sorted_problems
        except Exception as e:
            print(f"⚠️ 문제 정렬 중 오류 발생 (기본 순서로 반환): {e}")
            return all_problems

if __name__ == "__main__":
    pass
