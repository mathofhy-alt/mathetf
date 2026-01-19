import sys
import io
# Windows Console Encoding Fix
sys.stdout = io.TextIOWrapper(sys.stdout.detach(), encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.detach(), encoding='utf-8')

import os
import json
import zipfile
import shutil
import argparse
import uuid
import re
import tempfile
from lxml import etree

# 네임스페이스 정의 (필요 시 확장)
NAMESPACES = {
    'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
    'hc': 'http://www.hancom.co.kr/hwpml/2011/core',
    'hm': 'http://www.hancom.co.kr/hwpml/2011/meta',
    'hp10': 'http://www.hancom.co.kr/hwpml/2016/paragraph'
}

def create_temp_hwpx(xml_content, template_path, header_content=None):
    """
    단일 컨텐츠(xml_content)를 담은 임시 HWPX 파일을 생성하고 경로를 반환함.
    hwp_automator.py에서 InsertFile용으로 사용.
    header_content가 있으면 템플릿의 헤더를 덮어씀 (문항별 스타일 유지).
    """
    temp_filename = f"temp_part_{uuid.uuid4().hex[:8]}.hwpx"
    temp_output_path = os.path.join(tempfile.gettempdir(), temp_filename)
    
    # 임시 작업 폴더
    work_dir = os.path.join(tempfile.gettempdir(), f"work_{uuid.uuid4().hex[:8]}")
    os.makedirs(work_dir, exist_ok=True)
    
    try:
        # 템플릿 압축 해제
        with zipfile.ZipFile(template_path, 'r') as zf:
            zf.extractall(work_dir)
            
        # Header Overwrite (스타일 복원)
        if header_content:
            header_path = os.path.join(work_dir, 'Contents', 'header.xml')
            if not os.path.exists(header_path):
                header_path = os.path.join(work_dir, 'header.xml')
            
            # [Style Isolation Strategy]
            # Rename all styles to be unique to this question chunk.
            # This prevents HWP from merging styles with same names (e.g. '바탕글') 
            # and ignoring the second question's custom formatting.
            try:
                # Parse
                parser_h = etree.XMLParser(recover=True)
                h_tree = etree.fromstring(header_content.encode('utf-8'), parser=parser_h)
                
                # Unique Suffix
                suffix = f"_{uuid.uuid4().hex[:6]}"
                
                # Find all <hp:style> (ignore namespace for safety)
                for style in h_tree.iter():
                    if style.tag.endswith('style'):
                        if style.get('name'):
                            style.set('name', style.get('name') + suffix)
                        if style.get('engName'):
                            style.set('engName', style.get('engName') + suffix)
                            
                header_content = etree.tostring(h_tree, encoding='unicode')
            except Exception as e:
                print(f"Warning: Style renaming failed: {e}")

            # 덮어쓰기
            with open(header_path, 'w', encoding='utf-8') as f:
                f.write(header_content)
            
        section_path = os.path.join(work_dir, 'Contents', 'section0.xml')
        parser = etree.XMLParser(recover=True, remove_blank_text=True)
        tree = etree.parse(section_path, parser)
        root = tree.getroot()
        
        # 본문 섹션 찾기
        sec = None
        for elem in root.iter():
            if elem.tag.endswith('sec'):
                sec = elem
                break
        if sec is None: sec = root
        
        # 기존 내용 삭제 (Template이 빈 파일이면 상관없음)
        # sec.clear() # 위험할 수 있으니 유지하거나... 보통 템플릿은 빔.
        
        # XML 주입
        if xml_content:
            wrapped_xml = (
                f"<root xmlns:hp='{NAMESPACES['hp']}' "
                f"xmlns:hc='{NAMESPACES['hc']}' "
                f"xmlns:hm='{NAMESPACES['hm']}' "
                f"xmlns:hp10='{NAMESPACES['hp10']}'>"
                f"{xml_content}"
                "</root>"
            )
            try:
                frag_tree = etree.fromstring(wrapped_xml.encode('utf-8'), parser=parser)
                
                # [Sanitization Strategy: Bare Bones]
                # 스타일 참조를 '0'으로 설정하는 것조차 위험할 수 있음 (템플릿에 0번 스타일 정의가 없을 수 있음)
                # 따라서 모든 스타일/ID 참조 속성을 아예 삭제(Drop)하여 HWP가 기본값을 쓰도록 강제함.

                DANGEROUS_ATTRIBUTES = [
                    'styleIDRef', 'numberingIdRef', 'borderFillIDRef', 'imageIDRef', 'trackChangeIDRef',
                    'imgIDRef', 'footNotePrIDRef', 'endNotePrIDRef', 'zoneIDRef', 'uid'
                ]
                # paraPrIDRef, charPrIDRef, tabPrIDRef는 스타일 복원을 위해 유지해야 함!
                # 하지만 아래 로직에서 paraPrIDRef='0'으로 덮어쓰거나 embed 된 걸 쓴다면?
                # 현재 parse_hwpx.py는 'paraPrIDRef'를 그대로 둠.
                # 그리고 header.xml을 덮어쓰므로 IDRef는 유효함.
                # 따라서 DANGEROUS에서 IDRef들을 빼거나, 최소한 para/char/tab은 살려야 함.
                
                # 250105: Layout & Spacing Restoration
                # 'colPr', 'secPr', 'pagePr': 레이아웃(다단 등) 유지를 위해 보존.
                # 's': 공백/띄어쓰기 유지를 위해 보존.
                REMOVE_TAGS_SIMPLE = ['lineSeg', 'lineseg', 'trackChange', 'memo', 'history', 
                                      'fieldBegin', 'fieldEnd', 'header', 'footer'] 
                
                # 삭제 대상 수집
                elems_to_remove = []
                
                # 1. 모든 요소 순회하며 단순 태그 및 위험 속성 제거
                for elem in frag_tree.iter():
                    # [Sanitize Section Properties]
                    if elem.tag.endswith('secPr'):
                         # Force disable Master Page and Page Border in inserted questions
                         if 'masterPageCnt' in elem.attrib:
                             elem.set('masterPageCnt', '0')
                         if 'borderFillIDRef' in elem.attrib:
                             if 'id' not in elem.attrib: # Don't remove if it is just a def? No, ref.
                                 del elem.attrib['borderFillIDRef']
                         
                         # Remove pageBorderFill child
                         for child in list(elem):
                             if child.tag.endswith('pageBorderFill'):
                                 elem.remove(child)

                    # 속성 정화
                    for attr in list(elem.attrib.keys()): 
                        # 원본 스타일을 쓸 때는 IDRef 유지, 아닐 때는 삭제 (깨짐 방지)
                        should_remove = attr in DANGEROUS_ATTRIBUTES or attr == 'id'
                        if not header_content and attr.endswith('IDRef'):
                            should_remove = True
                            
                        if should_remove:
                             del elem.attrib[attr]
                    
                    # 단순 태그 삭제 목록 확인
                    for t in REMOVE_TAGS_SIMPLE:
                        if elem.tag.endswith(t):
                            elems_to_remove.append(elem)
                            
                # [Force Style Injection]
                # If we are not preserving original header, force 'Style 1' (Ctrl+2 / Body)
                if not header_content:
                    for elem in frag_tree.iter():
                        if elem.tag.endswith('p'):
                            elem.set('styleIDRef', '1')
                            # paraPrIDRef도 1로 설정하여 문단 모양 따르게 함
                            elem.set('paraPrIDRef', '1')
                
                # 2. 컨트롤(ctrl) 정화 - Whitelist 방식
                for elem in frag_tree.iter():
                    if elem.tag.endswith('ctrl'):
                        is_safe = False
                        for child in elem.iter():
                            if child.tag.endswith('equation') or child.tag.endswith('tbl'):
                                is_safe = True
                                break
                        
                        if not is_safe:
                            elems_to_remove.append(elem)

                # 중복 제거 및 삭제 실행
                seen = set()
                for e in elems_to_remove:
                    if e in seen: continue
                    seen.add(e)
                    p_node = e.getparent()
                    if p_node is not None: p_node.remove(e)

                # Append to sec with structure check
                for child in frag_tree:
                    if child.tag.endswith('p'):
                        sec.append(child)
                    elif child.tag.endswith('run'):
                        p = etree.Element(f"{{{NAMESPACES['hp']}}}p")
                        p.set('paraPrIDRef', '0'); p.set('styleIDRef', '0')
                        p.append(child)
                        sec.append(p)
                    else:
                        if child.tag == 'root': continue
                        p = etree.Element(f"{{{NAMESPACES['hp']}}}p")
                        p.set('paraPrIDRef', '0'); p.set('styleIDRef', '0')
                        run = etree.SubElement(p, f"{{{NAMESPACES['hp']}}}run")
                        run.set('charPrIDRef', '0')
                        run.append(child)
                        sec.append(p)
                        
            except Exception as e:
                print(f"Fragment parse error: {e}")
                # Fallback text
                p = etree.Element(f"{{{NAMESPACES['hp']}}}p")
                run = etree.SubElement(p, f"{{{NAMESPACES['hp']}}}run")
                t = etree.SubElement(run, f"{{{NAMESPACES['hp']}}}t")
                t.text = "Error parsing content"
                sec.append(p)

        # Save & Zip
        tree.write(section_path, encoding='utf-8', xml_declaration=True, standalone=True)
        with zipfile.ZipFile(temp_output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root_dir, _, files in os.walk(work_dir):
                for file in files:
                    abs_path = os.path.join(root_dir, file)
                    rel_path = os.path.relpath(abs_path, work_dir)
                    zf.write(abs_path, rel_path)
                    
        return temp_output_path
        
    except Exception as e:
        print(f"Error creating temp hwpx: {e}")
        return None
    finally:
        try: shutil.rmtree(work_dir)
        except: pass

def generate_hwpx(json_path, template_path, output_path):
    print(f"Generating HWPX directly from {json_path}")
    
    # 임시 디렉토리 생성
    temp_dir = os.path.join(os.path.dirname(output_path), "temp_" + str(uuid.uuid4())[:8])
    os.makedirs(temp_dir, exist_ok=True)

    try:
        # JSON 로드
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # 템플릿 압축 해제
        with zipfile.ZipFile(template_path, 'r') as zf:
            zf.extractall(temp_dir)

        # section0.xml 경로
        section_path = os.path.join(temp_dir, 'Contents', 'section0.xml')
        parser = etree.XMLParser(recover=True, remove_blank_text=True)
        tree = etree.parse(section_path, parser)
        root = tree.getroot()
        
        # 본문 섹션 찾기
        sec = None
        for elem in root.iter():
            if elem.tag.endswith('sec'):
                sec = elem
                break
        if sec is None: sec = root
        
        # (옵션) 템플릿 본문 비우기?
        # for child in list(sec): sec.remove(child)

        # 질문 데이터 순회 및 병합
        for item in data:
            xml_content = item.get('text', '')
            if not xml_content: continue
            
            wrapped_xml = (
                f"<root xmlns:hp='{NAMESPACES['hp']}' "
                f"xmlns:hc='{NAMESPACES['hc']}' "
                f"xmlns:hm='{NAMESPACES['hm']}' "
                f"xmlns:hp10='{NAMESPACES['hp10']}'>"
                f"{xml_content}"
                "</root>"
            )

            try:
                frag_tree = etree.fromstring(wrapped_xml.encode('utf-8'), parser=parser)
                
                # [Minimal Sanitization]
                # Automation을 쓰지 않으므로, 뷰어에서 파일이 열리도록 바이너리 리소스만 제거함.
                # 스타일(IDRef)이나 레이아웃(secPr)은 최대한 유지하여 '원본과 다름' 방지.
                
                REMOVE_TAGS = ['pic', 'ole', 'container', 'video', 'chart', 'drawing', 'trackChange', 'memo', 'history']
                
                elems_to_remove = []
                for elem in frag_tree.iter():
                    for t in REMOVE_TAGS:
                        if elem.tag.endswith(t):
                            # 컨트롤 감싸고 있으면 컨트롤째로 제거
                            target = elem
                            p = elem
                            for _ in range(3):
                                if p is None: break
                                if p.tag.endswith('ctrl'):
                                    target = p
                                    break
                                p = p.getparent()
                            elems_to_remove.append(target)
                            break
                            
                # 중복 제거 및 삭제
                seen = set()
                for e in elems_to_remove:
                    if e in seen: continue
                    seen.add(e)
                    p_node = e.getparent()
                    if p_node is not None: p_node.remove(e)

                # Append with Structure Check
                for child in frag_tree:
                    if child.tag.endswith('p'):
                        sec.append(child)
                    elif child.tag.endswith('run'):
                        p = etree.Element(f"{{{NAMESPACES['hp']}}}p")
                        # 스타일 미지정 (기본값)
                        p.append(child)
                        sec.append(p)
                    else:
                        if child.tag == 'root': continue
                        p = etree.Element(f"{{{NAMESPACES['hp']}}}p")
                        run = etree.SubElement(p, f"{{{NAMESPACES['hp']}}}run")
                        run.append(child)
                        sec.append(p)

            except Exception as e:
                print(f"Warning: XML Fragment Error: {e}")
                # Fallback: Plain Text
                clean_text = re.sub(r'<[^>]*>', '', xml_content)
                if clean_text.strip():
                    p = etree.Element(f"{{{NAMESPACES['hp']}}}p")
                    run = etree.SubElement(p, f"{{{NAMESPACES['hp']}}}run")
                    t = etree.SubElement(run, f"{{{NAMESPACES['hp']}}}t")
                    t.text = clean_text
                    sec.append(p)

        # Save
        tree.write(section_path, encoding='utf-8', xml_declaration=True, standalone=True)

        # Zip
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root_dir, _dirs, files in os.walk(temp_dir):
                for file in files:
                    abs_path = os.path.join(root_dir, file)
                    rel_path = os.path.relpath(abs_path, temp_dir)
                    zf.write(abs_path, rel_path)

        print(f"Created HWPX at {output_path}")

    except Exception as e:
        print(f"Critical Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        if os.path.exists(temp_dir):
            try: shutil.rmtree(temp_dir)
            except: pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('json_path')
    parser.add_argument('template_path')
    parser.add_argument('output_path')
    args = parser.parse_args()
    
    generate_hwpx(args.json_path, args.template_path, args.output_path)
