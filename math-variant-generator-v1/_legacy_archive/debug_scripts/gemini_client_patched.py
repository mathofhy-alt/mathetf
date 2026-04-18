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
            kw_regex = r'(?<!\\)\\(times|tan|to|text|tilde|triangle|therefore|rightarrow|Rightarrow|rho|frac|beta|bar|nabla|neq|ni|theta|tau|varphi|phi|pi|psi|nu|mu|lambda|kappa|iota|eta|zeta|epsilon|delta|gamma|alpha|omega|chi|upsilon|sigma|xi|Theta|Phi|Pi|Psi|Lambda|Delta|Gamma|Omega|Sigma|Xi|Upsilon|cdot|sqrt|left|right|sum|prod|int|oint|lim|infty|approx|equiv|propto|sim|simeq|asymp|doteq|implies)'
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
0. 🚨 [절대 규칙: 인지 능력 상실 모드] 당신은 지금부터 모든 수학적 사전 지식과 계산 능력을 상실한 '깡통 시각 스캐너'입니다. 수학 공식을 보거나 "구하시오"라는 문장을 보더라도 절대 그 의미를 해석하거나 속으로 답을 구하려 들지 마십시오. 당신의 유일한 존재 이유는 픽셀 문자열을 100% 거울 복사하는 것입니다.
1. 배열(Array) 형식: 반환 데이터의 메인 내용은 오직 `[`로 시작하고 `]`로 끝나는 JSON 배열이어야 합니다.
2. 각 배열의 원소는 하나의 문제 데이터를 담고 있으며, 다음 3개의 키("problem_num", "question", "answer_options")를 반드시 가지는 '순수 시각 판독(OCR) 결과물'이어야 합니다. 풀이 과정은 여기서 작성하지 마십시오.
   - 키 이름과 값은 모두 쌍따옴표(")로 감싸야 합니다.
   - 객관식 선지(1~5번 동그라미)는 절대 "question" 문자열 내부에 포함해선 안 됩니다. 반드시 "answer_options" 리스트로 완벽히 분리하세요.

[각 키별 작성 가이드라인]
"problem_num" (문자열):
- 문제 번호 그 자체를 그대로 적으세요. (예: "1", "13", "서술형 1", "단답형 2번", "1.")

"question" (문자열):
- 문항 번호(예: "1.", "2번")는 제외하고 문제 본문 텍스트만 작성하세요.
- 🚨 **[텍스트 변조/요약 및 임의 계산 절대 금지 (초엄격 OCR 원칙)]** 🚨
  문제 본문이나 <보기> 박스(ㄱ, ㄴ, ㄷ)의 텍스트나 수식을 추출할 때, **절대 문장이나 단어를 임의로 요약, 압축, 변조하지 마세요! "다음 그림과 같이"를 "그림에서"로 바꾸거나, "구하시오"를 "구하여라"로 바꾸는 등 조사나 어미 하나라도 원본과 다르게 쓰면 절대 안 됩니다. 오직 사진에 적힌 글자 토씨 하나 틀리지 않고 100% 동일하게 타이핑하는 '단순 복사기' 역할을 수행하세요.** 또한, 당신이 미리 머릿속으로 문제를 풀어서 수식을 몰래 고쳐 쓰거나 정답에 맞게 변형하는 행위를 강력히 금지합니다.
  당신은 문제를 푸는 출제자가 아니라, 사진에 적힌 글씨를 그대로 옮겨 적는 '타이피스트 컴 스캐너'입니다. 사진에 명백한 오류가 있어 보이더라도 무조건 사진에 있는 그대로 100% 똑같이 전사하세요. (예: 사진에 `x \\le 5` 라 적혀 있는 것을 혼자 푼 정답에 맞춰보겠다고 `x \\le 0` 으로 마음대로 고치지 마세요!)
- 🚨 **[초비상 절대 누락 금지 주의]** 원본 문제에 분명히 본문 텍스트가 존재함에도 불구하고 AI가 임의로 판단하여 `question` 필드를 빈칸(`""`)으로 날려버리는 것은 최악의 시스템 오류입니다! 문제 본문 전체를 단 한 글자도 빠짐없이 100% 추출하세요.
- 이미지 내의 그림이나 그래프 표 안에 적힌 텍스트와 수식도 절대로 무시하지 말고 전부 추출하십시오. 단, 그림의 기하학적 의미를 해석하거나 설명하려 하지 말고 오직 '보이는 글자와 숫자'만 추출하세요.
- 객관식 선지(①, ②, ③, ④, ⑤ 등)는 **절대 이 안에 넣지 마세요**. 오직 문제를 묻는 본문까지만 포함합니다.
    
"answer_options" (문자열 배열):
- 객관식 문제인 경우에만 각 선지의 텍스트를 배열로 담습니다.
- 객관식이 아닌 주관식/서술형 문제일 경우 빈 배열 `[]`을 기본값으로 넣습니다.
- 선지 번호 기호(①, ② 등)도 유지하면서 문자열로 추출합니다.
- **[매우 중요]** 선지 번호 기호를 제외한 모든 숫자, 분수, 기호, 수식은 반드시 `[[EQUATION:...]]`으로 감싸야 합니다!
- 🚨 **[문항 본문 특별 주의]** `question` 필드 안에서도 **'수식'과 '숫자'만** 예외 없이 `[[EQUATION:...]]` 태그로 감싸야 합니다. **단, 한글 문장이나 텍스트를 통째로 태그 안에 넣지 마세요.** (올바른 예: `[[EQUATION:f(x)]]는 짝수이다` / 틀린 예: `[[EQUATION:f(x)는 짝수이다]]`)
- 🚨 **[치명적 태그 오류 주의]** 태그를 열 때는 `[[EQUATION:` 로 열고, 닫을 때는 `]]` 로 정확하게 닫아야 합니다.
- 예시: `["① [[EQUATION:12]]", "② [[EQUATION:1 over 2]]", "③ [[EQUATION:2 root 3]]"]`

[🚨 텍스트 추출 핵심 규칙 🚨]
- 🚨 **[가장 중요한 초정밀 전사 원칙 - 0% 환각, 100% 거울 복사]** 🚨
  원본 이미지에 적힌 **숫자, 부호(+, - 등), 기호, 괄호**를 단 하나라도 AI가 임의로 바꾸거나, 빼먹거나, 새로운 것을 추가하는 순간 치명적인 시스템 오류로 간주됩니다! 타이핑 후 숫자와 부호가 원본과 일치하는지 두 번 세 번 검수하세요!!

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
  - 집합 조건제시법: 원본 문제에 `{ x | ... }` 형태가 있다면, `LEFT { x | ... RIGHT }` 형태로 작성하세요.
  - 그리스 문자: alpha, beta, gamma, theta 등 (절대 백슬래시 사용 금지)
  - 예시 1: "이차함수 [[EQUATION:y = x^{2} + 2x + 1]]의 최솟값은?"
  - 예시 2: "[[EQUATION:alpha + beta = 3]]일 때, [[EQUATION:alpha over beta]]의 값을 구하시오."
  - 변수 하나(예: x, a, n)나 단순 숫자(예: 0, 1, 2)라도 수식 태그로 감싸십시오. (예: "[[EQUATION:x]]의 값은 [[EQUATION:3]]이다.")
- 🚨 **[태그 형태 절대 엄수]** 반드시 `[[EQUATION:수식]]` 형태로 작성해야 합니다. `EQUATION:` 글자를 빼먹고 `[[수식]]` 처럼 대괄호만 쓰면 시스템이 파괴됩니다!
- 🚨 **[초비상 규정] 명심하세요! 숫자 하나(예: 1, 2, 0, 3)나 단순 알파벳 변수(예: a, x, y, f)가 나오는 아주 짧고 사소한 순간조차도 무조건 [[EQUATION:1]], [[EQUATION:x]] 처럼 예외 없이 감싸야 합니다.** (예: "[[EQUATION:x]]의 값은 [[EQUATION:3]]이다.") 텍스트로 숫자를 그대로 노출하는 것은 치명적인 오류입니다.
- 🚨 **괄호가 복잡하게 얽힌 수식이나 길이가 긴 다항식, 분수식 등도 중간에 끊지 말고 통째로 `[[EQUATION:...]]` 단 하나로 완벽하게 감싸야 합니다. 긴 수식을 절대로 텍스트 공간에 방치하지 마세요.**
- 🚨 **절대로 "x가 1보다 크다" 라고 텍스트로 적지 마세요. 무조건 "[[EQUATION:x > 1]]이다" 라고 적어야 합니다.**
- 🚨 **[한글 문장 태그 감싸기 절대 금지] '수식'과 '숫자'만 태그로 감싸고, 한글 문장이나 텍스트를 통째로 `[[EQUATION:...]]` 태그 안에 넣지 마세요! (HWP 수식 편집기가 한글을 인식하지 못하고 깨뜨립니다)**
- 🚨 **[백슬래시 문법 절대 금지]** 수식 블록 안에서 `\frac`, `\alpha`, `\left` 등 어떤 이유로든 백슬래시(`\`)를 단 하나라도 사용하면 치명적인 규정 위반입니다. 오직 한글 수식 (HWP) 문법만 사용하십시오.
- 🚨 **[최종 자체 검수 필수 (수식 점검)]**: JSON으로 응답을 출력하기 직전에, 본인이 작성한 모든 수식(`[[EQUATION:...]]`)을 다시 한번 전수조사하여 LaTeX 잔재(예: 백슬래시 기호 등)가 남아있는지 검사하세요. 만약 백슬래시(`\`)나 LaTeX 문법이 발견되면 반드시 HWP 표준 구문으로 수정한 뒤에 최종 JSON을 반환하세요.
- **다항식 지수(거듭제곱) 표기 시 절대 주의**: `x^{2}+x+1` 또는 `x^2+x+1` 처럼 지수 부분만 정확히 적용해야 하며, 절대로 뒤의 수식까지 몽땅 묶어서 `x^{2+x+1}`처럼 지수 위로 올려버리는 오류를 범하지 마세요!
- 🚨 **[조건문/조각함수(cases) 절대 표기 규칙]** 🚨
  `cases { ... }` 형태로 한글 수식 문법에 맞게 조건 분기 함수를 작성하세요. 절대로 `\begin{cases}` 같은 LaTeX 문법을 쓰지 마세요.
- 🚨 **[객관식 선지 중복 기재 절대 금지]** 🚨
  `question` 필드 본문 텍스트 안에는 ①, ②, ③, ④, ⑤ 와 같은 객관식 선지 내용이 **절대로, 단 한 글자도 들어가서는 안 됩니다.**
  선지가 문제지 원본 사진의 맨 밑에 붙어 있더라도, 무조건 싹둑 잘라내어 오직 `answer_options` 배열 안으로만 완벽하게 분리 격리시키세요. 본문과 배열 양쪽에 선지가 중복으로 출력되는 것은 심각한 시스템 오류를 발생시킵니다.
- 🚨 **[마크다운 백틱(\`\`) 절대 금지]**: 수식을 감쌀 때 마크다운 백틱 기호(\` 또는 \`\`\`)를 절대 사용하지 마세요! 오직 `[[EQUATION:...]]` 태그만 허용됩니다. (틀린 예: \`x+1\`, 올바른 예: [[EQUATION:x+1]])
- 🚨 **[<보기> 박스 문항 특별 주의 (선지와 혼동 금지!)]** 🚨
  <보기> 상자 안에 제시된 'ㄱ. ...', 'ㄴ. ...', 'ㄷ. ...' 등의 내용은 **반드시 문제 본문(question 필드)의 끝부분에 모두 포함하여 100% 전사**해야 합니다. 절대 객관식 선지 배열로 분리하거나 누락하지 마세요.
  🚨 **[보기 내용 스스로 평가/풀이 절대 금지]** `<보기>`에 주어진 명제나 수식을 당신이 먼저 머릿속으로 풀어서 '참/거짓'을 판별해 변조하거나, 수식을 정리(단순화)해서 적지 마세요! 오직 픽셀에 적힌 글자 그대로 100% 타이핑해야 합니다.

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
}

지금 바로 페이지 분석결과를 JSON Array로 엄격하게 출력하세요. 절대 한국어 혼잣말을 섞지 마세요."""
                
                # 🚀 긴 출력(토큰 리밋)에 대응하기 위해 ChatSession 기반으로 연속 생성 처리
                for page_retry_idx in range(3):
                    chat_session = self.model.start_chat(history=[])

                    # API 호출 재시도 로직 (400 Expired, 429 Quota 등 일시적 에러 대비)
                    max_api_retries = 3
                    response = None
                    for api_attempt in range(max_api_retries):
                        try:
                            # 🚨 OCR Pass 1에는 LEVEL_INSTR (수학 풀이 지시)를 주입하지 않습니다.
                            response = chat_session.send_message(
                                [sample_file, prompt],
                                generation_config=genai.types.GenerationConfig(
                                    temperature=0.0,
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
                # 문제 번호나 question 등 어떤 키로 시작하든 중괄호를 잡습니다.
                pattern = re.compile(r'\{\s*"(?:question|problem_num)"')
                
                # 모든 시작 위치를 찾습니다
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
                print(f" => [{page_num + 1}페이지] 1차 순수 OCR 추출 완료 ({len(unique_objs)}문제). 2차 수학적 해설 생성 진입...")
                
                # 기존 OCR 데이터는 불변의 '절대 진리'로 잠금(Lock) 처리하여, 2차 AI가 수식을 고치는 것을 물리적으로 차단합니다.
                ocr_locked_text = json.dumps(unique_objs, ensure_ascii=False, indent=2)
                
                verification_prompt = f"""🚨 [SYSTEM OVERRIDE: MATH SOLVER MODE] 🚨
당신은 최고의 수학 교재 해설 작성자입니다.
1차 시각 판독 엔진이 다음 이미지로부터 완벽한 100% 정확도로 텍스트를 추출했습니다:
{ocr_locked_text}

[당신의 유일한 임무]
위 JSON에 나열된 각 문제에 대하여, 주어진 이미지를 참고하여 심도있는 풀이 과정과 해설을 작성한 후 아래 3개의 키("problem_num", "thought_process", "explanation")만 포함된 JSON 배열 형식(`[...]`)으로 출력하십시오.
(절대 "question"이나 "answer_options" 키를 중복해서 출력하거나 임의로 텍스트를 수정하지 마십시오.)

"problem_num" (문자열): 
- 위 텍스트에 있는 문제 번호를 그대로 적어 매칭시키세요.

"thought_process" (문자열):
- 🚨 **[가장 중요한 필수 지시]** 이곳에 주어진 원본 문제의 모든 조건을 한 줄씩 해석하고 식을 세우는 '모든 중간 과정'을 단 하나도 빠짐없이 전부 작성하세요!
- 머릿속으로 암산하여 수식을 비약하거나, 중간에 "이러이러하게 되어"식으로 뭉뚱그려 넘어가는 행위, 또는 밑도 끝도 없이 출처를 알 수 없는 정체불명의 수식을 '지멋대로' 튀어나오게 하는 행위는 지독한 환각(Hallucination) 오류입니다! 
- 반드시 1단계, 2단계, 3단계 논리적 비약 없이 칠판에 판서하듯 과정을 빼곡하게 적어내야 합니다.

"explanation" (문자열):
- 위 'thought_process'에서 완벽하게 검산이 끝난 풀이 과정을 바탕으로, 학생이 보고 100% 이해할 수 있도록 아주 상세하고 친절한 '해설지 본문'을 이 필드에 작성합니다.
- 🚨 **[단답형/찍기 수식 절대 금지!]** 해설의 내용이 단순히 공식 하나 달랑 적혀있거나, 풀이 없이 정답 수식만 띡 하고 적혀있는 것(예: "[[EQUATION:g(t)=t+a]]")은 최악의 치명적 시스템 오류입니다. 모든 논리적 전개 스텝(조건 분석 -> 식 세우기 -> 계산 -> 정답 도출)을 반드시 한 줄씩 명확하고 길게 서술해야 합니다.
- 🚨 **해설은 반드시 해라체(-다, -이다, -한다)를 사용하세요.** (예: "구할 수 있다.", "성립한다.")
- 불필요한 서론이나 인사말을 절대 피하고 오직 수학적 개념과 연산 과정 위주로 건조하게 작성하세요.
- 각 전개 스텝을 명확하게 한 줄씩 나열하세요.
- **[매우 중요]** 해설의 맨 마지막 문장은 반드시 **"따라서 정답은 [최종답안]입니다."** 형태로 끝맺어야 합니다. (객관식은 "따라서 정답은 ②입니다.", 주관식은 "따라서 정답은 [[EQUATION:5\\sqrt{{2}}]]입니다.")
- 모든 수식은 통일되게 HWP 포맷 [[EQUATION:수식]] 형식으로 감싸야 합니다.

[수식 포맷팅 (매우 중요)]
- 모든 수학 수식, 변数, 숫자, 기호는 절대 일반 텍스트로 쓰지 말고, 반드시 아래의 특수 태그 형식으로 감싸야 합니다.
  [[EQUATION:수식]]
- 수식 내부 문법은 한컴오피스 수식표기법(LaTeX와 유사)을 따릅니다.
  - 분수: {{분자}} over {{분모}}
  - 제곱: x^{{2}}
  - 루트: sqrt{{x}}
  - 거듭제곱근: root {{n}} of {{x}}
  - 부등호: <, >, <=, >=
  - 그리스 문자: alpha, beta, gamma, theta 등 (절대 백슬래시 사용 금지)
- 🚨 **[백슬래시 문법 절대 금지]** 수식 블록 안에서 백슬래시(`\\`)를 단 하나라도 사용하면 치명적인 규정 위반입니다.
- 🚨 **[조건문/조각함수(cases) 표기 규칙]** `cases {{ ... }}` 형태로 한글 수식 문법에 맞게 조건 분기 함수를 작성하세요.

"""
                if "고1" in getattr(self, "curriculum", "고1"):
                    level_instr = "**[제한 사항] 대한민국 고등학교 1학년(고1) 공통수학 교육과정 수준 내에서만 무조건 해결하세요. 절대로 고2/고3 과정(수1, 수2, 미적분, 확통 등)의 선행 개념을 쓰지 마세요.** (예: 상용로그, 삼각함수, 수열, 미분, 적분 등 절대 금지). **특히 복소수(i) 거듭제곱 문제 등에서 극좌표계나 삼각함수(sin, cos), 오일러 공식을 쓰면 절대 안 됩니다. 무조건 직접 대수적으로 식을 전개하여 푸는 1학년 방식을 쓰세요.**"
                else:
                    level_instr = "**[제한 사항] 대한민국 고등학교 2학년/3학년(수1, 수2, 선택과목) 교육과정 수준 내에서 해결하세요.** 단, 대학교 서적에 나오는 극좌표계, 로피탈의 정리, 테일러 급수 등 대학 수학 개념은 절대 금지합니다."

                verification_prompt += f"\n\n🚨 {level_instr}\n\n오직 `problem_num`, `thought_process`, `explanation` 키만 가진 순수한 JSON Array 객체를 반환하세요! (마크다운 불필요)"

                verify_retries = 3
                verified_objs = None
                
                for v_attempt in range(verify_retries):
                    try:
                        verify_session = self.model.start_chat(history=[])
                        verify_resp = verify_session.send_message(
                            [sample_file, verification_prompt],
                            generation_config=genai.types.GenerationConfig(temperature=0.1, max_output_tokens=8192)
                        )
                        v_text = sanitize_json(verify_resp.text)
                        
                        v_parsed = extract_json_objects(v_text)
                        
                        if not v_parsed:
                            try:
                                first_bracket = v_text.find('[')
                                last_bracket = v_text.rfind(']')
                                if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
                                    v_parsed = json.loads(v_text[first_bracket:last_bracket+1], strict=False)
                            except:
                                pass
                                
                        if v_parsed and len(v_parsed) >= len(unique_objs) * 0.8: # 80% 이상 보존
                            verified_objs = get_unique(v_parsed)
                            print(f" => [{page_num + 1}페이지] 2차 해설(Solve) 생성 성공! ({len(verified_objs)}문제)")
                            break
                        else:
                            print(f" => 2차 해설 파싱 실패. 재시도 중... ({v_attempt+1}/{verify_retries})")
                            time.sleep(3)
                    except Exception as ve:
                        print(f" => 2차 API 호출 에러: {ve}. 재시도 중... ({v_attempt+1}/{verify_retries})")
                        time.sleep(5)
                
                if verified_objs:
                    # ✅ 성공적으로 해설이 생성된 객체를 1차 OCR 데이터와 병합(Merge)
                    merged_objs = []
                    for orig_obj in unique_objs:
                        p_num = orig_obj.get("problem_num", "").strip()
                        # problem_num 으로 매칭되는 해설 찾기
                        match = next((v for v in verified_objs if v.get("problem_num", "").strip() == p_num), None)
                        
                        if match:
                            orig_obj["thought_process"] = match.get("thought_process", "")
                            orig_obj["explanation"] = match.get("explanation", "")
                        else:
                            orig_obj["thought_process"] = "해설 매칭 실패"
                            orig_obj["explanation"] = "문제 풀이(해설) 생성 중 오류가 발생했습니다."
                            
                        # 필요 없는 항목 정리 (확실히 병합하기 위해)
                        merged_objs.append({
                            "problem_num": orig_obj.get("problem_num", ""),
                            "question": orig_obj.get("question", ""),
                            "answer_options": orig_obj.get("answer_options", []),
                            "thought_process": orig_obj.get("thought_process", ""),
                            "explanation": orig_obj.get("explanation", "")
                        })
                    all_problems.extend(merged_objs)
                else:
                    print(f" => [{page_num + 1}페이지] 2차 해설 최종 실패 (Fallback).")
                    for orig_obj in unique_objs:
                        orig_obj["thought_process"] = ""
                        orig_obj["explanation"] = "API 에러로 인해 해설을 생성하지 못했습니다."
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
