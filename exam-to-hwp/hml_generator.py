"""
HML 생성기 - 시험지 OCR 결과를 HML 포맷으로 변환
기존 math-pdf-to-hml-v10.1/hml_generator.py 에서 파생.
ENDNOTE(해설) 제거, 단 레이아웃 제거, 원문 그대로 타이핑 목적에 맞게 단순화.
"""
import re
from template_data import BASE_HML_TEMPLATE


class HMLGenerator:
    def __init__(self):
        self.paragraphs_hml = []
        self.eq_inst_id = 1000000000
        self.eq_z_order = 1000

    def add_paragraph(self, text: str):
        """
        텍스트(+수식) 한 단락을 HML 조각으로 변환하여 리스트에 추가.
        빈 줄은 빈 <P> 태그로 처리.
        """
        if not text.strip():
            self.paragraphs_hml.append('<P ParaShape="1" Style="0"><TEXT CharShape="0"><CHAR> </CHAR></TEXT></P>\n')
            return

        para = f'<P ParaShape="1" Style="0"><TEXT CharShape="0">'
        para += self._parse_text_to_hml(text)
        para += '</TEXT></P>\n'
        self.paragraphs_hml.append(para)

    def _estimate_equation_size(self, eq_text: str):
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
        if 'over' in eq_text:
            est_width = int((est_width + 800) * 0.85)

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

        if est_width < 500:
            est_width = 500
        return est_width, est_height, base_line

    def _parse_text_to_hml(self, text: str) -> str:
        """
        [[EQUATION:수식]] 형태를 HML 태그 문자열로 변환.
        """
        if not text:
            return ""

        # 이스케이프 개행 정규화
        text = text.replace('\\n', '\n').replace('\\r', '').replace('\r\n', '\n')

        # 마크다운 수식 래퍼 보정 ($$ ... $$, $ ... $, \( ... \), \[ ... \])
        text = re.sub(r'\$\$(.*?)\$\$', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
        text = re.sub(r'\$(.*?)\$', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
        text = re.sub(r'\\\((.*?)\\\)', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
        text = re.sub(r'\\\[(.*?)\\\]', r'[[EQUATION:\1]]', text, flags=re.DOTALL)

        # AI 태그 오염물 교정
        text = re.sub(r'(?i)\[+EQUATION[=\{:]\s*(.*?)\s*\]{2,}', r'[[EQUATION:\1]]', text, flags=re.DOTALL)
        text = re.sub(r'(?i)(?<!\[)\[\{?EQUATION[=\{:]\s*(.*?)\s*\}?\](?!\])', r'[[EQUATION:\1]]', text, flags=re.DOTALL)

        parts = re.split(r'\[\[EQUATION:((?:(?!\]\]).)*?)\]\]', text, flags=re.DOTALL)

        result = ""
        for i, part in enumerate(parts):
            if i % 2 == 0:  # 일반 텍스트
                if i > 0:
                    part = part.lstrip(' ')
                if part.strip() or part == ' ':
                    safe_part = part.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    safe_part = safe_part.replace('\n', '</CHAR></TEXT></P><P ParaShape="1" Style="0"><TEXT CharShape="0"><CHAR>')
                    result += f'<CHAR>{safe_part}</CHAR>'
            else:  # 수식
                eq_text = part.strip()
                if eq_text:
                    # 중첩 태그 제거
                    eq_text = re.sub(r'(?i)\[\[EQUATION:', '', eq_text)
                    eq_text = re.sub(r'\]\]\s*$', '', eq_text)

                    # LaTeX → HWP 수식 폴백 변환
                    eq_text = eq_text.replace('\\le', ' le ').replace('\\ge', ' ge ').replace('\\neq', ' != ')
                    eq_text = eq_text.replace('<=', ' le ').replace('>=', ' ge ')
                    eq_text = eq_text.replace('\\times', ' TIMES ').replace('\\div', ' DIV ').replace('\\cdot', ' cdot ')
                    eq_text = eq_text.replace('\\infty', ' inf ').replace('\\sqrt', ' sqrt ')
                    eq_text = eq_text.replace('\\', '')
                    eq_text = re.sub(r'frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}', r'{\1} over {\2}', eq_text)
                    eq_text = re.sub(r'overline\s*\{([^{}]+)\}', r'overline {\1}', eq_text)

                    # HWP 예약어 간격 확보
                    eq_text = eq_text.replace('alpha', ' alpha ').replace('beta', ' beta ')
                    eq_text = eq_text.replace('pi', ' pi ').replace('gamma', ' gamma ')
                    eq_text = re.sub(r'\s+', ' ', eq_text).strip()

                    safe_eq = eq_text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('\n', ' ')
                    self.eq_inst_id += 1
                    self.eq_z_order += 1
                    est_width, est_height, base_line = self._estimate_equation_size(eq_text)
                    result += (
                        f'<EQUATION BaseLine="{base_line}" BaseUnit="1100" LineMode="false" TextColor="0" Version="Equation Version 60">'
                        f'<SHAPEOBJECT InstId="{self.eq_inst_id}" Lock="false" NumberingType="Equation" ZOrder="{self.eq_z_order}">'
                        f'<SIZE Height="{est_height}" HeightRelTo="Absolute" Protect="false" Width="{est_width}" WidthRelTo="Absolute"/>'
                        f'<POSITION AffectLSpacing="false" AllowOverlap="false" FlowWithText="true" HoldAnchorAndSO="false" '
                        f'HorzAlign="Left" HorzOffset="0" HorzRelTo="Para" TreatAsChar="true" VertAlign="Top" VertOffset="0" VertRelTo="Para"/>'
                        f'<OUTSIDEMARGIN Bottom="0" Left="56" Right="56" Top="0"/>'
                        f'<SHAPECOMMENT/></SHAPEOBJECT>'
                        f'<SCRIPT>{safe_eq}</SCRIPT></EQUATION>'
                    )

        if not result:
            result = '<CHAR> </CHAR>'
        return result

    def save(self, output_path: str):
        full_hml = BASE_HML_TEMPLATE.replace("{PROBLEMS_CONTENT}", "".join(self.paragraphs_hml))
        full_hml = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', full_hml)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(full_hml)
