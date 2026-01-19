"""
HWPX 파일 파싱 모듈
HWPX 파일에서 수학 문제를 추출하고 분석합니다.
"""

import os
import re
import zipfile
import xml.etree.ElementTree as ET
from typing import List, Dict, Any


class HwpxParser:
    """HWPX 파일 파서"""
    
    # HWPX 네임스페이스
    NAMESPACES = {
        'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
        'hs': 'http://www.hancom.co.kr/hwpml/2011/section',
        'hc': 'http://www.hancom.co.kr/hwpml/2011/char'
    }
    
    # 문제 번호 패턴 (1. | (1) | [1])
    PROBLEM_PATTERNS = [
        re.compile(r'^\s*(\d+)\.\s*'),      # 1. 형식
        re.compile(r'^\s*\((\d+)\)\s*'),    # (1) 형식
        re.compile(r'^\s*\[(\d+)\]\s*'),    # [1] 형식
    ]
    
    def __init__(self, hwpx_path: str):
        """
        Args:
            hwpx_path: HWPX 파일 경로
        """
        self.hwpx_path = hwpx_path
        self.extract_dir = None
        self.problems = []
    
    def extract_hwpx(self, extract_dir: str) -> str:
        """HWPX 파일을 ZIP으로 압축 해제
        
        Args:
            extract_dir: 압축 해제할 디렉토리
            
        Returns:
            압축 해제된 디렉토리 경로
        """
        if not zipfile.is_zipfile(self.hwpx_path):
            raise ValueError(f"{self.hwpx_path}는 유효한 HWPX 파일이 아닙니다.")
        
        os.makedirs(extract_dir, exist_ok=True)
        
        with zipfile.ZipFile(self.hwpx_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        
        self.extract_dir = extract_dir
        return extract_dir
    
    def find_section_files(self) -> List[str]:
        """Contents 디렉토리에서 section XML 파일들을 찾음
        
        Returns:
            section 파일 경로 리스트
        """
        if not self.extract_dir:
            raise RuntimeError("extract_hwpx()를 먼저 호출해야 합니다.")
        
        contents_dir = os.path.join(self.extract_dir, 'Contents')
        if not os.path.exists(contents_dir):
            return []
        
        section_files = []
        for filename in os.listdir(contents_dir):
            if filename.startswith('section') and filename.endswith('.xml'):
                section_files.append(os.path.join(contents_dir, filename))
        
        return sorted(section_files)
    
    def parse_sections(self) -> List[Dict[str, Any]]:
        """모든 section 파일을 파싱하여 문제 추출
        
        Returns:
            문제 리스트
        """
        section_files = self.find_section_files()
        all_problems = []
        problem_id = 0
        
        for section_file in section_files:
            problems = self._parse_single_section(section_file, problem_id)
            all_problems.extend(problems)
            problem_id += len(problems)
        
        self.problems = all_problems
        return all_problems
    
    def _parse_single_section(self, section_file: str, start_id: int) -> List[Dict[str, Any]]:
        """단일 section 파일 파싱
        
        Args:
            section_file: section XML 파일 경로
            start_id: 시작 문제 ID
            
        Returns:
            문제 리스트
        """
        try:
            tree = ET.parse(section_file)
            root = tree.getroot()
        except Exception as e:
            print(f"Warning: {section_file} 파싱 실패: {e}")
            return []
        
        problems = []
        current_problem = None
        problem_id = start_id
        
        # 모든 문단(p) 순회
        paragraphs = root.findall('.//hp:p', namespaces=self.NAMESPACES)
        
        for idx, para in enumerate(paragraphs):
            text = self._extract_text_from_paragraph(para)
            
            # 새 문제 시작 감지
            problem_number = self._detect_problem_number(text)
            
            if problem_number:
                # 이전 문제 저장
                if current_problem:
                    problems.append(current_problem)
                
                # 새 문제 시작
                current_problem = {
                    'id': problem_id,
                    'number': problem_number,
                    'text': text,
                    'images': self._extract_image_refs(para),
                    'xml_section': os.path.basename(section_file),
                    'xml_start_line': para.sourceline if hasattr(para, 'sourceline') else idx,
                    'xml_end_line': para.sourceline if hasattr(para, 'sourceline') else idx,
                    'xml_nodes': [para]
                }
                problem_id += 1
            elif current_problem:
                # 현재 문제에 내용 추가
                current_problem['text'] += '\n' + text
                current_problem['xml_end_line'] = para.sourceline if hasattr(para, 'sourceline') else idx
                current_problem['xml_nodes'].append(para)
                current_problem['images'].extend(self._extract_image_refs(para))
        
        # 마지막 문제 저장
        if current_problem:
            problems.append(current_problem)
        
        return problems
    
    def _extract_text_from_paragraph(self, para_elem) -> str:
        """문단 요소에서 텍스트 추출
        
        Args:
            para_elem: 문단 XML 요소
            
        Returns:
            추출된 텍스트
        """
        texts = []
        
        # hp:run/hp:t 요소에서 텍스트 추출
        for text_elem in para_elem.findall('.//hp:t', namespaces=self.NAMESPACES):
            if text_elem.text:
                texts.append(text_elem.text)
        
        return ''.join(texts)
    
    def _detect_problem_number(self, text: str) -> str:
        """텍스트에서 문제 번호 패턴 감지
        
        Args:
            text: 검사할 텍스트
            
        Returns:
            문제 번호 (없으면 None)
        """
        for pattern in self.PROBLEM_PATTERNS:
            match = pattern.match(text)
            if match:
                return match.group(0).strip()
        return None
    
    def _extract_image_refs(self, para_elem) -> List[str]:
        """문단에서 이미지 참조 추출
        
        Args:
            para_elem: 문단 XML 요소
            
        Returns:
            이미지 ID 리스트
        """
        image_refs = []
        
        # hp:pic 요소의 binaryItemIDRef 속성 찾기
        for pic_elem in para_elem.findall('.//hp:pic', namespaces=self.NAMESPACES):
            # 이미지 속성은 hp:pic의 하위 요소나 속성에 있을 수 있음
            # HWPX 구조에 따라 조정 필요
            for child in pic_elem:
                if 'binaryItemIDRef' in child.attrib:
                    image_refs.append(child.attrib['binaryItemIDRef'])
        
        return image_refs
    
    def get_parsing_result(self) -> Dict[str, Any]:
        """파싱 결과를 JSON 형태로 반환
        
        Returns:
            파싱 결과 딕셔너리
        """
        # xml_nodes는 직렬화할 수 없으므로 제외
        serializable_problems = []
        for problem in self.problems:
            problem_copy = problem.copy()
            problem_copy.pop('xml_nodes', None)
            serializable_problems.append(problem_copy)
        
        return {
            'problems': serializable_problems,
            'total_count': len(self.problems),
            'source_file': os.path.basename(self.hwpx_path)
        }


def parse_hwpx_file(hwpx_path: str, extract_dir: str) -> Dict[str, Any]:
    """HWPX 파일 파싱 헬퍼 함수
    
    Args:
        hwpx_path: HWPX 파일 경로
        extract_dir: 압축 해제 디렉토리
        
    Returns:
        파싱 결과
    """
    parser = HwpxParser(hwpx_path)
    parser.extract_hwpx(extract_dir)
    parser.parse_sections()
    return parser.get_parsing_result()
