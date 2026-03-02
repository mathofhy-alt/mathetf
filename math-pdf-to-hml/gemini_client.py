import os
import google.generativeai as genai
from typing import List, Dict
import json
import re
from pypdf import PdfReader, PdfWriter
import tempfile

class GeminiMathParser:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-3-flash-preview')
        
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
            
            temp_pdf_fd, temp_pdf_path = tempfile.mkstemp(suffix='.pdf')
            os.close(temp_pdf_fd) # 파일 디스크립터 닫기
            
            try:
                with open(temp_pdf_path, 'wb') as f:
                    writer.write(f)
                    
                # 2. 임시 1장짜리 PDF 업로드
                sample_file = genai.upload_file(path=temp_pdf_path)
                
                prompt = """
                당신은 시중 출판되는 수학 교재(자이스토리, 쎈 등) 수준의 정교한 해설 타이핑 전문가입니다.
                업로드된 1장짜리 PDF 페이지에 있는 '모든 수학 문제'를 빠짐없이 번호 순서대로 추출하여 오직 JSON 리스트 형식으로만 응답하세요. (만약 이 페이지에 문제가 전혀 단 1개도 없다면 빈 배열 `[]`을 응답하세요)
                
                🚨 [매우 중요 경고] 🚨
                가끔 수식(분수, 도형, 극한 등)이 너무 복잡하다는 이유로 AI가 해당 문항을 임의로 건너뛰는(누락하는) 치명적인 오류가 발생하고 있습니다!
                화면에 보이는 '문항 번호'를 1개도 빠짐없이 순차적으로 확인하고, 아무리 수식이 복잡하거나 길더라도 절대 1문제도 건너뛰지 마세요. 완벽하게 모든 문항을 JSON에 담아내는 것이 당신의 최우선 임무입니다.
                
                각 문제 객체는 다음 필דים만 포함해야 합니다:
                1. "question": 문제 본문. 수식은 HWP 포맷으로 [[EQUATION:수식]] 처리.
                2. "answer_options": (객관식일 경우) 선택지 배열 (없으면 []).
                3. "explanation": 시중 교재 해설지 수준의 매우 상세하고 친절한 풀이 과정. 수식 포함.
                
                [🚨 해설지(Explanation) 작성 핵심 규칙 🚨]
                - **API 토큰 초과로 인한 응답 끊김을 막기 위해, 해설은 반드시 3~4문장 이내로 아주 핵심만 폭풍 요약하여 매우 짧게 적어주세요.**
                - 대한민국 고등학교 1학년 수학(수학 상, 수학 하) 교육과정 수준에 완벽히 맞게 적으세요. 고1 범위를 벗어나는 공식(예: 로피탈, 미적분학의 기본정리)은 절대 쓰지 마세요.
                - 해설이 너무 길어지면 시스템이 멈춥니다. 가장 중요한 핵심 수식 전개 과정 1~2개만 압축해서 간결하게 보여주세요.
                
                [🚨 최고 우선순위 JSON 문법 및 수식 표기 규칙 🚨]
                - 이 페이지에 보이는 모든 번호의 문제는 무조건 1개도 누락 없이 100% 추출해야 합니다. **절대로 마지막 몇 개 문제를 임의로 누락하거나 생략하지 마세요! 페이지 끝까지 모두 작성해야 합니다.**
                - **다항식 지수(거듭제곱) 표기 시 절대 주의**: `x^{2}+x+1` 또는 `x^2+x+1` 처럼 지수 부분만 정확히 적용해야 하며, 절대로 뒤의 수식까지 몽땅 묶어서 `x^{2+x+1}`처럼 지수 위로 올려버리는 끔찍한 오류를 범하지 마세요!
                - 수식 백슬래시(\\)는 무조건 두 개(\\\\)로 이스케이프해야 파이썬이 읽을 수 있습니다. (예: [[EQUATION:\\\\alpha + \\\\beta]])
                """
                
                response = self.model.generate_content(
                    [sample_file, prompt],
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.1,
                        max_output_tokens=32768,
                    )
                )
                
            except Exception as e:
                print(f"[{page_num + 1}페이지] API 통신 또는 파일 에러 (스킵됨): {e}")
                # 에러 나더라도 임시 파일 및 업로드 파일 삭제 시도
                try: sample_file.delete()
                except: pass
                try: os.remove(temp_pdf_path)
                except: pass
                continue
            
            # 3. 데이터 파싱
            response_text = response.text.strip()
            
            # 💡 [분석결과] 텍스트가 있으면 그걸 기준으로 뒤쪽 절반만 취함
            if '분석결과' in response_text:
                parts = response_text.split('분석결과', 1)
                response_text = parts[-1]
                
            # 가장 처음 나오는 '[' 와 가장 마지막에 나오는 ']'를 찾아 사이만 안전 파싱
            first_bracket = response_text.find('[')
            last_bracket = response_text.rfind(']')
            if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
                response_text = response_text[first_bracket:last_bracket+1]
                
            response_text = sanitize_json(response_text)
            
            try:
                problems = json.loads(response_text, strict=False)
                if problems:
                    all_problems.extend(problems)
                    print(f" => [{page_num + 1}페이지]에서 {len(problems)}문제 성공적 추출 완료.")
                else:
                    print(f" => [{page_num + 1}페이지]에 추출할 문제가 발견되지 않았습니다.")
            except Exception as e:
                # 뒷부분 잘림(Truncation) 복구 로직 - 1장씩 하므로 거의 발생 안하지만 안전장치로 유지
                fixed_text = response_text
                recovered = False
                while fixed_text:
                    last_brace = fixed_text.rfind('}')
                    if last_brace == -1:
                        break
                    attempt_text = fixed_text[:last_brace+1] + '\n]'
                    try:
                        problems = json.loads(attempt_text, strict=False)
                        print(f"⚠️ [{page_num + 1}페이지] JSON 잘림 복원 진행. ({len(problems)}개 추출)")
                        if problems:
                            all_problems.extend(problems)
                        recovered = True
                        break
                    except Exception:
                        fixed_text = fixed_text[:last_brace]
                
                if not recovered:
                    print(f"[{page_num + 1}페이지] 파싱 에러 (복구 실패): {e}")
            
            # 4. 루프 마무리 (파일 정리)
            try:
                sample_file.delete()
            except:
                pass
            try:
                os.remove(temp_pdf_path)
            except:
                pass

        print(f"\n최종적으로 총 {len(all_problems)}개의 문제가 추출되었습니다!")
        return all_problems

if __name__ == "__main__":
    pass
