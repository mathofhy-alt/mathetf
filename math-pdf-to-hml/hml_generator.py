import os
from template_data import BASE_HML_TEMPLATE

class HMLGenerator:
    def __init__(self):
        self.problems_hml = []
        self.eq_inst_id = 1000000000
        self.eq_z_order = 1000
        
    def add_problem(self, problem_data: dict, index: int):
        """
        문제 데이터를 HML 조각으로 변환하여 리스트에 추가합니다.
        문단(P) 당 하나의 TEXT 태그만 가지는 가장 단순하고 안전한 구조를 지향합니다.
        """
        # 본문 시작 & 미주(ENDNOTE) 기호를 문제 텍스트 맨 앞에 배치
        problem_str = f'<P ParaShape="1" Style="0"><TEXT CharShape="0">'
        
        # 해설(ENDNOTE) 객체를 맨 앞에 생성
        problem_str += '<ENDNOTE><PARALIST LineWrap="Break" LinkListID="0" LinkListIDNext="0" TextDirection="0" VertAlign="Top"><P ParaShape="1" Style="0"><TEXT CharShape="0"><AUTONUM Number="1" NumberType="Endnote"><AUTONUMFORMAT SuffixChar=")" Superscript="false" Type="Digit"/></AUTONUM><CHAR> </CHAR></TEXT></P><P ParaShape="1" Style="0"><TEXT CharShape="0">'
        problem_str += self._parse_text_to_hml("[해설] " + problem_data['explanation'])
        problem_str += '</TEXT></P></PARALIST></ENDNOTE>'
        
        # 미주 번호 뒤에 바로 이어서 AI가 생성한(또는 원본 PDF 상의) 문제 텍스트를 출력
        import re
        # 원본 PDF나 AI가 붙인 1., 1), (1) 등 매뉴얼 번호 및 공백 제거
        # 제미나이가 번호를 [[EQUATION:1)]] 처럼 감쌀 수도 있으므로 이 경우(숫자만 있는 수식)도 제거
        q_clean = re.sub(r'^(?:\s*\[\[EQUATION:\s*\d+[\.\)]\s*\]\]\s*|\s*\(\d+\)\s*|\s*\[\d+\]\s*|\s*<\d+>\s*|\s*\d+[\.\)]\s*)+', '', problem_data['question'], count=1)
        # 혹시 '1)' 모양의 텍스트가 앞에 남았다면 한 번 더 확실히 제거
        q_clean = re.sub(r'^(?:\(\d+\)|\d+[\.\)]|\s)+', '', q_clean)
        
        problem_str += self._parse_text_to_hml(" " + q_clean)
        problem_str += "</TEXT></P>\n"
        
        # 선택지 추가
        if 'answer_options' in problem_data and problem_data['answer_options']:
            circle_nums = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']
            options = problem_data['answer_options']
            for row_start in range(0, len(options), 3):
                chunk = options[row_start:row_start+3]
                problem_str += f'<P ParaShape="1" Style="0"><TEXT CharShape="0">'
                
                for j, opt in enumerate(chunk):
                    idx = row_start + j
                    opt_clean = re.sub(r'^(?:\(\d+\)|\d+[\.)]|①|②|③|④|⑤|\s)+', '', opt)
                    prefix = circle_nums[idx] if idx < len(circle_nums) else f"({idx+1})"
                    
                    # 사용자가 직접 간격을 조정하기 위해 프로그램 단의 인위적 공백/탭 삽입 제거
                    problem_str += self._parse_text_to_hml(f"{prefix} " + opt_clean)
                    
                problem_str += "</TEXT></P>\n"
        
        self.problems_hml.append(problem_str)

    def _estimate_equation_size(self, eq_text: str):
        # 화면에 출력되지 않는 제어 문자 제거 및 예약어 치환 (하나의 기호 폭으로 계산되도록)
        cleaned = eq_text.replace('over', '')
        cleaned = cleaned.replace('LEFT', '').replace('RIGHT', '')
        cleaned = cleaned.replace('`', '').replace('~', '')
        cleaned = cleaned.replace('{', '').replace('}', '').replace('^', '').replace('_', '')
        
        # 긴 예약어 기호들을 단일 문자로 치환하여 폭 뻥튀기 방지 (예: TIMES -> +, alpha -> a)
        cleaned = cleaned.replace('TIMES', '+').replace('DIVIDE', '/')
        cleaned = cleaned.replace('alpha', 'a').replace('beta', 'a').replace('gamma', 'a')
        cleaned = cleaned.replace('theta', 'a').replace('pi', 'a').replace('omega', 'a')
        cleaned = cleaned.replace('sin', 'S').replace('cos', 'C').replace('tan', 'T').replace('log', 'L')
        # 루트는 루트 기호 자체 폭이 꽤 크지만, 내부 기호가 추가되므로 단일 폭 넓은 문자 W로 치환
        cleaned = cleaned.replace('sqrt', 'W')
        
        # 글자 유형별 폭 누적 계산 (HWP 실제 폭 데이터를 모방한 휴리스틱)
        width = 0 
        for char in cleaned:
            if char in '=+-><':
                width += 1000
            elif char.isdigit():
                width += 600
            elif char.isalpha():
                if char in 'ijlftrI':
                    width += 350
                elif char in 'mwWMQO':
                    width += 800
                else:
                    width += 600
            elif char in '()[]|':
                width += 450
            elif char in '.,':
                width += 300
            elif char == ' ':
                width += 0 # HWP 수식은 기본 공백을 무시함
            else:
                width += 500
                
        # 최종 폭 산출 (경험적 비율 1.0배 보정)
        est_width = int(width * 1.0)
        
        # 단, 분수(over)가 있을 경우 분모/분자가 위아래로 쌓이므로 기본 폭(선 등) 추가 후 0.85배 페널티
        if 'over' in eq_text:
            est_width = int((est_width + 800) * 0.85)
        
        # 높이 및 베이스라인 추정
        est_height = 1125
        base_line = 85
        
        has_fraction = 'over' in eq_text
        has_scripts = '^' in eq_text or '_' in eq_text or 'sqrt' in eq_text
        
        if has_fraction and has_scripts:
            # 분수와 지수/루트가 모두 있는 매우 복잡한 수식
            est_height = 3000
            base_line = 65
        elif has_fraction:
            # 일반 분수
            est_height = 2600
            base_line = 65
        elif has_scripts:
            # 지수, 첨자, 루트 등
            est_height = 1350
            base_line = 85
            
        # 예외 처리: 최소너비 보장
        if est_width < 500:
            est_width = 500
            
        return est_width, est_height, base_line

    def _parse_text_to_hml(self, text: str) -> str:
        """
        [[EQUATION:수식]] 형태를 HML 태그 문자열로 변환합니다.
        """
        if not text:
            return ""

        import re
        parts = re.split(r'\[\[EQUATION:(.*?)\]\]', text, flags=re.DOTALL)
        
        result = ""
        for i, part in enumerate(parts):
            if i % 2 == 0: # 일반 텍스트
                # 수식 바로 뒤에 오는 텍스트의 선행 띄어쓰기를 모두 제거
                if i > 0:
                    part = part.lstrip(' ')
                
                if part.strip(): # 공백만 있는 경우도 렌더링
                    # XML 특수문자 처리
                    safe_part = part.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    # \n을 새로운 문단 태그 분리로 치환 (HML에서는 <CHAR> 내부에 날것의 개행 문자를 허용하지 않아 크래시 유발)
                    safe_part = safe_part.replace('\n', '</CHAR></TEXT></P><P ParaShape="1" Style="0"><TEXT CharShape="0"><CHAR>')
                    result += f'<CHAR>{safe_part}</CHAR>'
            else: # 수식
                eq_text = part.strip()
                if eq_text:
                    # 🚀 초거대 LaTeX -> HWP 마스터 사전
                    # 더 이상 수작업으로 replace를 나열하지 않고, 이 사전 하나로 모든 수학 기호를 통일합니다.
                    LATEX_TO_HWP_MAP = {
                        # 1. 그리스 문자
                        r'\alpha': 'alpha', r'\beta': 'beta', r'\gamma': 'gamma', r'\Delta': 'Delta',
                        
                        # 2. 연산자 및 기호
                        r'\times': 'TIMES', r'\cdot': 'TIMES', r'\div': 'DIVIDE',
                        r'\pm': '+-', r'\mp': '-+',
                        r'\oplus': 'oplus', r'\otimes': 'otimes',
                        
                        # 3. 부등호 및 논리 기호
                        r'\leq': '<=', r'\le': '<=', r'\geq': '>=', r'\ge': '>=', 
                        r'\neq': '!=', r'\ne': '!=', r'\equiv': 'equiv',
                        r'\Rightarrow': ',', r'\rightarrow': ',', r'\implies': ',',
                        r'\therefore': 'therefore', r'\because': 'because',
                        
                        # 4. 집합 및 명제
                        r'\cup': 'cup', r'\cap': 'cap', r'\in': 'in', r'\notin': 'notin',
                        r'\subset': 'subset', r'\supset': 'supset', r'\emptyset': 'empty',
                        
                        # 5. 미적분 및 한계
                        r'\infty': 'inf', r'\int': 'int', r'\lim': 'lim',
                        r'\sum': 'sum', r'\prod': 'prod',
                        
                        # 6. 괄호 및 기타 기호
                        r'\{': 'LEFT {', r'\}': 'RIGHT }',
                        r'\left(': 'LEFT (', r'\right)': 'RIGHT )',
                        r'\lfloor': 'lfloor', r'\rfloor': 'rfloor',
                        r'\lceil': 'lceil', r'\rceil': 'rceil',
                        r'\sqrt': 'sqrt',
                        
                        # 7. 점
                        r'\cdots': 'cdots', r'\vdots': 'vdots', r'\ddots': 'ddots',
                        
                        # 8. 액센트 및 기하 기호
                        r'\bar': 'bar', r'\overline': 'overline', r'\vec': 'vec',
                        r'\hat': 'hat', r'\tilde': 'tilde', r'\dot': 'dot', r'\ddot': 'ddot',
                        r'\angle': 'angle', r'\triangle': 'triangle', r'\circ': 'circ'
                    }

                    # 제미나이가 직접 생성한 150개의 통합 사전을 우선 로딩 (없으면 위 기본값 사용)
                    try:
                        import json
                        import sys
                        import os
                        
                        # PyInstaller 환경에서의 안전한 경로 탐색
                        if getattr(sys, 'frozen', False):
                            base_path = sys._MEIPASS
                        else:
                            base_path = os.path.dirname(os.path.abspath(__file__))
                            
                        dict_path = os.path.join(base_path, 'gemini_hwp_dict.json')
                        if os.path.exists(dict_path):
                            with open(dict_path, 'r', encoding='utf-8') as f:
                                dynamic_map = json.load(f)
                                # Override base map with dynamic map (which has 150 entries)
                                LATEX_TO_HWP_MAP.update(dynamic_map)
                    except Exception as e:
                        print(f"Warning: Failed to load gemini_hwp_dict.json: {e}")

                    
                    # 1. LaTeX 분수 \frac{a}{b} -> {a} over {b} 변환 (재귀적 처리 없이 일단 단층 처리)
                    eq_text = re.sub(r'\\frac\s*\{\s*(.*?)\s*\}\s*\{\s*(.*?)\s*\}', r'{\1} over {\2}', eq_text)
                    
                    # 제미나이가 종종 {a over b} 형태로 전체를 묶는 경우가 있는데, 
                    # 한글 수식은 {a} over {b} 를 표준으로 하므로 이를 교정 (가장 바깥쪽 중괄호 분해)
                    # 단, { {a} over {b} } 처럼 된 경우도 있으므로 조금 유연하게 처리
                    eq_text = re.sub(r'^\{\s*(.*?\s+over\s+.*?)\s*\}$', r'\1', eq_text)
                    
                    # 5. 행렬 및 조건부 수식(cases, matrix) 완벽 호환 파싱
                    # LaTeX의 \begin{cases} ... \end{cases} 구조를 HWP의 cases { ... } 로 변환
                    def convert_latex_env(match):
                        env_type = match.group(1).lower()
                        content = match.group(2)
                        # LaTeX 내부의 매크로성 줄바꿈 \\ 를 HWP 수식의 줄바꿈 특수문자 # 으로 변환
                        # (파이썬 정규식에서 \\\\ 는 실제 텍스트의 \\ 와 매칭됨)
                        content = re.sub(r'\\\\', ' # ', content)
                        
                        if 'cases' in env_type:
                            return f" cases {{ {content} }} "
                        elif 'matrix' in env_type:
                            return f" pmatrix {{ {content} }} "
                        else:
                            return f" {{ {content} }} "
                    
                    eq_text = re.sub(r'\\begin\s*\{([a-zA-Z*]+)\}(.*?)\\end\s*\{\1\}', convert_latex_env, eq_text, flags=re.DOTALL)
                    
                    # LaTeX 텍스트 매크로 무력화 (\text{...} -> "...")
                    eq_text = re.sub(r'\\(?:text|mathrm|mathbf|mathit|boldsymbol)\s*\{([^}]*)\}', r' "\1" ', eq_text)
                    
                    # 🚀 마스터 사전을 이용한 1차 일괄 치환 (단어 경계에 주의하여 치환)
                    # 구조적 파싱(frac, begin, text 등)이 모두 끝난 후, 남은 단순 명령어들을 모두 HWP 문법으로 바꿉니다.
                    for latex_cmd, hwp_cmd in LATEX_TO_HWP_MAP.items():
                        # 특수기호 정규식 이스케이프 처리 (\left( 같은 기호의 괄호 보호)
                        safe_cmd = re.escape(latex_cmd)
                        eq_text = re.sub(f'{safe_cmd}(?![a-zA-Z])', f' {hwp_cmd} ', eq_text)
                    
                    
                    # 수식 내에 한글(예: '또한', '가')이 포함된 경우 컴파일 오류/크래시 방지를 위해 따옴표 처리
                    eq_text = re.sub(r'([가-힣]+)', r' "\1" ', eq_text)
                    
                    # 연산자와 키워드(예: <=, rm)가 붙어서 한글 수식 파서가 고장나는 현상 방지
                    # 1. 두 글자 연산자 보호 (화살표는 위에서 쉼표로 치환되었으므로 부등호만 보호)
                    eq_text = eq_text.replace('<=', ' LTEQ ').replace('>=', ' GTEQ ').replace('!=', ' NTEQ ')
                    
                    # 2. 연산자나 괄호 주변에 강제로 공백을 넣던 로직 제거 (사용자가 콤팩트한 스타일을 선호함)
                    # 다만 'over' 같은 단어 앞뒤는 파싱을 위해 최소 1개의 공백 보장 (단어 경계 \b 사용)
                    eq_text = re.sub(r'\bover\b', ' over ', eq_text)
                    
                    # 제미나이가 원시 텍스트로 보낸 => 나 -> 도 쉼표로 변환
                    eq_text = eq_text.replace('=>', ' , ').replace('->', ' , ')
                    
                    # 수학 텍스트 함수(deg, mod, log, ln)가 기울임꼴 변수로 나오는 현상 방지 (앞에 rm 추가)
                    eq_text = re.sub(r'(?i)\bdeg\b', ' rm deg ', eq_text)
                    eq_text = re.sub(r'(?i)\bmod\b', ' rm mod ', eq_text)
                    eq_text = re.sub(r'(?i)\blog\b', ' rm log ', eq_text)
                    eq_text = re.sub(r'(?i)\bln\b', ' rm ln ', eq_text)
                    
                    # 4. 보호된 연산자 복구 (시중 교재 기준: >= 는 ge, <= 는 le 로 치환)
                    eq_text = eq_text.replace(' LTEQ ', ' le ').replace(' GTEQ ', ' ge ').replace(' NTEQ ', ' != ')
                    
                    # 지수(^) 및 첨자(_) 자동 보호 규칙 (HWP 수식 파서 에러 방지)
                    # HWP 수식 편집체계에서는 띄어쓰기가 없으면 x^2+x+1 의 전체가 지수로 올라가버림.
                    # 제미나이가 x^2+x+1 처럼 { } 없이 보냈을 경우 무조건 첫 1글자만 묶어주도록 치환.
                    # 단수 문자 단위의 지수/첨자만 잡아내며, 이미 a^{2+b} 처럼 { 가 있으면 건드리지 않음.
                    eq_text = re.sub(r'\^([a-zA-Z0-9])', r'^{\1}', eq_text)
                    eq_text = re.sub(r'_([a-zA-Z0-9])', r'_{\1}', eq_text)
                    
                    # 여백 매크로 무력화
                    eq_text = re.sub(r'\\q?quad\b', ' ', eq_text)
                    # 무한대 호환
                    eq_text = re.sub(r'\binfty\b', ' inf ', eq_text)
                    
                    # [최종 가비지 컬렉터] 수식 내의 모든 고아 백슬래시 일괄 소거
                    # \equiv 가 equiv 로, \cdots 가 cdots 로 자연스럽게 HWP에 흡수되도록 백슬래시를 투명하게 치환
                    eq_text = eq_text.replace('\\', ' ')
                    
                    # 연속된 공백 제거 및 콤팩트하게 정리
                    eq_text = re.sub(r'\s+', ' ', eq_text).strip()
                    
                    safe_eq = eq_text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('\n', ' ')
                    self.eq_inst_id += 1
                    self.eq_z_order += 1
                    
                    est_width, est_height, base_line = self._estimate_equation_size(eq_text)
                        
                    result += f'<EQUATION BaseLine="{base_line}" BaseUnit="1100" LineMode="false" TextColor="0" Version="Equation Version 60"><SHAPEOBJECT InstId="{self.eq_inst_id}" Lock="false" NumberingType="Equation" ZOrder="{self.eq_z_order}"><SIZE Height="{est_height}" HeightRelTo="Absolute" Protect="false" Width="{est_width}" WidthRelTo="Absolute"/><POSITION AffectLSpacing="false" AllowOverlap="false" FlowWithText="true" HoldAnchorAndSO="false" HorzAlign="Left" HorzOffset="0" HorzRelTo="Para" TreatAsChar="true" VertAlign="Top" VertOffset="0" VertRelTo="Para"/><OUTSIDEMARGIN Bottom="0" Left="56" Right="56" Top="0"/><SHAPECOMMENT/></SHAPEOBJECT><SCRIPT>{safe_eq}</SCRIPT></EQUATION>'
                
        # 텍스트 태그 내부에 최소한의 CHAR가 없으면 크래시 나므로 빈 문단 방지
        if not result:
             result = "<CHAR> </CHAR>"
                
        return result

    def save(self, output_path: str):
        # 템플릿에 문제 내용 삽입
        full_hml = BASE_HML_TEMPLATE.replace("{PROBLEMS_CONTENT}", "".join(self.problems_hml))
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(full_hml)

if __name__ == "__main__":
    # 테스트
    gen = HMLGenerator()
    test_data = {
        "question": "다음 식 [[EQUATION:x^{2} + 2x + 1 = 0]]의 해를 구하시오.",
        "explanation": "이 식은 [[EQUATION:(x+1)^{2} = 0]]으로 인수분해되므로 해는 [[EQUATION:x = -1]]입니다."
    }
    gen.add_problem(test_data, 1)
    gen.save("test_output2.hml")
    print("test_output2.hml created")
