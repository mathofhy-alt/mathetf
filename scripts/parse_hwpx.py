import sys
import os
import io
import zipfile
import json
import re
import argparse
import traceback
from lxml import etree

# Windows Console Encoding Fix
sys.stdout = io.TextIOWrapper(sys.stdout.detach(), encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.detach(), encoding='utf-8')

def local_name_xpath(tag):
    return f".//*[local-name()='{tag}']"

def get_tag_no_ns(tag):
    return tag.split('}')[-1] if '}' in tag else tag

def extract_plain_text(nodes):
    text = ""
    for node in nodes:
        for child in node.iter():
            tag = get_tag_no_ns(child.tag)
            if tag == 't':
                if child.text: text += child.text
            elif tag == 'lineBreak':
                text += "\n"
            elif tag == 'tab':
                text += "\t"
        text += " "
    return text.strip()

def serialize_nodes(nodes):
    res = ""
    for node in nodes:
        res += etree.tostring(node, encoding='unicode')
    return res

def extract_questions(section_root):
    questions = []
    current_num = 0
    current_nodes = []
    
    for child in section_root:
        if get_tag_no_ns(child.tag) != 'p': continue
        
        p = child
        has_question_start = False
        new_num = 0
        
        # EndNote Check
        endnotes = p.xpath(local_name_xpath('endNote'))
        for en in endnotes:
            autonums = en.xpath(local_name_xpath('autoNum'))
            for an in autonums:
                if an.get('numType') == 'ENDNOTE':
                    try:
                        new_num = int(an.get('num'))
                        has_question_start = True
                    except: pass
            if has_question_start: break
        
        if has_question_start:
            if current_num > 0 and current_nodes:
                questions.append({
                    'number': current_num,
                    'nodes': current_nodes,
                })
            current_num = new_num
            current_nodes = [p]
        else:
            if current_num > 0:
                current_nodes.append(p)
                
    if current_num > 0 and current_nodes:
        questions.append({
            'number': current_num,
            'nodes': current_nodes,
        })
        
    return questions

def process(hwpx_path):
    temp_dir = hwpx_path + "_unzip"
    try:
        with zipfile.ZipFile(hwpx_path, 'r') as zf:
            zf.extractall(temp_dir)
            
        header_path = os.path.join(temp_dir, 'Contents', 'header.xml')
        section_path = os.path.join(temp_dir, 'Contents', 'section0.xml')
        
        if not os.path.exists(header_path):
             header_path = os.path.join(temp_dir, 'header.xml')
        if not os.path.exists(section_path):
             section_path = os.path.join(temp_dir, 'section0.xml')
             
        if not os.path.exists(section_path):
            raise Exception("section0.xml not found")

        # Read Header Content
        with open(header_path, 'r', encoding='utf-8') as f:
            header_content = f.read()

        # Parse Section
        parser = etree.XMLParser(recover=True)
        section_tree = etree.parse(section_path, parser)
        section_root = section_tree.getroot()
        
        # Extract Questions
        raw_questions = extract_questions(section_root)
        
        if not raw_questions:
             # If no questions found via EndNote, treat entire file as 1 question?
             # For now, enforce EndNote.
             pass

        final_output = []
        for q in raw_questions:
            content_xml = serialize_nodes(q['nodes'])
            plain_text = extract_plain_text(q['nodes'])
            
            final_output.append({
                'number': q['number'],
                'plain_text': plain_text,
                'xml_data': {
                    'header': header_content,
                    'content': content_xml
                }
            })
            
        print(json.dumps(final_output))
        
    except Exception as e:
        sys.stderr.write(f"Error: {e}\n")
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    finally:
        import shutil
        if os.path.exists(temp_dir):
            try: shutil.rmtree(temp_dir)
            except: pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('input_path')
    args = parser.parse_args()
    process(args.input_path)
