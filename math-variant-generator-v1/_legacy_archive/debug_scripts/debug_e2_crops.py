import asyncio
import os
import fitz
from PIL import Image
import cv2
import numpy as np
from gemini_client import GeminiMathParser
import google.generativeai as genai
import typing_extensions as typing_ext

async def process_page(parser, pdf_path, page_num):
    local_doc = fitz.open(pdf_path)
    page = local_doc[page_num]
    mat = fitz.Matrix(5, 5)
    pix = page.get_pixmap(matrix=mat)
    mode = "RGBA" if pix.alpha else "RGB"
    img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
    if mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    local_doc.close()
        
    discovery_prompt = parser._get_vision_rules() + f"\n\n이 이미지는 전체 문서의 {page_num + 1}번째 페이지입니다. 이미지에 존재하는 모든 문제에 대해 각각의 번호와 본문이 차지하는 세로 좌표(start_y, end_y), 그리고 단(column: left/right/full) 정보를 찾아 배열 형태로 출력하세요.\n- [경고] 1번이나 3번 문제 상단에 위치한 과목명, 교시 등(예: [수학 영역])을 나타내는 네모 박스나 타이틀 텍스트는 **절대로 start_y에 포함하지 마세요**. 무조건 '1.', '3.' 과 같이 문항 번호가 시작하는 물리적 텍스트 위치부터 start_y로 타겟팅하세요."
    
    class MathProblemDiscovery(typing_ext.TypedDict):
        q_num: str
        start_y: float
        end_y: float
        column: str
        
    retries = 0
    problem_list = []
    while retries < 3:
        try:
            resp = await parser.flash_model.generate_content_async(
                [img, discovery_prompt],
                generation_config=genai.types.GenerationConfig(
                    temperature=0.0,
                    response_mime_type="application/json",
                    response_schema=list[MathProblemDiscovery]
                )
            )
            import json
            problem_list = json.loads(resp.text)
            if problem_list and isinstance(problem_list, list): 
                break
        except Exception as e:
            print(f"Vision 오류: {e}")
            pass
        retries += 1
        await asyncio.sleep(1)
    
    padded_img = img

    for prob_data in problem_list:
        q_num = str(prob_data.get('q_num', '')).replace(".", "").strip()
        if not q_num: continue
        sy = float(prob_data.get('start_y', 0.0))
        ey = float(prob_data.get('end_y', 1.0))
        if sy > 1.0: sy /= 1000.0
        if ey > 1.0: ey /= 1000.0
        if sy > ey: sy, ey = ey, sy 
        if ey - sy < 0.02: ey = min(1.0, sy + 0.1) 
        
        col = prob_data.get('column', 'full').lower()
        min_sy_limit = 0.0
        max_ey_limit = 1.0
        for other_p in problem_list:
            other_col = other_p.get('column', 'full').lower()
            if other_col == col:
                other_sy = float(other_p.get('start_y', 1.0))
                other_ey = float(other_p.get('end_y', 0.0))
                if other_sy > sy + 0.01: max_ey_limit = min(max_ey_limit, other_sy)
                if other_ey < ey - 0.01: min_sy_limit = max(min_sy_limit, other_ey)
        
        sy = max(0.0, max(sy - 0.015, min_sy_limit)) 
        ey = min(1.0, min(ey + 0.020, max_ey_limit))
        if ey <= sy: ey = min(1.0, sy + 0.02)

        sx = 0
        ex = padded_img.width
        if col == "left":
            ex = int(padded_img.width * 0.52) 
        elif col == "right":
            sx = int(padded_img.width * 0.48) 
            
        crop_box = (sx, int(sy * padded_img.height), ex, int(ey * padded_img.height))
        cropped_img = padded_img.crop(crop_box)
        
        try:
            open_cv_image = np.array(cropped_img) 
            if len(open_cv_image.shape) == 3 and open_cv_image.shape[2] == 4: 
                 open_cv_image = cv2.cvtColor(open_cv_image, cv2.COLOR_RGBA2RGB)
            gray = cv2.cvtColor(open_cv_image, cv2.COLOR_RGB2GRAY)
            _, thresh = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
            
            row_sums = np.sum(thresh, axis=1)
            y_nonzero = np.where(row_sums > 0)[0]
            
            if len(y_nonzero) > 0:
                trim_y1 = max(0, y_nonzero[0] - 10)
                trim_y2 = min(gray.shape[0], y_nonzero[-1] + 10)
                
                valid_thresh = thresh[trim_y1:trim_y2, :]
                col_sums = np.sum(valid_thresh, axis=0)
                x_nonzero = np.where(col_sums > 0)[0]
                
                if len(x_nonzero) > 0:
                    trim_x1 = max(0, x_nonzero[0] - 10)
                    trim_x2 = min(gray.shape[1], x_nonzero[-1] + 10)
                else:
                    trim_x1, trim_x2 = 0, gray.shape[1]
                    
                cropped_img = cropped_img.crop((trim_x1, trim_y1, trim_x2, trim_y2))
                print(f"문항 {q_num} OpenCV 트리밍 완료: Projection Matrix Margin 10 적용")
        except Exception as e:
            pass
        
        cropped_img.save(f"debug_crop_opencv_{q_num}.png")
        print(f"[{page_num+1}쪽] 문항 {q_num} 트리밍 및 저장 완료")

async def main():
    api_key_path = os.path.join("dist", "gemini_api_key.txt")
    if not os.path.exists(api_key_path):
        print(f"API key missing: {api_key_path}")
        return
        
    api_key = open(api_key_path, encoding="utf-8").read().strip()
    parser = GeminiMathParser(api_key=api_key, model_name="Mathpix & Gemini 3.1 Pro 하이브리드")
    pdf_path = os.path.join("dist", "e2.pdf")
    
    print(f"[{pdf_path}] 전체 페이지 병렬 크롭 테스트 시작 (강제 스키마 적용)...")
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    doc.close()
    
    tasks = []
    for i in range(total_pages):
        tasks.append(process_page(parser, pdf_path, i))
    
    await asyncio.gather(*tasks)
    print("ALL DONE")

if __name__ == "__main__":
    import sys
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
