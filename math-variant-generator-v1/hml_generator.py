import os
import re
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
        # AI 모델 띄어쓰기 및 맞춤법 환각(Hallucination) 후가공 처리
        def fix_spacing(text):
            if not isinstance(text, str): return text
            # 1. 복합 수학 용어 강제 교정
            text = re.sub(r'최댓\s+값', '최댓값', text)
            text = re.sub(r'최대\s+값', '최댓값', text)
            text = re.sub(r'최솟\s+값', '최솟값', text)
            text = re.sub(r'최소\s+값', '최솟값', text)
            text = re.sub(r'함숫\s+값', '함숫값', text)
            text = re.sub(r'함수\s+값', '함숫값', text)
            text = re.sub(r'극한\s+값', '극한값', text)
            text = re.sub(r'기댓\s+값', '기댓값', text)
            text = re.sub(r'기대\s+값', '기댓값', text)
            text = re.sub(r'대푯\s+값', '대푯값', text)
            text = re.sub(r'대표\s+값', '대푯값', text)
            text = re.sub(r'관계\s+없이', '관계없이', text)
            text = re.sub(r'상관\s+없이', '상관없이', text)
            
            # 2. 일반 조사 (의, 은, 는, 을, 를, 에, 에서, 로, 으로, 와, 과, 도, 만, 부터, 까지) 강제 부착
            # '이', '가'는 지시대명사("이 문제는", "A가 B가")로 쓰일 수 있으므로 제외하고 3번에서 별도 처리
            text = re.sub(r'([가-힣\]\)0-9a-zA-Z])\s+(은|는|을|를|의|에|에서|로|으로|와|과|도|만|부터|까지|이다|입니다|일때)(?![가-힣a-zA-Z0-9_])', r'\1\2', text)
            text = re.sub(r'([가-힣\]\)0-9a-zA-Z])\s+(일\s+때)(?![가-힣a-zA-Z0-9_])', r'\1일 때', text) # '일 때'
            
            # 3. '이/가' 조사는 선행 단어가 명확한 수학/의존 명사일 때만 부착
            text = re.sub(r'(것|수|값|식|점|선|면|원|해|근|비|합|차|곱|몫|양|음|짝|홀|답|때)\s+(이|가)(?![가-힣a-zA-Z0-9_])', r'\1\2', text)
            
            # 4. 연쇄 조사 부착 (예: "때 의 은" -> "때의 은" -> "때의은")
            text = re.sub(r'([가-힣\]\)0-9a-zA-Z])\s+(은|는|을|를|의|에|도|만)(?![가-힣a-zA-Z0-9_])', r'\1\2', text)
            
            return text
            
        if 'question' in problem_data:
            problem_data['question'] = fix_spacing(problem_data['question'])
        if 'explanation' in problem_data:
            problem_data['explanation'] = fix_spacing(problem_data['explanation'])
        if 'answer_options' in problem_data and isinstance(problem_data['answer_options'], list):
            problem_data['answer_options'] = [fix_spacing(o) for o in problem_data['answer_options']]

        # 본문 시작 & 미주(ENDNOTE) 기호를 문제 텍스트 맨 앞에 배치
        problem_str = f'<P ParaShape="1" Style="0"><TEXT CharShape="0">'
        
        # 해설(ENDNOTE) 객체를 맨 앞에 생성
        problem_str += '<ENDNOTE><PARALIST LineWrap="Break" LinkListID="0" LinkListIDNext="0" TextDirection="0" VertAlign="Top"><P ParaShape="1" Style="0"><TEXT CharShape="0"><AUTONUM Number="1" NumberType="Endnote"><AUTONUMFORMAT SuffixChar=")" Superscript="false" Type="Digit"/></AUTONUM><CHAR> </CHAR></TEXT></P><P ParaShape="1" Style="0"><TEXT CharShape="0">'
        expl_text = problem_data.get('explanation', '')
        if expl_text and expl_text.strip():
            problem_str += self._parse_text_to_hml("[해설] " + expl_text)
        else:
            problem_str += self._parse_text_to_hml(" ")  # 해설 없으면 빈 칸
        problem_str += '</TEXT></P></PARALIST></ENDNOTE>'
        
        q_num_str = str(problem_data.get('question_num', ''))
        is_variant = "변형" in q_num_str
        
        q_clean = problem_data.get('question', '')
        
        # 원본 PDF나 AI가 붙인 1., 1), (1) 등 매뉴얼 번호 및 공백 제거
        while True:
            prev = q_clean
            q_clean = re.sub(r'^\s*\[\[EQUATION:\s*\d+[\.\)]?\s*\]\]\s*', '', q_clean)
            q_clean = re.sub(r'^\s*(?:\(\d+\)|\[\d+\]|<\d+>|\d+[\.\)](?!\d))\s*', '', q_clean)
            if prev == q_clean:
                break
        
        # 객관식 보기 중복 방지
        split_match = re.split(r'(\s*(?:<br>|\\n)*\s*(?:①|②|③|④|⑤|\(1\)|\(2\)|\(3\)|\(4\)|\(5\))\s+\[\[EQUATION)', q_clean, maxsplit=1, flags=re.IGNORECASE)
        if len(split_match) > 1:
            q_clean = split_match[0]
        
        if is_variant:
            problem_str += self._parse_text_to_hml(f" [{q_num_str}] " + q_clean)
        else:
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
                    opt_clean = opt.strip()
                    # Mathpix가 원문자(①)를 (1)로 변환하거나 중복 번호가 붙는 경우 반복 제거
                    for _ in range(5):
                        prev = opt_clean
                        opt_clean = re.sub(r'^(?:\(\d+\)|\d+[\.\)]\s|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)\s*', '', opt_clean).strip()
                        if prev == opt_clean:
                            break
                    prefix = circle_nums[idx] if idx < len(circle_nums) else f"({idx+1})"
                    problem_str += self._parse_text_to_hml(f"{prefix} " + opt_clean + "       ")
                problem_str += "</TEXT></P>\n"
        
        self.problems_hml.append(problem_str)

    def _estimate_equation_size(self, eq_text: str):
        # HWP 수식 폭 추정 브리지
        cleaned = eq_text.replace('over', '').replace('LEFT', '').replace('RIGHT', '')
        cleaned = cleaned.replace('`', '').replace('~', '').replace('{', '').replace('}', '').replace('^', '').replace('_', '')
        
        width = 0 
        for char in cleaned:
            if char in '=+-><': width += 1000
            elif char.isdigit(): width += 600
            elif char.isalpha():
                if char in 'ijlftrI': width += 350
                elif char in 'mwWMQO': width += 800
                else: width += 600
            elif char in '()[]|': width += 450
            elif char in '.,': width += 300
            else: width += 500
                
        est_width = int(width * 1.0)
        if 'over' in eq_text: est_width = int((est_width + 800) * 0.85)
        
        est_height = 1125
        base_line = 85
        has_fraction = 'over' in eq_text
        has_scripts = '^' in eq_text or '_' in eq_text or 'sqrt' in eq_text
        
        if has_fraction and has_scripts:
            est_height = 3000
            base_line = 65
        elif has_fraction:
            est_height = 2600
            base_line = 65
        elif has_scripts:
            est_height = 1350
            base_line = 85
            
        if est_width < 500: est_width = 500
        return est_width, est_height, base_line

    def _parse_text_to_hml(self, text: str) -> str:
        """
        [[EQUATION:수식]] 형태를 HML 태그 문자열로 변환합니다.
        이제 AI가 직접 HWP 수식을 생성하므로, 과도한 변환보다는 안전한 통과를 위주로 합니다.
        """
        if not text:
            return ""

        # Normalize escaped newlines and carriage returns
        text = text.replace('\\n', '\n').replace('\\r', '').replace('\r\n', '\n')

        # 마크다운 수식 래퍼 보정
        text = re.sub(r'\$\$(.*?)\$\$', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
        text = re.sub(r'\$(.*?)\$', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
        text = re.sub(r'\\\((.*?)\\\)', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
        text = re.sub(r'\\\[(.*?)\\\]', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
        
        # AI 태그 오염물 교정 (수식 끝의 } 가 잘려나가지 않도록 수정)
        text = re.sub(r'(?i)\[+EQUATION[=\{:]\s*(.*?)\s*\]{2,}', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
        text = re.sub(r'(?i)(?<!\[)\[\{?EQUATION[=\{:]\s*(.*?)\s*\}?\](?!\])', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
        text = re.sub(r'\[\[\s*(?!EQUATION)(.*?)\s*\]\]', r'[[EQUATION:\1]]', text, flags=re.DOTALL|re.IGNORECASE)
        
        parts = re.split(r'\[\[EQUATION:((?:(?!\]\]).)*?)\]\]', text, flags=re.DOTALL)

        
        result = ""
        for i, part in enumerate(parts):
            if i % 2 == 0: # 일반 텍스트
                if i > 0: part = part.lstrip(' ')
                if part.strip() or part == ' ':
                    safe_part = part.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    safe_part = safe_part.replace('\n', '</CHAR></TEXT></P><P ParaShape="1" Style="0"><TEXT CharShape="0"><CHAR>')
                    result += f'<CHAR>{safe_part}</CHAR>'
            else: # 수식
                eq_text = part.strip()
                if eq_text:
                    # 중첩 태그 확실하게 제거 (수식창 안에 [[EQUATION: 글자가 박히는 버그 방지)
                    eq_text = re.sub(r'(?i)\[\[EQUATION:', '', eq_text)
                    eq_text = re.sub(r'\]\]\s*$', '', eq_text) # 끝에 남은 찌꺼기만 제거
                    # [CRITICAL FIX] Gemini Matrix Hallucination Auto-Corrector
                    # AI often hallucinates HWP matrix syntax as `A # B ## C # D` instead of `A & B # C & D`
                    if ('matrix' in eq_text or 'cases' in eq_text) and '&' not in eq_text and '##' in eq_text:
                        eq_text = eq_text.replace('##', '%%ROW%%')
                        eq_text = eq_text.replace('#', '&')
                        eq_text = eq_text.replace('%%ROW%%', '#')
                    
                    # [HWP Python-side Fallback Architecture] 
                    # 복구: AI가 강제 지시를 무시하고 LaTeX를 출력할 경우를 대비하여 Python 단에서 교정합니다.
                    eq_text = eq_text.replace('\\le', ' le ').replace('\\ge', ' ge ').replace('\\neq', ' != ').replace('<=', ' le ').replace('>=', ' ge ')
                    eq_text = eq_text.replace('\\times', ' TIMES ').replace('\\div', ' DIV ').replace('\\cdot', ' cdot ')
                    eq_text = eq_text.replace('\\infty', ' inf ').replace('\\sqrt', ' sqrt ')
                    eq_text = eq_text.replace('\\', '') # 과도한 이스케이프 제거
                    eq_text = re.sub(r'frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}', r'{\1} over {\2}', eq_text) # 단순 분수
                    eq_text = re.sub(r'overline\s*\{([^{}]+)\}', r'overline {\1}', eq_text) # overline 공간 확보
                    
                    # HWP 예약어 교정 (간격 확보)
                    eq_text = eq_text.replace('alpha', ' alpha ').replace('beta', ' beta ').replace('pi', ' pi ').replace('gamma', ' gamma ')
                    eq_text = re.sub(r'\s+', ' ', eq_text).strip()

                    # ── [CRITICAL FIX] 지수/아래첨자 {} 안에 연산자가 빨려들어가는 버그 교정 ──
                    # 예: x^{2+} alpha x  →  x^{2} + alpha x
                    # 예: x^{2-2}         →  x^{2} - 2  (음의 지수 ^{-3}은 건드리지 않음)
                    eq_text = re.sub(r'\^\{(\d+)([+\-])(\s)', r'^{\1} \2\3', eq_text)
                    eq_text = re.sub(r'\^\{(\d+)([+\-])([a-zA-Z(])', r'^{\1} \2 \3', eq_text)
                    # +뒤가 숫자인 케이스: ^{2+1} → ^{2} + 1  /  ^{4+1} → ^{4} + 1
                    eq_text = re.sub(r'\^\{(\d+)([+\-])(\d+)\}', r'^{\1} \2 \3', eq_text)
                    eq_text = re.sub(r'\^\{(\d+)([+\-])(\d)', r'^{\1} \2 \3', eq_text)
                    eq_text = re.sub(r'\_\{(\d+)([+\-])(\s)', r'_{\1} \2\3', eq_text)
                    eq_text = re.sub(r'\_\{(\d+)([+\-])([a-zA-Z(])', r'_{\1} \2 \3', eq_text)
                    eq_text = re.sub(r'\_\{(\d+)([+\-])(\d+)\}', r'_{\1} \2 \3', eq_text)
                    eq_text = re.sub(r'\_\{(\d+)([+\-])(\d)', r'_{\1} \2 \3', eq_text)

                    # HWP 수식은 중괄호가 짝이 맞아야 하므로 최종 검증 (간이형)
                    if eq_text.count('{') != eq_text.count('}'):
                        # 괄호 짝이 안 맞으면 렌더링이 깨지므로 최소한의 조치
                        pass 

                    safe_eq = eq_text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('\n', ' ')
                    self.eq_inst_id += 1
                    self.eq_z_order += 1
                    est_width, est_height, base_line = self._estimate_equation_size(eq_text)
                    result += f'<EQUATION BaseLine="{base_line}" BaseUnit="1100" LineMode="false" TextColor="0" Version="Equation Version 60"><SHAPEOBJECT InstId="{self.eq_inst_id}" Lock="false" NumberingType="Equation" ZOrder="{self.eq_z_order}"><SIZE Height="{est_height}" HeightRelTo="Absolute" Protect="false" Width="{est_width}" WidthRelTo="Absolute"/><POSITION AffectLSpacing="false" AllowOverlap="false" FlowWithText="true" HoldAnchorAndSO="false" HorzAlign="Left" HorzOffset="0" HorzRelTo="Para" TreatAsChar="true" VertAlign="Top" VertOffset="0" VertRelTo="Para"/><OUTSIDEMARGIN Bottom="0" Left="56" Right="56" Top="0"/><SHAPECOMMENT/></SHAPEOBJECT><SCRIPT>{safe_eq}</SCRIPT></EQUATION>'
                
        if not result: result = "<CHAR> </CHAR>"
        return result

    def save(self, output_path: str):
        full_hml = BASE_HML_TEMPLATE.replace("{PROBLEMS_CONTENT}", "".join(self.problems_hml))
        full_hml = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', full_hml)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(full_hml)
