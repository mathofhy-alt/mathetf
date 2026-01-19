"""
HWPX 파일 재조합 모듈
선택된 문제들로 새로운 HWPX 파일을 생성합니다.
"""

import os
import re
import shutil
import zipfile
import xml.etree.ElementTree as ET
from typing import List, Dict, Any
from hwpx_parser import HwpxParser


class HwpxBuilder:
    """HWPX 파일 빌더"""
    
    NAMESPACES = {
        'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
        'hs': 'http://www.hancom.co.kr/hwpml/2011/section',
        'hc': 'http://www.hancom.co.kr/hwpml/2011/char'
    }
    
    def __init__(self, original_hwpx_path: str, parser: HwpxParser):
        """
        Args:
            original_hwpx_path: 원본 HWPX 파일 경로
            parser: 파싱된 HwpxParser 인스턴스
        """
        self.original_hwpx_path = original_hwpx_path
        self.parser = parser
        self.work_dir = None
    
    def create_new_hwpx(self, selected_ids: List[int], output_path: str) -> str:
        """선택된 문제들로 새 HWPX 파일 생성
        
        Args:
            selected_ids: 선택된 문제 ID 리스트
            output_path: 출력 HWPX 파일 경로
            
        Returns:
            생성된 파일 경로
        """
        # 1. 임시 작업 디렉토리 생성
        self.work_dir = output_path + '_work'
        if os.path.exists(self.work_dir):
            shutil.rmtree(self.work_dir)
        
        # 2. 원본 HWPX 구조 복사
        shutil.copytree(self.parser.extract_dir, self.work_dir)
        
        # 3. 선택된 문제만 필터링
        selected_problems = [p for p in self.parser.problems if p['id'] in selected_ids]
        
        # 4. 문제 번호 재정렬
        renumbered_problems = self._renumber_problems(selected_problems)
        
        # 5. section XML 파일 수정
        self._update_section_xmls(renumbered_problems)
        
        # 6. BinData 이미지 필터링
        self._filter_bindata(renumbered_problems)
        
        # 7. ZIP으로 재압축
        self._repackage_hwpx(output_path)
        
        # 8. 임시 디렉토리 정리
        shutil.rmtree(self.work_dir)
        
        return output_path
    
    def _renumber_problems(self, problems: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """문제 번호를 1, 2, 3... 순서로 재정렬
        
        Args:
            problems: 문제 리스트
            
        Returns:
            번호가 재정렬된 문제 리스트
        """
        renumbered = []
        
        for idx, problem in enumerate(problems, start=1):
            problem_copy = problem.copy()
            
            # 원본 번호 패턴 감지
            original_number = problem['number']
            
            # 패턴에 따라 새 번호 생성
            if original_number.endswith('.'):
                new_number = f"{idx}."
            elif original_number.startswith('(') and original_number.endswith(')'):
                new_number = f"({idx})"
            elif original_number.startswith('[') and original_number.endswith(']'):
                new_number = f"[{idx}]"
            else:
                new_number = f"{idx}."
            
            problem_copy['new_number'] = new_number
            problem_copy['new_id'] = idx - 1
            renumbered.append(problem_copy)
        
        return renumbered
    
    def _update_section_xmls(self, problems: List[Dict[str, Any]]):
        """section XML 파일들을 선택된 문제만 포함하도록 수정
        
        Args:
            problems: 재정렬된 문제 리스트
        """
        # section별로 문제 그룹화
        sections = {}
        for problem in problems:
            section_name = problem['xml_section']
            if section_name not in sections:
                sections[section_name] = []
            sections[section_name].append(problem)
        
        # 각 section 파일 처리
        contents_dir = os.path.join(self.work_dir, 'Contents')
        
        for section_file in os.listdir(contents_dir):
            if not (section_file.startswith('section') and section_file.endswith('.xml')):
                continue
            
            section_path = os.path.join(contents_dir, section_file)
            
            if section_file in sections:
                # 이 section에 포함된 문제들로 XML 재구성
                self._rebuild_section_xml(section_path, sections[section_file])
            else:
                # 선택된 문제가 없는 section은 빈 문서로 만들기
                self._create_empty_section_xml(section_path)
    
    def _rebuild_section_xml(self, section_path: str, problems: List[Dict[str, Any]]):
        """section XML을 선택된 문제들로 재구성
        
        Args:
            section_path: section XML 파일 경로
            problems: 이 section에 포함될 문제 리스트
        """
        try:
            tree = ET.parse(section_path)
            root = tree.getroot()
        except Exception as e:
            print(f"Warning: {section_path} 파싱 실패: {e}")
            return
        
        # 기존 문단들 모두 제거 - ElementTree는 직접 제거
        for sec_elem in root.findall('.//hs:sec', namespaces=self.NAMESPACES):
            # 모든 hp:p 요소 제거
            paras_to_remove = sec_elem.findall('.//hp:p', namespaces=self.NAMESPACES)
            for para in paras_to_remove:
                # ElementTree에서는 상위 요소로부터 직접 제거
                for parent in sec_elem.iter():
                    try:
                        parent.remove(para)
                        break
                    except ValueError:
                        continue
            
            # 선택된 문제의 노드들 추가
            for problem in problems:
                for node in problem.get('xml_nodes', []):
                    # 문제 번호 업데이트
                    new_node = self._update_problem_number(node, problem['number'], problem['new_number'])
                    sec_elem.append(new_node)
        
        # 파일 저장
        tree.write(section_path, encoding='utf-8', xml_declaration=True)
    
    def _update_problem_number(self, node, old_number: str, new_number: str):
        """노드의 문제 번호를 업데이트
        
        Args:
            node: XML 노드
            old_number: 기존 번호
            new_number: 새 번호
            
        Returns:
            업데이트된 노드 (복사본)
        """
        # 노드 복사
        new_node = ET.Element(node.tag, node.attrib)
        new_node.text = node.text
        new_node.tail = node.tail
        
        # 자식 요소들 복사
        for child in node:
            new_child = self._update_problem_number(child, old_number, new_number)
            new_node.append(new_child)
        
        # 텍스트 요소에서 번호 교체
        for text_elem in new_node.findall('.//hp:t', namespaces=self.NAMESPACES):
            if text_elem.text and old_number in text_elem.text:
                text_elem.text = text_elem.text.replace(old_number, new_number, 1)
                break  # 첫 번째만 교체
        
        return new_node
    
    def _create_empty_section_xml(self, section_path: str):
        """빈 section XML 생성 (선택된 문제가 없는 경우)
        
        Args:
            section_path: section XML 파일 경로
        """
        try:
            tree = ET.parse(section_path)
            root = tree.getroot()
            
            # 모든 문단 제거
            for sec_elem in root.findall('.//hs:sec', namespaces=self.NAMESPACES):
                for para in sec_elem.findall('.//hp:p', namespaces=self.NAMESPACES):
                    # ElementTree에서는 parent를 직접 구할 수 없으므로 다른 방식 사용
                    sec_elem.remove(para)
            
            tree.write(section_path, encoding='utf-8', xml_declaration=True)
        except Exception as e:
            print(f"Warning: {section_path} 빈 문서 생성 실패: {e}")
    
    def _filter_bindata(self, problems: List[Dict[str, Any]]):
        """선택된 문제에 포함된 이미지만 유지
        
        Args:
            problems: 문제 리스트
        """
        # 사용된 이미지 ID 수집
        used_images = set()
        for problem in problems:
            used_images.update(problem.get('images', []))
        
        # BinData 디렉토리 처리
        bindata_dir = os.path.join(self.work_dir, 'BinData')
        if not os.path.exists(bindata_dir):
            return
        
        # 사용되지 않는 이미지 파일 제거
        for filename in os.listdir(bindata_dir):
            file_path = os.path.join(bindata_dir, filename)
            
            # BIN*.xml 파일 확인
            if filename.startswith('BIN') and filename.endswith('.xml'):
                # XML에서 참조되는 이미지 ID 확인
                try:
                    tree = ET.parse(file_path)
                    root = tree.getroot()
                    
                    # 이미지 ID 확인 (HWPX 구조에 따라 조정 필요)
                    image_id = root.get('id') or filename
                    
                    if image_id not in used_images:
                        os.remove(file_path)
                        
                        # 관련 이미지 파일도 제거 (동일 이름의 jpg, png 등)
                        base_name = os.path.splitext(filename)[0]
                        for ext in ['.jpg', '.png', '.jpeg', '.gif']:
                            img_file = os.path.join(bindata_dir, base_name + ext)
                            if os.path.exists(img_file):
                                os.remove(img_file)
                except Exception as e:
                    print(f"Warning: {file_path} 처리 실패: {e}")
    
    def _repackage_hwpx(self, output_path: str):
        """작업 디렉토리를 ZIP으로 압축하여 HWPX 파일 생성
        
        Args:
            output_path: 출력 파일 경로
        """
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(self.work_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, self.work_dir)
                    zipf.write(file_path, arcname)


def create_hwpx_from_selection(
    original_hwpx_path: str,
    parser: HwpxParser,
    selected_ids: List[int],
    output_path: str
) -> str:
    """선택된 문제들로 새 HWPX 파일 생성 (헬퍼 함수)
    
    Args:
        original_hwpx_path: 원본 HWPX 파일 경로
        parser: 파싱된 HwpxParser 인스턴스
        selected_ids: 선택된 문제 ID 리스트
        output_path: 출력 HWPX 파일 경로
        
    Returns:
        생성된 파일 경로
    """
    builder = HwpxBuilder(original_hwpx_path, parser)
    return builder.create_new_hwpx(selected_ids, output_path)
