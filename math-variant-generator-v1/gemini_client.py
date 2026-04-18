import os
import asyncio
import datetime
from typing import List, Dict, Optional, Callable
import json
import typing_extensions as typing_ext
import re
import fitz
import tempfile
import time
from PIL import Image
import urllib.request
import urllib.error
import base64
import google.generativeai as genai

class GeminiMathParser:
    def __init__(self, api_key: str, model_name: str = None, curriculum: str = "고1 수준 (공통수학)", mathpix_app_id: str = "", mathpix_app_key: str = ""):
        self.api_key = api_key
        self.curriculum = curriculum
        self.mathpix_app_id = mathpix_app_id
        self.mathpix_app_key = mathpix_app_key
        self.use_mathpix = model_name and "Mathpix" in model_name
        genai.configure(api_key=self.api_key)
        
        formatter_rules = """[System Instructions for Mathematical Text Formatting]
You are a strict text formatter. Your ONLY job is to wrap mathematical formulas, variables, and numbers using the `[[EQUATION:...]]` tag.
CRITICAL RULES:
1. NEVER SUMMARIZE, MODIFY, OR DELETE ANY TEXT from the original input. You must preserve the EXACT length and content of the original Korean sentences.
2. DO NOT SOLVE THE PROBLEM. Do not add or remove logical steps.
3. Every single sentence from the original text must appear in your output, just with equations formatted.
4. [초엄격: LaTeX 절대 금지, 오직 HWP(한글) 수식 문법 사용]
   - 분수: `\\frac{A}{B}`는 반드시 `{A} over {B}` 형태의 **HWP 수식어**로 변환하세요 (우선순위를 위해 전체 중괄호 `{ }` 필수!). (예: `\\frac{1}{2}` -> `{1} over {2}`)
   - 그리스 문자: 역슬래시 단독 제거 (`\\alpha` -> `alpha`, `\\beta` -> `beta`)
   - 괄호 등 크기조절 기호: 분수(`over`)를 감싸는 괄호는 일반 괄호 `( )` 대신 반드시 `LEFT ( ... RIGHT )`를 사용하세요.
   - 사칙연산 앞뒤 공백 강제: `+`, `-`, `=` 기호 앞뒤로는 무조건 한 칸 띄어쓰기를 넣으세요.
"""
        
        # User-selected dynamic modeling
        if model_name and ("하이브리드" in model_name or "Mathpix" in model_name):
            # 🚀 v8.17 One-Pass: Discovery(Flash), Extraction/Solution(Pro)
            self.model = genai.GenerativeModel("gemini-3.1-pro-preview", system_instruction=self._get_core_rules(), tools="code_execution")
            self.flash_model = genai.GenerativeModel("gemini-3-flash-preview", system_instruction=self._get_parsing_rules(), tools="code_execution")
            if "Flash" in model_name and "Mathpix" in model_name:
                self.pro_model = genai.GenerativeModel("gemini-3-flash-preview", system_instruction=self._get_parsing_rules(), tools="code_execution")
                self.pro_model_clean = genai.GenerativeModel("gemini-3-flash-preview", tools="code_execution")
            else:
                self.pro_model = genai.GenerativeModel("gemini-3.1-pro-preview", system_instruction=self._get_parsing_rules(), tools="code_execution")
                self.pro_model_clean = genai.GenerativeModel("gemini-3.1-pro-preview", tools="code_execution")
            self.formatter_model = genai.GenerativeModel("gemini-3-flash-preview", system_instruction=formatter_rules)
            # 수식 번역기는 Flash (빠르고 Few-Shot이 충분하면 OK)
            self.math_translator_model = genai.GenerativeModel("gemini-3-flash-preview")
        else:
            target_model = "gemini-3.1-pro-preview"
            if model_name:
                if "flash" in model_name.lower():
                    target_model = "gemini-3-flash-preview"
                elif "pro" in model_name.lower():
                    target_model = "gemini-3.1-pro-preview"
                    
            self.model = genai.GenerativeModel(target_model, system_instruction=self._get_core_rules(), tools="code_execution") 
            self.flash_model = genai.GenerativeModel(target_model, system_instruction=self._get_parsing_rules(), tools="code_execution") 
            self.pro_model = genai.GenerativeModel(target_model, system_instruction=self._get_parsing_rules(), tools="code_execution") 
            self.pro_model_clean = genai.GenerativeModel(target_model, tools="code_execution")
            self.formatter_model = genai.GenerativeModel(target_model, system_instruction=formatter_rules)
        
        # 수식 번역기: Flash (빠르고 Few-Shot이 충분하면 OK)
        self.math_translator_model = genai.GenerativeModel("gemini-3-flash-preview")


    async def _call_mathpix_async(self, img_obj, log_fn: Callable) -> str:
        if not self.mathpix_app_id or not self.mathpix_app_key:
            log_fn("    [Mathpix] App ID 또는 App Key가 설정되지 않았습니다.")
            return ""
        
        import base64
        import io
        import json
        import urllib.request
        import urllib.error
        
        try:
            buf = io.BytesIO()
            img_obj.save(buf, format='JPEG')
            encoded_string = base64.b64encode(buf.getvalue()).decode('utf-8')
            
            url = "https://api.mathpix.com/v3/text"
            headers = {
                "app_id": self.mathpix_app_id,
                "app_key": self.mathpix_app_key,
                "Content-type": "application/json"
            }
            payload = {
                "src": f"data:image/jpeg;base64,{encoded_string}",
                "formats": ["text"],
                "data_options": {"include_asciimath": True},
                "rmode": "text"
            }
            
            log_fn("    [Mathpix] API 호출 전송 중...")
            
            def _sync_request():
                data = json.dumps(payload).encode('utf-8')
                req = urllib.request.Request(url, data=data, headers=headers, method='POST')
                try:
                    with urllib.request.urlopen(req, timeout=30) as response:
                        res_body = response.read().decode('utf-8')
                        return json.loads(res_body).get("text", "")
                except urllib.error.HTTPError as e:
                    err_body = e.read().decode('utf-8')
                    return f"HTTPError {e.code}: {err_body}"
                except Exception as ex:
                    return f"Exception: {str(ex)}"

            res = await asyncio.to_thread(_sync_request)
            
            if str(res).startswith("HTTPError") or str(res).startswith("Exception"):
                log_fn(f"    [Mathpix] API 에러: {res}")
                return ""
            else:
                log_fn("    [Mathpix] 텍스트 반환 완료 (초고속 전사)!")
                return res
                
        except Exception as e:
            log_fn(f"    [Mathpix] 통신 예외 발생: {e}")
            return ""


    async def extract_math_problems(self, pdf_path: str, log_callback: Optional[Callable[[str], None]] = None, generate_variants: bool = False, variant_difficulty: str = "1단계") -> List[Dict]:
        all_problems = []
        
        def _log(msg):
            # No print here to avoid duplicate logs in GUI/Terminal
            if log_callback:
                log_callback(msg)

        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        doc.close()
        _log(f"PDF 오픈 완료: {total_pages}페이지")
        
        # V10.1 스로틀링 고도화 (Jitter 탑재로 인한 안정성 확보) -> 모델 티어별 비동기 큐 분리
        is_flash = "flash" in getattr(self, 'pro_model', self.model).model_name.lower()
        pass1_sem = asyncio.Semaphore(15)
        pass2_sem = asyncio.Semaphore(5 if is_flash else 3)
        pass3_sem = asyncio.Semaphore(15)
        
        # [V12.5.17 FIX] 전역 seen_q: 페이지 번호(2, 4, 6...)가 문제번호로 오인식되는 현상 차단
        # 동일 번호가 다른 페이지에서 다시 나오면(= 페이지 번호) 무조건 무시한다
        global_seen_q = set()
        global_seen_q_lock = asyncio.Lock()

        async def _process_page_inner(page_num):
            _log(f"  -> [{page_num + 1}페이지] 이미지 렌더링 시작...")
            
            def _render_page_thread(p_num):
                # PyMuPDF is not thread-safe, so open a local instance per thread
                local_doc = fitz.open(pdf_path)
                page = local_doc[p_num]
                
                # [CRITICAL FIX] 5x5 고해상도 렌더링
                mat = fitz.Matrix(5, 5)
                pix = page.get_pixmap(matrix=mat)
                mode = "RGBA" if pix.alpha else "RGB"
                img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
                if mode == "RGBA":
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    bg.paste(img, mask=img.split()[3])
                    img = bg
                
                blocks = page.get_text("blocks")
                page_w = page.rect.width
                page_h = page.rect.height
                
                local_doc.close()
                
                padding_height = 200
                padded_img = Image.new("RGB", (img.width, img.height + padding_height), (255, 255, 255))
                padded_img.paste(img, (0, 0))
                
                import tempfile, os
                with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                    padded_img_path = tmp.name
                padded_img.save(padded_img_path, format="JPEG", quality=95)
                return padded_img, padded_img_path, blocks, page_w, page_h

            padded_img, padded_img_path, blocks, page_w, page_h = await asyncio.to_thread(_render_page_thread, page_num)
            
            try:
                import re, os
                q_pattern = re.compile(r'^\s*(\d[\d\s]*)(?:[\)\.\n]|$)')
                base_img_h = page_h * 5.0
                padded_h = base_img_h + 200.0

                # ── [V12.6 YOLO 우선 감지] ────────────────────────────────────────────
                import sys as _sys
                _exe_dir = os.path.dirname(_sys.executable) if getattr(_sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
                YOLO_MODEL_PATH = os.path.join(_exe_dir, "problem_detector.pt")
                problem_list = []
                yolo_used = False

                if os.path.exists(YOLO_MODEL_PATH):
                    try:
                        from ultralytics import YOLO as _YOLO
                        _log(f"  -> [{page_num + 1}페이지] 🤖 YOLO v8 감지 모드 (problem_detector.pt)")
                        _yolo_model = _YOLO(YOLO_MODEL_PATH)
                        # padded_img를 임시 파일로 저장 후 추론
                        import tempfile
                        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as _tf:
                            _tmp_path = _tf.name
                        padded_img.save(_tmp_path, "JPEG", quality=95)
                        _results = _yolo_model(_tmp_path, conf=0.25, verbose=False)
                        os.remove(_tmp_path)

                        _boxes = _results[0].boxes if _results and _results[0].boxes else None
                        if _boxes and len(_boxes) > 0:
                            _img_w, _img_h = padded_img.size
                            yolo_detections = []
                            for _box in _boxes:
                                _xyxy = _box.xyxy[0].cpu().numpy()
                                _x1, _y1, _x2, _y2 = float(_xyxy[0]), float(_xyxy[1]), float(_xyxy[2]), float(_xyxy[3])
                                _sy_ratio = _y1 / _img_h
                                _ey_ratio = _y2 / _img_h
                                _cx = (_x1 + _x2) / 2.0
                                _col = "left" if _cx < _img_w * 0.5 else "right"
                                yolo_detections.append({
                                    'sy_abs': int(_y1), 'ey_abs': int(_y2),
                                    'sx_abs': int(_x1), 'ex_abs': int(_x2),
                                    'start_y': _sy_ratio, 'end_y': _ey_ratio,
                                    'column': _col,
                                    'q_num': None
                                })

                            # 각 YOLO 박스에 텍스트 블록으로 문제 번호 매핑
                            yolo_detections.sort(key=lambda d: d['sy_abs'])
                            page_seen_q = set()
                            assigned_count = 0
                            for _det in yolo_detections:
                                best_q = None
                                for b in blocks:
                                    if len(b) >= 5 and b[6] == 0:
                                        bx0, by0, bx1, by1, btxt = b[:5]
                                        btxt = btxt.strip()
                                        if not btxt: continue
                                        # 문제 번호는 반드시 좌측 여백에 위치 (보기 선지/수식 숫자 오인식 차단)
                                        is_valid_x = (bx0 < page_w * 0.20) or (page_w * 0.45 < bx0 < page_w * 0.65)
                                        if not is_valid_x: continue
                                        # YOLO 박스 안에 들어오는 텍스트 블록인지 (5x 스케일 고려)
                                        by0s = by0 * 5.0
                                        if _det['sy_abs'] <= by0s <= _det['ey_abs']:
                                            _m = q_pattern.match(btxt)
                                            if _m:
                                                raw_q = _m.group(1).replace(" ", "")
                                                try:
                                                    int_q = int(raw_q)
                                                    if int_q == 0 or int_q > 150: continue
                                                except: continue
                                                if raw_q not in page_seen_q:
                                                    best_q = raw_q
                                                    break
                                if best_q:
                                    page_seen_q.add(best_q)
                                    _det['q_num'] = best_q
                                    assigned_count += 1
                                else:
                                    _det['q_num'] = f"?{assigned_count+1}"
                                    assigned_count += 1

                            problem_list = [{
                                'q_num': d['q_num'],
                                'start_y': d['start_y'],
                                'end_y': d['end_y'],
                                'column': d['column'],
                            } for d in yolo_detections if d['q_num']]
                            yolo_used = True
                            _log(f"  -> [{page_num + 1}페이지] YOLO 감지 완료: {[p['q_num'] for p in problem_list]}")


                    except Exception as _ye:
                        _log(f"  -> [{page_num + 1}페이지] ⚠️ YOLO 추론 실패({_ye}), 정규식 폴백으로 전환")
                        problem_list = []
                        yolo_used = False

                # ── [정규식 폴백] YOLO 미사용/실패 시 ────────────────────────────────
                if not yolo_used:
                    _log(f"  -> [{page_num + 1}페이지] 정규식 기반 물리 레이아웃 분석 중... (지연 제로, AI 배제)")
                    page_seen_q = set()
                    for b in blocks:
                        if len(b) >= 5 and b[6] == 0:
                            x0, y0, x1, y1, text = b[:5]
                            if y0 > page_h * 0.9: continue
                            if y0 < page_h * 0.06: continue
                            text = text.strip()
                            if not text: continue
                            is_valid_x = (x0 < page_w * 0.20) or (page_w * 0.45 < x0 < page_w * 0.65)
                            if not is_valid_x: continue
                            match = q_pattern.match(text)
                            if match:
                                raw_q = match.group(1).replace(" ", "")
                                try:
                                    int_q = int(raw_q)
                                    if int_q == 0 or int_q > 150: continue
                                except: continue
                                if raw_q in global_seen_q: continue
                                if raw_q not in page_seen_q:
                                    page_seen_q.add(raw_q)
                                    col_str = "left" if x0 < page_w / 2.0 else "right"
                                    sy_ratio = (y0 * 5.0) / padded_h
                                    problem_list.append({
                                        'q_num': raw_q,
                                        'start_y': sy_ratio,
                                        'column': col_str
                                    })

                # ── 컬럼별 정렬 & end_y 할당 ─────────────────────────────────────────
                if not yolo_used:
                    # 정규식 폴백: end_y 자동 계산
                    col_groups = {'left': [], 'right': [], 'full': []}
                    for p in problem_list:
                        col_groups[p.get('column', 'full')].append(p)
                    final_problem_list = []
                    for c_key in ['left', 'right', 'full']:
                        col_groups[c_key].sort(key=lambda x: x['start_y'])
                        g_list = col_groups[c_key]
                        for i in range(len(g_list)):
                            curr = g_list[i]
                            if i < len(g_list) - 1:
                                curr['end_y'] = g_list[i+1]['start_y']
                            else:
                                curr['end_y'] = (base_img_h * 0.94) / padded_h
                            final_problem_list.append(curr)
                    problem_list = final_problem_list

                if not problem_list:
                    _log(f"  -> [{page_num + 1}페이지] 유효 문항 없음.")
                    return []

                problem_numbers = [str(x.get('q_num', '')).strip() for x in problem_list]
                _log(f"  -> [{page_num + 1}페이지] {'YOLO' if yolo_used else '정규식'} 감지: {len(problem_numbers)}개 문항: {problem_numbers}")
                async with global_seen_q_lock:
                    for pn in problem_numbers:
                        global_seen_q.add(pn)
                # -------------------------------------------------------------------------


                # 3. 개별 문항 추출 (Crop 1:1 모드)
                tasks = []
                for idx, prob_data in enumerate(problem_list):
                    q_num = str(prob_data.get('q_num', '')).replace(".", "").strip()
                    if not q_num: continue
                    
                    try:
                        sy = float(prob_data.get('start_y', 0.0))
                        ey = float(prob_data.get('end_y', 1.0))
                        if sy > ey: sy, ey = ey, sy # 역전 방지
                        if ey - sy < 0.02: ey = min(1.0, sy + 0.1) # 최소 높이 보장
                        
                        col = prob_data.get('column', 'full').lower()
                        
                        # [물리적 여백 침범 완벽 방어막 - V11.8.13]
                        # 인접 문항의 좌표를 전수 조사하여 절대 침범 불가 한계선(Limit) 설정
                        min_sy_limit = 0.0
                        max_ey_limit = 1.0
                        for other_p in problem_list:
                            other_col = other_p.get('column', 'full').lower()
                            if other_col == col:
                                other_sy = float(other_p.get('start_y', 1.0))
                                other_ey = float(other_p.get('end_y', 0.0))
                                if other_sy > sy + 0.01: # 내 아래에 있는 문항 중 가장 가까운 것
                                    max_ey_limit = min(max_ey_limit, other_sy)
                                if other_ey < ey - 0.01: # 내 위에 있는 문항 중 가장 가까운 것
                                    min_sy_limit = max(min_sy_limit, other_ey)
                        
                        # 여유를 주되, 인접 문항 경계선(Limit)까지만 정확히 허용하여 하단 수식 잘림(Clipping) 완벽 방지
                        sy = max(0.0, max(sy - 0.010, min_sy_limit)) 
                        # [V12.5.17 FIX] 하단 패딩을 max_ey_limit 기준으로 엄격 제한
                        # max_ey_limit = 다음 문제 start_y이므로 그보다 10px(ratio≈0.002) 앞에서 끊음
                        ey_padded = min(ey + 0.010, max_ey_limit - 0.003)
                        ey = min(1.0, ey_padded)
                        if ey <= sy: ey = min(1.0, sy + 0.02) # 초소형 방어선
                        
                        # [V12.5.16 FIX] 오른쪽 컬럼 문제가 페이지 상단 헤더(♦——♦ 구분선) 영역에서 시작하는 경우
                        # start_y가 헤더선(≈6%) 위에 있으면, 헤더 아래로 밀어내서 크롭 시 헤더만 잡히는 현상 방지
                        HEADER_LINE_Y = 0.07  # 페이지 상단 구분선이 전체 높이의 약 7% 위치
                        if col == 'right' and sy < HEADER_LINE_Y:
                            sy = HEADER_LINE_Y
                        
                        sx = 0
                        ex = padded_img.width
                        if col == "left":
                            ex = int(padded_img.width * 0.52) # 오른쪽 여유 2% 포함
                        elif col == "right":
                            sx = int(padded_img.width * 0.48) # 왼쪽 여유 2% 포함
                            
                        # Crop image visually
                        crop_box = (sx, int(sy * padded_img.height), ex, int(ey * padded_img.height))
                        cropped_img = padded_img.crop(crop_box)
                        
                        # [OpenCV Hybrid Trim] 정밀 여백 제거
                        try:
                            import cv2
                            import numpy as np
                            open_cv_image = np.array(cropped_img) 
                            if len(open_cv_image.shape) == 3 and open_cv_image.shape[2] == 4: # RGBA
                                 open_cv_image = cv2.cvtColor(open_cv_image, cv2.COLOR_RGBA2RGB)
                            gray = cv2.cvtColor(open_cv_image, cv2.COLOR_RGB2GRAY)
                            
                            # 이진화
                            _, thresh = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
                            
                            # X/Y축 히스토그램(Numpy Projection) 기반 밀봉 크롭 (먼지 필터로 인한 구두점 잘림 방지)
                            row_sums = np.sum(thresh, axis=1)
                            y_nonzero = np.where(row_sums > 0)[0]
                            
                            if len(y_nonzero) > 0:
                                raw_trim_y1 = max(0, y_nonzero[0] - 10)
                                trim_y2 = min(gray.shape[0], y_nonzero[-1] + 10)
                                
                                # [V12.5.17 FIX] 크롭 상단 10% 내 수평 구분선(♦——♦) 감지 시 skip
                                top_guard = int(gray.shape[0] * 0.10)
                                skip_until = raw_trim_y1
                                if raw_trim_y1 < top_guard:
                                    for ry in range(raw_trim_y1, min(top_guard + 1, len(row_sums))):
                                        if row_sums[ry] > gray.shape[1] * 255 * 0.80:
                                            skip_until = ry + 1
                                if skip_until > raw_trim_y1:
                                    remaining = np.where(row_sums[skip_until:] > 0)[0]
                                    trim_y1 = max(0, skip_until + remaining[0] - 10) if len(remaining) > 0 else raw_trim_y1
                                else:
                                    trim_y1 = raw_trim_y1
                                
                                # Y구역 내에서 X축 계산
                                valid_thresh = thresh[trim_y1:trim_y2, :]
                                col_sums = np.sum(valid_thresh, axis=0)
                                x_nonzero = np.where(col_sums > 0)[0]
                                
                                if len(x_nonzero) > 0:
                                    trim_x1 = max(0, x_nonzero[0] - 10)
                                    trim_x2 = min(gray.shape[1], x_nonzero[-1] + 10)
                                else:
                                    trim_x1, trim_x2 = 0, gray.shape[1]
                                    
                                cropped_img = cropped_img.crop((trim_x1, trim_y1, trim_x2, trim_y2))
                        except Exception as e:
                            pass # OpenCV 없거나 실패시 기본 Crop 유지
                        
                        cropped_img.save(f"debug_crop_opencv_{q_num}.png")
                        
                        async def delayed_extract(q, img, i, fallback):
                            await asyncio.sleep(i * 0.5)
                            res = await self._extract_single_problem(q, img, pass1_sem, pass2_sem, pass3_sem, _log, fallback_img=fallback)
                            return res, {'q_num': q, 'fallback_img': fallback}
                                
                        tasks.append(delayed_extract(q_num, cropped_img, idx, padded_img))
                    except Exception as e:
                        _log(f"  !! [{page_num + 1}페이지] 문항 {q_num} 치명적 좌표 오류 감지: {e}")
                        _log(f"  -> [{page_num + 1}페이지] 문항 {q_num} 손실 방지를 위해 전체 5x 배율 원본 페이지를 Phase 1으로 강제 전달합니다.")
                        
                        async def delayed_extract_fallback(q, img, i):
                            await asyncio.sleep(i * 0.5)
                            res = await self._extract_single_problem(q, img, pass1_sem, pass2_sem, pass3_sem, _log)
                            return res, {'q_num': q, 'fallback_img': img}
                                
                        tasks.append(delayed_extract_fallback(q_num, padded_img, idx))
                
                page_results_tuples = await asyncio.gather(*tasks)
                
                successes = []
                failed_tasks = []
                for res, inp in page_results_tuples:
                    if res:
                        successes.append(res)
                    else:
                        failed_tasks.append(inp)
                
                # 4. 변형 문제 생성
                if generate_variants and successes:
                    _log(f"  -> [{page_num + 1}페이지] 변형 문제 생성 시작...")
                    variant_tasks = []
                    for prob in successes:
                        variant_tasks.append(self._generate_single_variant(prob, variant_difficulty, _log))
                    variant_results = await asyncio.gather(*variant_tasks)
                    
                    final_page_results = []
                    for i, prob in enumerate(successes):
                        final_page_results.append(prob)
                        if i < len(variant_results) and variant_results[i]:
                            final_page_results.extend(variant_results[i])
                    return final_page_results, failed_tasks
                
                return successes, failed_tasks

            except Exception as e:
                _log(f"  !! [{page_num + 1}페이지] 치명적 오류: {str(e)[:100]}")
                return [], []
            finally:
                if os.path.exists(padded_img_path):
                    try: os.remove(padded_img_path)
                    except: pass

        all_page_tasks = [_process_page_inner(i) for i in range(total_pages)]
        pages_results_tuples = await asyncio.gather(*all_page_tasks)
        
        all_problems = []
        global_failed_tasks = []
        
        for p_res, f_tasks in pages_results_tuples:
            all_problems.extend(p_res)
            global_failed_tasks.extend(f_tasks)
            
        if global_failed_tasks:
            _log(f"\n🚨 [긴급 구조대] 동시 추출 중 누락된 {len(global_failed_tasks)}개 문항에 대해 1명씩 단독 직렬 추출(Concurrency=1)을 시작합니다!")
            rescue_semaphore = asyncio.Semaphore(1)
            for fail_idx, failed_task in enumerate(global_failed_tasks):
                q_num = failed_task['q_num']
                fb_img = failed_task['fallback_img']
                _log(f"\n  -> [긴급구조 {fail_idx+1}/{len(global_failed_tasks)}] 🚑 문항 {q_num} 백엔드 병목 회피를 위한 풀-이미지 단독 추출 재시도...")
                
                # 강제로 fallback_img를 투입하며 semaphore는 1로 엄격히 제한
                res = await self._extract_single_problem(q_num, fb_img, rescue_semaphore, rescue_semaphore, rescue_semaphore, _log, fallback_img=fb_img, is_rescue=1)
                if res:
                    all_problems.append(res)
                    if generate_variants:
                        _log(f"  -> [문항 {q_num}] 구조 성공! 변형 문제 추가 생성 중...")
                        var_tasks = await asyncio.gather(self._generate_single_variant(res, variant_difficulty, _log))
                        if var_tasks and var_tasks[0]:
                            all_problems.extend(var_tasks[0])
                else:
                    _log(f"    [문항 {q_num}] ❌ 1:1 단독 추출마저 예외 발생 (물리적 식별 불가 불가). 최종 누락 처리됩니다.")
        
        _log(f"\n⚡ [글로벌 배치 번역기] 전체 문항에서 LaTeX 수식 수집 중...")
        import re, json
        from typing import List

        from typing_extensions import TypedDict

        # 글로벌 수식 배열 구성: (prob_idx, local_eq_idx) -> global_idx 매핑
        global_eqs = []       # 번역할 수식이 담긴 (prob_idx, local_idx, eq_str) 주플릿
        prob_eq_map = []      # 각 문항의 (local_eq_count) - 글로벌 매핑용

        for prob in all_problems:
            if not prob: 
                prob_eq_map.append([])
                continue
            raw_eqs = prob.pop('_raw_equations', [])
            mapping = []  # (local_idx, global_idx)
            for local_idx, eq_str in enumerate(raw_eqs):
                global_idx = len(global_eqs)
                global_eqs.append(eq_str)
                mapping.append((local_idx, global_idx))
            prob_eq_map.append(mapping)

        if not global_eqs:
            _log("  -> 번역할 수식 없음. 완료.")
        else:
            _log(f"  -> 전체 {len(global_eqs)}개 LaTeX 수식 → Python 파서 변환 시작! (AI 호출 없음)")

            # =====================================================
            # [V12.5.9] Python 재귀 파서 기반 LaTeX→HWP 변환기
            # 중첩 중괄호를 깊이 추적으로 완벽 처리
            # =====================================================
            def _extract_braced(s, pos):
                """pos 위치의 '{...}' 내용과 닫히는 pos+1을 반환"""
                if pos >= len(s) or s[pos] != '{':
                    return '', pos
                depth = 0
                for i in range(pos, len(s)):
                    if s[i] == '{':
                        depth += 1
                    elif s[i] == '}':
                        depth -= 1
                        if depth == 0:
                            return s[pos+1:i], i+1
                return s[pos+1:], len(s)

            def _latex_to_hwp(s):
                """재귀적으로 LaTeX → HWP 수식 변환"""
                if not s:
                    return s
                s = s.replace('\\not\\subset', '\\nsubset')
                s = s.replace('\\not\\subseteq', '\\nsubseteq')
                result = []
                i = 0
                while i < len(s):
                    if s[i] == '\\':
                        # 명령어 파싱
                        j = i + 1
                        if j < len(s) and s[j].isalpha():
                            while j < len(s) and s[j].isalpha():
                                j += 1
                            cmd = s[i+1:j]
                            i = j
                            # 선행 공백 스킵
                            while i < len(s) and s[i] == ' ':
                                i += 1

                            if cmd == 'frac':
                                num, i = _extract_braced(s, i)
                                while i < len(s) and s[i] == ' ':
                                    i += 1
                                den, i = _extract_braced(s, i)
                                result.append(f'{{ {_latex_to_hwp(num)} }} over {{ {_latex_to_hwp(den)} }}')

                            elif cmd in ('bar', 'hat', 'tilde', 'vec', 'dot', 'ddot'):
                                arg, i = _extract_braced(s, i)
                                result.append(f'{cmd}{{{_latex_to_hwp(arg)}}}')
                            elif cmd == 'overline':
                                arg, i = _extract_braced(s, i)
                                result.append(f'overline {{{_latex_to_hwp(arg)}}}')
                            elif cmd == 'underline':
                                arg, i = _extract_braced(s, i)
                                result.append(f'underline {{{_latex_to_hwp(arg)}}}')
                            elif cmd == 'sqrt':
                                # \sqrt[n]{A} 처리
                                if i < len(s) and s[i] == '[':
                                    end = s.index(']', i)
                                    n = s[i+1:end]
                                    i = end + 1
                                    arg, i = _extract_braced(s, i)
                                    result.append(f' root {{{n}}} of {{{_latex_to_hwp(arg)}}}')
                                else:
                                    arg, i = _extract_braced(s, i)
                                    result.append(f' sqrt {{{_latex_to_hwp(arg)}}}')
                            elif cmd == 'left':
                                result.append(' LEFT ')
                            elif cmd == 'right':
                                result.append(' RIGHT ')
                            elif cmd in ('lim', 'log', 'ln', 'sin', 'cos', 'tan',
                                         'sec', 'csc', 'cot', 'max', 'min', 'sup'):
                                result.append(f' {cmd} ')
                            elif cmd == 'infty':
                                result.append(' inf ')
                            elif cmd == 'pm':
                                result.append(' +- ')
                            elif cmd == 'mp':
                                result.append(' -+ ')
                            elif cmd == 'cdot':
                                result.append(' CDOT ')
                            elif cmd == 'times':
                                result.append(' TIMES ')
                            elif cmd == 'div':
                                result.append('DIV')
                            elif cmd == 'leq' or cmd == 'le':
                                result.append('le')
                            elif cmd == 'geq' or cmd == 'ge':
                                result.append('ge')
                            elif cmd == 'neq' or cmd == 'ne':
                                result.append('!=')
                            elif cmd == 'to' or cmd == 'rightarrow':
                                result.append('->')
                            elif cmd == 'leftarrow':
                                result.append('<-')
                            elif cmd == 'Rightarrow':
                                result.append('=>')
                            elif cmd == 'Leftrightarrow' or cmd == 'iff':
                                result.append('<=>')
                            elif cmd == 'leftrightarrow':
                                result.append('<->')
                            elif cmd in ('quad', 'qquad'):
                                result.append(' ')  # HWP: \quad는 공백처리
                            elif cmd == 'ldots' or cmd == 'cdots' or cmd == 'dots':
                                result.append('...')
                            elif cmd == 'sum':
                                result.append('sum')
                            elif cmd == 'prod':
                                result.append('prod')
                            elif cmd == 'int':
                                result.append('int')
                            elif cmd == 'partial':
                                result.append('partial')
                            elif cmd == 'nabla':
                                result.append('nabla')
                            elif cmd == 'in':
                                result.append('in')
                            elif cmd == 'notin':
                                result.append('notin')
                            elif cmd == 'subset':
                                result.append('subset')
                            elif cmd == 'subseteq':
                                result.append('subseteq')
                            elif cmd == 'nsubset':
                                result.append('nsubset')
                            elif cmd == 'nsubseteq':
                                result.append('nsubseteq')
                            elif cmd == 'cup':
                                result.append('cup')
                            elif cmd == 'cap':
                                result.append('cap')
                            elif cmd == 'emptyset':
                                result.append('emptyset')
                            elif cmd == 'text':
                                arg, i = _extract_braced(s, i)
                                result.append(arg)
                            elif cmd == 'begin':
                                # 환경 파싱 (\begin{matrix} 등)
                                env, i = _extract_braced(s, i)
                                if env == 'cases':
                                    result.append('cases { ')
                                elif 'matrix' in env:
                                    result.append(f'{env} {{ ')
                                elif env == 'array':
                                    result.append('matrix { ')
                                else:
                                    result.append(f'BEGIN_{env.upper()}')
                            elif cmd == 'end':
                                env, i = _extract_braced(s, i)
                                if env in ('cases', 'array') or 'matrix' in env:
                                    result.append(' }')
                                else:
                                    result.append(f'END_{env.upper()}')
                            else:
                                # 그리스 문자 및 기타 → 공백 포함 추가 (연속 명령어 분리)
                                result.append(' ' + cmd + ' ')

                        else:
                            # \( \) \[ \] 처리
                            if j < len(s):
                                c = s[j]
                                if c in '([':
                                    result.append('LEFT' + c)
                                elif c in ')]':
                                    result.append('RIGHT' + c)
                                elif c == '{':
                                    result.append(' lbrace ')
                                elif c == '}':
                                    result.append(' rbrace ')
                                elif c == '\\':
                                    result.append(' # ')
                                else:
                                    result.append(c)
                                i = j + 1
                            else:
                                i = j
                    elif s[i] == '{':
                        # 그룹 - 재귀 처리
                        content, i = _extract_braced(s, i)
                        inner = _latex_to_hwp(content)
                        # AI의 환각(Hallucination): \left\{ 와 같아야 할 집합을 단순 리터럴 { } 로 출력한 경우 대응
                        if any(char in content for char in [',', '|', '=', '<', '>', '\\mid', '\\cdots', '...']):
                            result.append(f' lbrace {inner} rbrace ')
                        else:
                            result.append(f'{{{inner}}}')
                    elif s[i] in ('^', '_'):
                        op = s[i]
                        result.append(op)
                        i += 1
                        while i < len(s) and s[i] == ' ':
                            i += 1
                        if i < len(s) and s[i] == '{':
                            content, i = _extract_braced(s, i)
                            result.append(f'{{{_latex_to_hwp(content)}}} ')
                        elif i < len(s):
                            if s[i] == '\\':
                                j = i + 1
                                while j < len(s) and s[j].isalpha():
                                    j += 1
                                content = s[i:j]
                                i = j
                                result.append(f'{{{_latex_to_hwp(content)}}} ')
                            else:
                                content = s[i]
                                i += 1
                                result.append(f'{{{_latex_to_hwp(content)}}} ')
                    else:
                        result.append(s[i])
                        i += 1
                return ' '.join(result) if False else ''.join(result)

            def _clean_hwp(s):
                """HWP 수식 스페이싱 정리"""
                import re
                
                # 첨자 내부 괄호 탈출 (예: g_{1(5)} -> g_{1} LEFT ( 5 RIGHT ))
                s = re.sub(r'_\{([^\{}]+?)\s*\(\s*([^{}]+?)\s*\)\s*\}', r'_{\1} LEFT ( \2 RIGHT )', s)
                s = re.sub(r'_\{([^\{}]+?)\s*LEFT\s*\(\s*([^{}]+?)\s*RIGHT\s*\)\s*\}', r'_{\1} LEFT ( \2 RIGHT )', s)
                
                # 선분 안쪽으로 들어간 지수 밖으로 빼기 (예: overline { AB^2 } -> {overline {AB}}^2)
                s = re.sub(r'overline\s*\{\s*([^{}]+?)\s*\^\s*\{\s*([^{}]+?)\s*\}\s*\}', r'{overline {\1}}^{\2}', s)
                s = re.sub(r'overline\s*\{\s*([^{}]+?)\s*\^\s*([^{}]+?)\s*\}', r'{overline {\1}}^{\2}', s)
                # 바깥에 있는 지수도 overline 오작동 막기 위해 밖으로 한 번 더 묶기 (예: overline {AB} ^ 2 -> {overline {AB}}^2)
                s = re.sub(r'overline\s*\{\s*([^{}]+?)\s*\}\s*\^\s*([^\s{}]+|\{[^{}]+\})', r'{overline {\1}}^{\2}', s)
                s = re.sub(r'overline\s+([a-zA-Z0-9_]+)\s*\^\s*([^\s{}]+|\{[^{}]+\})', r'{overline {\1}}^{\2}', s)
                
                s = re.sub(r'\s+', ' ', s).strip()
                # 연산자 앞뒤 공백 강제
                for op in [' + ', ' - ', ' = ', ' != ', ' le ', ' ge ']:
                    s = s.replace(op.strip(), op)
                return s

            # 전체 수식 변환 (AST 컴파일러 사용 - CRITICAL FIX)
            try:
                from latex_hwp_compiler import compile_latex_to_hwp
                translated_global = [compile_latex_to_hwp(eq) for eq in global_eqs]
                _log(f"  -> 완벽한 AST 파서 변환 완료! ({len(translated_global)}개 수식)")
            except Exception as e:
                _log(f"  -> AST 파서 오류: {e}. 원본 LaTeX 유지.")
                translated_global = global_eqs

            # 인젝션: 각 문항에 번역된 HWP 수식 다시 삽입
            def do_inject(text, mapping, translated):
                if not isinstance(text, str): return text
                for local_idx, global_idx in mapping:
                    eq_str = translated[global_idx]
                    eq_str = re.sub(r'[\r\n]+', ' ', eq_str)  # 수식 내 줄바꿈 제거
                    eq_str = re.sub(r'\s+', ' ', eq_str).strip()
                    text = text.replace(f"__MATH_{local_idx}__", f"[[EQUATION:{eq_str}]]")
                return text

            for prob_idx, prob in enumerate(all_problems):
                if not prob: continue
                mapping = prob_eq_map[prob_idx]
                if not mapping: continue
                for k in ['question', 'explanation', 'explanation_raw', 'thought_process']:
                    if k in prob:
                        prob[k] = do_inject(prob[k], mapping, translated_global)
                if 'answer_options' in prob and isinstance(prob['answer_options'], list):
                    for i in range(len(prob['answer_options'])):
                        prob['answer_options'][i] = do_inject(prob['answer_options'][i], mapping, translated_global)



        unique_problems = {}
        for obj in all_problems:
            q_num_str = str(obj.get('question_num', '')).strip()
            if q_num_str not in unique_problems:
                unique_problems[q_num_str] = obj

        all_problems = list(unique_problems.values())
        all_problems.sort(key=self._natural_sort_key)
        _log(f"\n[성공] 분석 완료! 총 {len(all_problems)}개 문항 추출됨.")
        return all_problems

    # ═══════════════════════════════════════════════════════════════════════════
    # [V12.6.0] 크롭 2단계 분리: detect_crops() + extract_from_crops()
    # 크롭 확인 모달 UI에서 사용자가 직접 수정 후 extract_from_crops()를 호출함.
    # ═══════════════════════════════════════════════════════════════════════════

    async def detect_crops(self, pdf_path: str,
                           log_callback=None) -> list:
        """
        크롭 감지만 수행하고 결과를 반환. Mathpix/Gemini 호출 없음.
        크롭 확인 모달(CropReviewDialog)에 넘길 page_data_list를 생성함.

        Returns
        -------
        list[dict]
            [
              {
                'page_num': int,          # 1-indexed
                'padded_img': PIL.Image,  # 풀페이지 이미지
                'problem_list': [
                    {
                      'q_num': str,
                      'sx_abs': int, 'sy_abs': int,  # 절대 픽셀 좌표
                      'ex_abs': int, 'ey_abs': int,
                      'column': str,
                      'cropped_img': PIL.Image,
                    }
                ]
              }
            ]
        """
        def _log(msg):
            if log_callback:
                log_callback(msg)

        import re, cv2, numpy as np
        q_pattern = re.compile(r'^\s*(\d[\d\s]*)(?:[\)\.\n]|$)')

        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        doc.close()
        _log(f"[크롭 감지] PDF 오픈: {total_pages}페이지")

        global_seen_q = set()
        page_data_list = []

        for page_num in range(total_pages):
            def _render(p_num):
                local_doc = fitz.open(pdf_path)
                page = local_doc[p_num]
                mat = fitz.Matrix(5, 5)
                pix = page.get_pixmap(matrix=mat)
                mode = "RGBA" if pix.alpha else "RGB"
                img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
                if mode == "RGBA":
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    bg.paste(img, mask=img.split()[3])
                    img = bg
                blocks = page.get_text("blocks")
                page_w = page.rect.width
                page_h = page.rect.height
                local_doc.close()
                padding_height = 200
                padded_img = Image.new("RGB", (img.width, img.height + padding_height), (255, 255, 255))
                padded_img.paste(img, (0, 0))
                return padded_img, blocks, page_w, page_h

            padded_img, blocks, page_w, page_h = await asyncio.to_thread(_render, page_num)

            base_img_h = page_h * 5.0
            padded_h = base_img_h + 200.0

            problem_list = []
            page_seen_q = set()

            # ── [V12.6 YOLO 우선 감지] ────────────────────────────────────────
            import os as _os, sys as _sys2
            _exe_dir2 = os.path.dirname(_sys2.executable) if getattr(_sys2, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
            YOLO_MODEL_PATH = _os.path.join(_exe_dir2, "problem_detector.pt")
            yolo_used = False

            if _os.path.exists(YOLO_MODEL_PATH):
                try:
                    from ultralytics import YOLO as _YOLO
                    import tempfile as _tf_mod
                    _log(f"  -> [{page_num+1}페이지] 🤖 YOLO 감지 모드")
                    _ym = _YOLO(YOLO_MODEL_PATH)
                    with _tf_mod.NamedTemporaryFile(suffix=".jpg", delete=False) as _tf:
                        _tmp = _tf.name
                    padded_img.save(_tmp, "JPEG", quality=95)
                    _res = _ym(_tmp, conf=0.25, verbose=False)
                    _os.remove(_tmp)
                    _boxes = _res[0].boxes if _res and _res[0].boxes else None
                    if _boxes and len(_boxes) > 0:
                        _imgW, _imgH = padded_img.size
                        _dets = []
                        for _b in _boxes:
                            _xy = _b.xyxy[0].cpu().numpy()
                            _x1, _y1, _x2, _y2 = float(_xy[0]), float(_xy[1]), float(_xy[2]), float(_xy[3])
                            _col = "left" if (_x1+_x2)/2 < _imgW*0.5 else "right"
                            _dets.append({'sy_abs': int(_y1), 'ey_abs': int(_y2),
                                          'sx_abs': int(_x1), 'ex_abs': int(_x2),
                                          'start_y': _y1/_imgH, 'end_y': _y2/_imgH,
                                          'column': _col, 'q_num': None})
                        _dets.sort(key=lambda d: d['sy_abs'])
                        _cnt = 0
                        for _det in _dets:
                            for b in blocks:
                                if len(b) >= 5 and b[6] == 0:
                                    bx0, by0, bx1, by1, btxt = b[:5]
                                    btxt = btxt.strip()
                                    if not btxt: continue
                                    if _det['sy_abs'] <= by0*5.0 <= _det['ey_abs']:
                                        _m = q_pattern.match(btxt)
                                        if _m:
                                            rq = _m.group(1).replace(" ","")
                                            try:
                                                if int(rq) == 0 or int(rq) > 150: continue
                                            except: continue
                                            if rq not in page_seen_q and rq not in global_seen_q:
                                                page_seen_q.add(rq)
                                                _det['q_num'] = rq
                                                _cnt += 1
                                                break
                            if not _det['q_num']:
                                _det['q_num'] = f"?{_cnt+1}"; _cnt += 1
                        problem_list = [{'q_num': d['q_num'], 'start_y': d['start_y'],
                                         'end_y': d['end_y'], 'column': d['column']}
                                        for d in _dets if d['q_num']]
                        yolo_used = True
                except Exception as _ye:
                    _log(f"  -> [{page_num+1}페이지] ⚠️ YOLO 실패({_ye}), 정규식 폴백")
                    problem_list = []; yolo_used = False

            # ── 정규식 폴백 ────────────────────────────────────────────────────
            if not yolo_used:
                for b in blocks:
                    if len(b) >= 5 and b[6] == 0:
                        x0, y0, x1, y1, text = b[:5]
                        if y0 > page_h * 0.9: continue
                        if y0 < page_h * 0.06: continue
                        text = text.strip()
                        if not text: continue
                        is_valid_x = (x0 < page_w * 0.20) or (page_w * 0.45 < x0 < page_w * 0.65)
                        if not is_valid_x: continue
                        match = q_pattern.match(text)
                        if match:
                            raw_q = match.group(1).replace(" ", "")
                            try:
                                int_q = int(raw_q)
                                if int_q == 0 or int_q > 150: continue
                            except:
                                continue
                            if raw_q in global_seen_q: continue
                            if raw_q not in page_seen_q:
                                page_seen_q.add(raw_q)
                                col_str = "left" if x0 < page_w / 2.0 else "right"
                                sy_ratio = (y0 * 5.0) / padded_h
                                problem_list.append({'q_num': raw_q, 'start_y': sy_ratio, 'column': col_str})

            for pn in page_seen_q:
                global_seen_q.add(pn)

            # end_y 할당
            col_groups = {'left': [], 'right': [], 'full': []}
            for p in problem_list:
                col_groups[p['column']].append(p)
            final_list = []
            for c_key in ['left', 'right', 'full']:
                col_groups[c_key].sort(key=lambda x: x['start_y'])
                g = col_groups[c_key]
                for i, curr in enumerate(g):
                    curr['end_y'] = g[i+1]['start_y'] if i < len(g)-1 else (base_img_h * 0.94) / padded_h
                    final_list.append(curr)

            W, H = padded_img.width, padded_img.height
            page_problems = []
            for prob_data in final_list:
                q_num = str(prob_data['q_num'])
                sy = float(prob_data['start_y'])
                ey = float(prob_data['end_y'])
                col = prob_data['column']

                # 충돌 방지 계산
                min_sy_limit, max_ey_limit = 0.0, 1.0
                for other_p in final_list:
                    if other_p.get('column', 'full').lower() == col:
                        other_sy = float(other_p.get('start_y', 1.0))
                        other_ey = float(other_p.get('end_y', 0.0))
                        if other_sy > sy + 0.01:
                            max_ey_limit = min(max_ey_limit, other_sy)
                        if other_ey < ey - 0.01:
                            min_sy_limit = max(min_sy_limit, other_ey)

                sy = max(0.0, max(sy - 0.010, min_sy_limit))
                ey = min(1.0, min(ey + 0.010, max_ey_limit - 0.003))
                if ey <= sy: ey = min(1.0, sy + 0.02)
                HEADER_LINE_Y = 0.07
                if col == 'right' and sy < HEADER_LINE_Y:
                    sy = HEADER_LINE_Y

                sx_px = 0
                ex_px = W
                if col == "left":
                    ex_px = int(W * 0.52)
                elif col == "right":
                    sx_px = int(W * 0.48)

                sy_px = int(sy * H)
                ey_px = int(ey * H)

                cropped_img = padded_img.crop((sx_px, sy_px, ex_px, ey_px))

                # OpenCV trim (80% 구분선 기준)
                try:
                    ocv = np.array(cropped_img)
                    if len(ocv.shape) == 3 and ocv.shape[2] == 4:
                        ocv = cv2.cvtColor(ocv, cv2.COLOR_RGBA2RGB)
                    gray = cv2.cvtColor(ocv, cv2.COLOR_RGB2GRAY)
                    _, thresh = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
                    row_sums = np.sum(thresh, axis=1)
                    y_nz = np.where(row_sums > 0)[0]
                    if len(y_nz) > 0:
                        raw_y1 = max(0, y_nz[0] - 10)
                        trim_y2 = min(gray.shape[0], y_nz[-1] + 10)
                        top_guard = int(gray.shape[0] * 0.10)
                        skip_until = raw_y1
                        if raw_y1 < top_guard:
                            for ry in range(raw_y1, min(top_guard + 1, len(row_sums))):
                                if row_sums[ry] > gray.shape[1] * 255 * 0.80:
                                    skip_until = ry + 1
                        if skip_until > raw_y1:
                            rem = np.where(row_sums[skip_until:] > 0)[0]
                            trim_y1 = max(0, skip_until + rem[0] - 10) if len(rem) > 0 else raw_y1
                        else:
                            trim_y1 = raw_y1
                        col_sums = np.sum(thresh[trim_y1:trim_y2, :], axis=0)
                        x_nz = np.where(col_sums > 0)[0]
                        if len(x_nz) > 0:
                            trim_x1 = max(0, x_nz[0] - 10)
                            trim_x2 = min(gray.shape[1], x_nz[-1] + 10)
                        else:
                            trim_x1, trim_x2 = 0, gray.shape[1]
                        cropped_img = cropped_img.crop((trim_x1, trim_y1, trim_x2, trim_y2))
                        # 절대 좌표 보정 (trim 반영)
                        sx_px += trim_x1
                        sy_px += trim_y1
                        ex_px = sx_px + (trim_x2 - trim_x1)
                        ey_px = sy_px + (trim_y2 - trim_y1)
                except Exception:
                    pass

                page_problems.append({
                    'q_num': q_num,
                    'sx_abs': sx_px,
                    'sy_abs': sy_px,
                    'ex_abs': ex_px,
                    'ey_abs': ey_px,
                    'column': col,
                    'cropped_img': cropped_img,
                    # ratio 좌표도 보관 (추출 시 사용)
                    '_start_y': sy,
                    '_end_y': ey,
                })

            _log(f"  -> [{page_num+1}페이지] {len(page_problems)}개 문항 크롭 완료")
            page_data_list.append({
                'page_num': page_num + 1,
                'padded_img': padded_img,
                'problem_list': page_problems,
            })

        _log(f"[크롭 감지 완료] 총 {sum(len(p['problem_list']) for p in page_data_list)}개 문항")
        return page_data_list

    async def extract_from_crops(self, page_data_list: list,
                                 log_callback=None,
                                 generate_variants: bool = False,
                                 variant_difficulty: str = "1단계") -> list:
        """
        detect_crops() + CropReviewDialog로 확정된 크롭 데이터로 실제 추출 실행.
        각 문항의 cropped_img를 Mathpix → Gemini 파이프라인에 투입함.
        """
        def _log(msg):
            if log_callback:
                log_callback(msg)

        is_flash = "flash" in getattr(self, 'pro_model', self.model).model_name.lower()
        pass1_sem = asyncio.Semaphore(15)
        pass2_sem = asyncio.Semaphore(5 if is_flash else 3)
        pass3_sem = asyncio.Semaphore(15)

        all_tasks = []
        task_meta = []

        for pg in page_data_list:
            padded_img = pg['padded_img']
            for idx, prob in enumerate(pg['problem_list']):
                q_num = str(prob['q_num']).replace(".", "").strip()
                cropped_img = prob['cropped_img']

                async def delayed_extract(q, img, i, fallback):
                    await asyncio.sleep(i * 0.5)
                    res = await self._extract_single_problem(
                        q, img, pass1_sem, pass2_sem, pass3_sem, _log, fallback_img=fallback)
                    return res, {'q_num': q, 'fallback_img': fallback}

                all_tasks.append(delayed_extract(q_num, cropped_img, len(all_tasks), padded_img))

        results_tuples = await asyncio.gather(*all_tasks)

        all_problems = []
        failed_tasks = []
        for res, inp in results_tuples:
            if res:
                all_problems.append(res)
            else:
                failed_tasks.append(inp)

        # 긴급 구조대 (실패 문항 재시도)
        if failed_tasks:
            _log(f"\n🚨 [긴급구조] {len(failed_tasks)}개 문항 단독 재시도...")
            rescue_sem = asyncio.Semaphore(1)
            for fail_inp in failed_tasks:
                q_num = fail_inp['q_num']
                fb_img = fail_inp['fallback_img']
                res = await self._extract_single_problem(
                    q_num, fb_img, rescue_sem, rescue_sem, rescue_sem, _log,
                    fallback_img=fb_img, is_rescue=1)
                if res:
                    all_problems.append(res)

        # ── 글로벌 수식 번역 (extract_math_problems와 동일 로직) ──────────────────
        _log(f"\n⚡ [글로벌 배치 번역기] LaTeX 수식 수집 중...")
        import re as _re

        global_eqs = []
        prob_eq_map = []
        for prob in all_problems:
            if not prob:
                prob_eq_map.append([])
                continue
            raw_eqs = prob.pop('_raw_equations', [])
            mapping = []
            for local_idx, eq_str in enumerate(raw_eqs):
                global_idx = len(global_eqs)
                global_eqs.append(eq_str)
                mapping.append((local_idx, global_idx))
            prob_eq_map.append(mapping)

        if not global_eqs:
            _log("  -> 번역할 수식 없음.")
        else:
            _log(f"  -> {len(global_eqs)}개 수식 Python 파서 변환 시작!")

            def _extract_braced(s, pos):
                if pos >= len(s) or s[pos] != '{': return '', pos
                depth = 0
                for i in range(pos, len(s)):
                    if s[i] == '{': depth += 1
                    elif s[i] == '}':
                        depth -= 1
                        if depth == 0: return s[pos+1:i], i+1
                return s[pos+1:], len(s)

            def _latex_to_hwp(s):
                if not s: return s
                result = []
                i = 0
                while i < len(s):
                    if s[i] == '\\':
                        j = i + 1
                        if j < len(s) and s[j].isalpha():
                            while j < len(s) and s[j].isalpha(): j += 1
                            cmd = s[i+1:j]; i = j
                            while i < len(s) and s[i] == ' ': i += 1
                            if cmd == 'frac':
                                num, i = _extract_braced(s, i)
                                while i < len(s) and s[i] == ' ': i += 1
                                den, i = _extract_braced(s, i)
                                result.append(f'{{ {_latex_to_hwp(num)} }} over {{ {_latex_to_hwp(den)} }}')
                            elif cmd in ('bar','hat','tilde','vec','dot','ddot'):
                                arg, i = _extract_braced(s, i)
                                result.append(f'{cmd}{{{_latex_to_hwp(arg)}}}')
                            elif cmd == 'overline':
                                arg, i = _extract_braced(s, i)
                                result.append(f'overline {{{_latex_to_hwp(arg)}}}')
                            elif cmd == 'sqrt':
                                if i < len(s) and s[i] == '[':
                                    end = s.index(']', i); n = s[i+1:end]; i = end + 1
                                    arg, i = _extract_braced(s, i)
                                    result.append(f' root {{{n}}} of {{{_latex_to_hwp(arg)}}}')
                                else:
                                    arg, i = _extract_braced(s, i)
                                    result.append(f' sqrt {{{_latex_to_hwp(arg)}}}')
                            elif cmd == 'left': result.append(' LEFT ')
                            elif cmd == 'right': result.append(' RIGHT ')
                            elif cmd in ('lim','log','ln','sin','cos','tan','sec','csc','cot','max','min','sup'):
                                result.append(f' {cmd} ')
                            elif cmd == 'infty': result.append(' inf ')
                            elif cmd == 'pm': result.append(' +- ')
                            elif cmd == 'times': result.append(' TIMES ')
                            elif cmd == 'div': result.append('DIV')
                            elif cmd in ('leq','le'): result.append('le')
                            elif cmd in ('geq','ge'): result.append('ge')
                            elif cmd in ('neq','ne'): result.append('!=')
                            elif cmd in ('to','rightarrow'): result.append('->')
                            elif cmd == 'ldots' or cmd == 'cdots': result.append('...')
                            elif cmd == 'sum': result.append('sum')
                            elif cmd == 'int': result.append('int')
                            elif cmd in ('quad', 'qquad'): result.append(' ')  # HWP: \quad는 공백
                            elif cmd == 'text':
                                arg, i = _extract_braced(s, i); result.append(arg)
                            else: result.append(' ' + cmd + ' ')
                        else:
                            if j < len(s):
                                c = s[j]
                                result.append(('LEFT' if c in '([' else 'RIGHT') + c if c in '()[]' else c)
                                i = j + 1
                            else: i = j
                    elif s[i] == '{':
                        content, i = _extract_braced(s, i)
                        result.append(f'{{{_latex_to_hwp(content)}}}')
                    elif s[i] == '^':
                        result.append('^'); i += 1
                        if i < len(s) and s[i] == '{':
                            content, i = _extract_braced(s, i)
                            result.append(f'{{{_latex_to_hwp(content)}}}')
                    elif s[i] == '_':
                        result.append('_'); i += 1
                        if i < len(s) and s[i] == '{':
                            content, i = _extract_braced(s, i)
                            result.append(f'{{{_latex_to_hwp(content)}}}')
                    else:
                        result.append(s[i]); i += 1
                return ''.join(result)

            def _clean_hwp(s):
                # 첨자 내부 괄호 탈출 (예: g_{1(5)} -> g_{1} LEFT ( 5 RIGHT ))
                s = _re.sub(r'_\{([^\{}]+?)\s*\(\s*([^{}]+?)\s*\)\s*\}', r'_{\1} LEFT ( \2 RIGHT )', s)
                s = _re.sub(r'_\{([^\{}]+?)\s*LEFT\s*\(\s*([^{}]+?)\s*RIGHT\s*\)\s*\}', r'_{\1} LEFT ( \2 RIGHT )', s)

                # 선분 안쪽으로 들어간 지수 밖으로 빼기 (예: overline { AB^2 } -> {overline {AB}}^2)
                s = _re.sub(r'overline\s*\{\s*([^{}]+?)\s*\^\s*\{\s*([^{}]+?)\s*\}\s*\}', r'{overline {\1}}^{\2}', s)
                s = _re.sub(r'overline\s*\{\s*([^{}]+?)\s*\^\s*([^{}]+?)\s*\}', r'{overline {\1}}^{\2}', s)
                # 바깥에 있는 지수도 overline 오작동 막기 위해 밖으로 한 번 더 묶기 (예: overline {AB} ^ 2 -> {overline {AB}}^2)
                s = _re.sub(r'overline\s*\{\s*([^{}]+?)\s*\}\s*\^\s*([^\s{}]+|\{[^{}]+\})', r'{overline {\1}}^{\2}', s)
                s = _re.sub(r'overline\s+([a-zA-Z0-9_]+)\s*\^\s*([^\s{}]+|\{[^{}]+\})', r'{overline {\1}}^{\2}', s)

                s = _re.sub(r'LEFT\s+lbrace', 'LEFT {', s)
                s = _re.sub(r'RIGHT\s+rbrace', 'RIGHT }', s)

                s = _re.sub(r'\s+', ' ', s).strip()
                for op in [' + ',' - ',' = ',' != ',' le ',' ge ']:
                    s = s.replace(op.strip(), op)
                return s

            try:
                from latex_hwp_compiler import compile_latex_to_hwp
                translated_global = [compile_latex_to_hwp(eq) for eq in global_eqs]
                _log(f"  -> 변환 완료 ({len(translated_global)}개)")
            except Exception as e:
                _log(f"  -> 파서 오류: {e}. 원본 유지.")
                translated_global = global_eqs

            def do_inject(text, mapping, translated):
                if not isinstance(text, str): return text
                for local_idx, global_idx in mapping:
                    eq_str = translated[global_idx]
                    eq_str = _re.sub(r'[\r\n]+', ' ', eq_str)  # 수식 내 줄바꿈 제거
                    eq_str = _re.sub(r'\s+', ' ', eq_str).strip()
                    text = text.replace(f"__MATH_{local_idx}__", f"[[EQUATION:{eq_str}]]")
                return text

            for prob_idx, prob in enumerate(all_problems):
                if not prob: continue
                mapping = prob_eq_map[prob_idx] if prob_idx < len(prob_eq_map) else []
                if not mapping: continue
                for k in ['question', 'explanation', 'explanation_raw', 'thought_process']:
                    if k in prob:
                        prob[k] = do_inject(prob[k], mapping, translated_global)
                if 'answer_options' in prob and isinstance(prob['answer_options'], list):
                    for ai in range(len(prob['answer_options'])):
                        prob['answer_options'][ai] = do_inject(prob['answer_options'][ai], mapping, translated_global)

        # 중복 제거 + 정렬
        unique_problems = {}
        for obj in all_problems:
            q_num_str = str(obj.get('question_num', '')).strip()
            if q_num_str not in unique_problems:
                unique_problems[q_num_str] = obj
        all_problems = list(unique_problems.values())
        all_problems.sort(key=self._natural_sort_key)
        _log(f"\n[성공] 총 {len(all_problems)}개 문항 추출됨.")
        return all_problems

    # ═══════════════════════════════════════════════════════════════
    # [탭2 전용] 변형문제 생성 파이프라인
    # extract_from_crops 와 완전히 분리된 별도 파이프라인.
    # '정답은' 체크 없음 — 변형문제 JSON 완성 여부로만 판단.
    # ═══════════════════════════════════════════════════════════════
    async def extract_variants_from_crops(self, page_data_list: list,
                                          log_callback=None,
                                          variant_difficulty: str = "1단계: 하") -> list:
        """
        [탭2 전용] 변형문제 생성 파이프라인.
        1단계: 각 크롭 이미지에서 문제 본문만 추출 (해설 없음, '정답은' 체크 없음)
        2단계: 추출된 문제로 변형문제 3개 생성
        """
        def _log(msg):
            if log_callback:
                log_callback(msg)

        is_flash = "flash" in getattr(self, 'pro_model', self.model).model_name.lower()
        extract_sem = asyncio.Semaphore(10)
        variant_sem = asyncio.Semaphore(3 if not is_flash else 5)

        all_results = []

        # ── 1단계: 문제 본문만 추출 ─────────────────────────────────────────
        async def _extract_question_only(q_num, img_data, fallback_img):
            """해설 없이 문제 본문+보기만 추출. '정답은' 조건 없음."""
            from typing import List

            from typing_extensions import TypedDict
            class QuestionOnly(TypedDict):
                question_num: str
                question: str
                answer_options: List[str]

            retries = 0
            max_retries = 4
            while retries < max_retries:
                try:
                    prompt = f"""[문제 본문 추출 전담 모드]
첨부된 이미지에서 제 {q_num}번 문제의 본문과 보기만 정확하게 발라내세요.
- 다른 문제의 파편(주변 문제 번호, 관련 없는 문장)은 제거하세요.
- {q_num}번 문제 내부의 텍스트는 100% 그대로 전사하세요.
- 해설/풀이/정답은 작성하지 마세요. 오직 문제 본문과 보기만.
- 문제 본문의 일체의 '수식', '기호', '변수', '단순 숫자'는 빠짐없이 무조건 [[EQUATION:HWP수식]] 태그로 감싸세요. (예: [[EQUATION:1]], [[EQUATION:x]])

[HWP 수식 규칙]
- 분수: {{분자}} over {{분모}}
- 루트: sqrt {{A}}
- 그리스 문자: alpha beta gamma (백슬래시 없이)
- 지수: x^{{2}}, 아래첨자: x_{{n}}
- 연산자: TIMES, DIV, +-, CDOT
- 괄호: LEFT ( 식 RIGHT )
"""
                    curr_temp = 0.15 if retries == 0 else min(0.25 + retries * 0.1, 0.5)
                    async with extract_sem:
                        resp = await self.model.generate_content_async(
                            [img_data, prompt],
                            generation_config=genai.types.GenerationConfig(
                                temperature=curr_temp,
                                max_output_tokens=8192,
                                response_mime_type="application/json",
                                response_schema=QuestionOnly
                            )
                        )
                    ext = self._extract_json_objects(self._sanitize_json(resp.text))
                    if ext and ext[0].get('question', '').strip():
                        result = ext[0]
                        result['question_num'] = q_num  # 크롭창 입력 번호로 강제 고정
                        _log(f"    [문항 {q_num}] ✅ 문제 본문 추출 완료 ({len(result.get('question',''))}자)")
                        return result
                    else:
                        _log(f"    [문항 {q_num}] ⚠️ 본문 추출 실패 (시도 {retries+1}/{max_retries}), 재시도...")
                except Exception as e:
                    _log(f"    [문항 {q_num}] API 에러: {e}")
                retries += 1
                await asyncio.sleep(2 ** retries)

            # 마지막 폴백: padded_img로 재시도
            if fallback_img is not None:
                _log(f"    [문항 {q_num}] 🚨 전체 페이지 이미지로 폴백 시도...")
                try:
                    async with extract_sem:
                        resp = await self.model.generate_content_async(
                            [fallback_img, f"이미지에서 {q_num}번 문제 본문만 추출하세요. 수식은 반드시 LaTeX 문법으로 작성하고 [[EQUATION:수식]] 태그로 감싸세요."],
                            generation_config=genai.types.GenerationConfig(temperature=0.3, max_output_tokens=4096)
                        )
                    return {"question_num": q_num, "question": resp.text, "answer_options": []}
                except:
                    pass
            return None

        # ── 2단계: 변형문제 생성 ─────────────────────────────────────────────
        async def _generate_variants(q_info, difficulty):
            """추출된 문제 정보로 변형문제 JSON 생성."""
            from typing import List

            from typing_extensions import TypedDict
            class VariantProblem(TypedDict):
                question_num: str
                question: str
                answer_options: List[str]
                explanation: str
            
            class VariantCollection(TypedDict):
                variants: List[VariantProblem]

            q_num = q_info.get("question_num", "?")
            original_q = q_info.get("question", "")
            original_opts = q_info.get("answer_options", [])

            # 난이도별 변형 전략 정의
            level_key = difficulty.split(":")[0].strip() if ":" in difficulty else difficulty.strip()
            if "하" in level_key:
                difficulty_instr = """[🟢 하 (쉬운 변형) 전략]
- 숫자/계수/상수만 교체하세요. (예: f(x)=2x+3 → f(x)=5x-1)
- 구하는 대상만 바꾸세요. (최댓값 ↔ 최솟값, x값 ↔ y값)
- 범위/구간의 숫자만 변경하세요.
⚠️ 풀이 방법은 원본과 완전히 동일해야 합니다. 단순히 값만 달라지는 수준."""
            elif "중" in level_key:
                difficulty_instr = """[🟡 중 (구조적 변형) 전략]
🚨 [절대 금지] 단순히 문제의 숫자나 상수만 바꾸는 것은 '하' 난이도이므로 절대 금지합니다. 구조가 원본과 동일하면 실패입니다.
- 🎯 [필수 1 - 역연산 구조] 구하는 대상(질문)을 완전히 반대로 뒤집으세요. (식을 변형해 값을 구하던 문제 ➔ 식 내부의 부분 상수를 미지수로 뚫고 역산하게 만들기)
- 🎯 [필수 2 - 조건 은닉] 원본에 대놓고 주어졌던 조건을 숨기고, 새로운 관계식을 하나 더 풀어야만 원래 조건을 찾아낼 수 있게 풀이 과정을 한 단계 더 꼬아내세요.
⚠️ 반드시 기계적인 숫자 바꾸기를 탈피하고, 원본과 구조적/논리적 차별성을 가져야 합니다."""
            else:  # 상
                difficulty_instr = """[🔴 상 (개념 응용 변형) 전략]
- 복합 개념을 결합하세요. (예: 수열+극한, 적분+넓이, 함수+경우의 수)
- 조건을 수식 형태 ↔ 그래프 해석으로 전환하세요.
- 역수/치환/합성 등 반전 설계로 수능 킬러 스타일로 만드세요.
- 풀이 단계가 2~3단계 더 필요한 구조를 설계하세요.
- 조건을 일반화하세요. (특수 케이스 → 일반 매개변수 k, n 도입)
⚠️ 원본 문제 유형의 틀은 유지하되, 최상위권을 변별할 수 있는 수준으로."""

            # 과정별 제약
            if "1학기" in self.curriculum and "고1" in self.curriculum:
                curriculum_instr = """[📚 과정 제약: 고1 1학기 (공통수학1)]
사용 가능: 다항식의 연산, 나머지정리와 인수분해, 복소수, 이차방정식, 이차방정식과 이차함수, 여러 가지 방정식과 부등식, 경우의 수(순열/조합), 행렬과 연산
절대 금지: 구간, 열린구간, 닫힌구간, 집합, 명제, 함수(합성/역함수), 극한, 미분, 적분, 극대, 극소, 미분계수, 원의 방정식
🚨 변수 범위를 지칭할 때絕對 구간 [a, b] 기호 기표를 쓰지 말고 부등식(a <= x <= b)을 쓰세요.
🚨 최대/최소 설명시 절대 미분/극대/극소를 쓰지말고 '이차함수의 꼭짓점/완전제곱식'을 이용하세요. 도형 문제에서 아직 평면좌표를 안배웠으므로 좌표로 해석하지 마세요."""
            elif "2학기" in self.curriculum and "고1" in self.curriculum:
                curriculum_instr = """[📚 과정 제약: 고1 2학기 (공통수학2)]
사용 가능: 도형의 방정식(평면좌표/직선/원/이동), 집합과 명제, 함수(합성함수/역함수), 유리함수와 무리함수
절대 금지: 구간, 열린구간, 닫힌구간, 수열, 삼각함수, 지수함수, 로그함수, 연속, 극한, 미분, 극대, 극소, 적분
🚨 변수 범위 표현 시 여전히 구간 기호 사용을 금지합니다 (부등식만 허용). 
🚨 최대/최소 문제에서 미분을 금지하고 산술지하평균이나 이차함수 등 도형의 성질만 이용하세요. 점근선을 설명할 때 극한(lim) 기호를 절대 쓰지 마세요."""
            elif "1학기" in self.curriculum and "고2" in self.curriculum:
                curriculum_instr = """[📚 과정 제약: 고2 1학기 (대수, 구 수학I)]
사용 가능: 지수와 로그, 지수함수와 로그함수, 삼각함수의 그래프, 사인/코사인법칙, 등차/등비수열, 수학적 귀납법
절대 금지: 구간, 극한, 연속, 불연속, 방향도함수, 미분, 도함수, 접선의 방정식, 적분, 극대, 극소, 변곡점, 이계도함수
🚨 범위를 지정할 때 "구간 [0, 2pi]에서" 대신 무조건 "0 <= x <= 2pi 일 때" 로 표현하세요. 함수의 최대최소를 찾을 때 미분을 쓰지말고 대칭성/주기성 또는 치환을 이용하세요."""
            elif "2학기" in self.curriculum and "고2" in self.curriculum:
                curriculum_instr = """[📚 과정 제약: 고2 2학기 (미적분I, 구 수학II)]
사용 가능: 함수의 극한, 함수의 연속 (열린구간, 닫힌구간 등 '구간' 기호 쓰기 시작), 미분계수, 도함수, 다항함수의 극대 극소, 접선, 속도, 정적분/부정적분, 넓이 등
절대 금지: 초월함수의 미분적분(자연로그 e, 사인미분 등), 몫의 미분법, 음함수 미분법, 매개변수 미분, 이계도함수, 변곡점, 부분적분, 치환적분
🚨 문제 해설 시 다항함수의 3차/4차 개형을 설명할 수 있지만, 선행과정인 이계도함수나 변곡점을 직접 명시하여 해설하지 말고 증감표(도함수의 부호변화)만으로 설명하세요."""
            else:
                curriculum_instr = """[📚 과정 제약: 고3 (전체 교육과정 허용)]
사용 가능: 초월함수 미적분(미적분II), 기하, 확률과 통계 등 고등학교 정규 교과과정 전범위 모두 허용.
🚨 단, 톨레미의 정리, 체바의 정리, 메넬라우스의 정리 등 대한민국 정규 고교 교과과정을 벗어나는 대학교 수준이나 KMO 등급의 이론은 절대 사용하지 마세요."""

            prompt = f"""[원본 해설 + 변형문제 생성 전담 모드]
아래 원본 수학 문제에 대해 다음 두 가지를 한 번에 수행하세요:
1) 원본 문제의 해설 작성
2) 변형문제 3개 + 각 해설 작성

[원본 문제 (제 {q_num}번)]
{original_q}

[원본 보기]
{original_opts}

{difficulty_instr}

{curriculum_instr}

[수식 작성 규칙 — 반드시 준수]
- 문제 및 해설의 일체의 '수식', '알파벳 기호', '변수', '단순 숫자'는 빠짐없이 무조건 [[EQUATION:수식내용]] 형태로 감싸세요. (예: [[EQUATION:1]], [[EQUATION:x]])
- 🚨 절대 HWP 수식 문법(over, sqrt, LEFT, RIGHT 등)을 직접 쓰지 마세요!!
- 무조건 **국제 표준 LaTeX 문법**(`\\frac`, `\\sqrt`, `\\sqrt[3]`, `\\le` 등)만을 사용하여 작성하세요. (백슬래시를 이스케이프할 필요 없이 그냥 표준대로 작성하세요)
- 특수기호: `\\alpha`, `\\beta`, `\\gamma`, `\\pi`, 연산자: `\\times`, `\\div`, `\\cdot`, 지수/첨자: `x^2`, `x_n`
- 괄호: `\\left(`, `\\right)`, 단순 변수/숫자도 빠짐없이 `[[EQUATION:x]]`, `[[EQUATION:5]]` 로 감싸세요.
- 해설 문체: '~한다', '~이다' 해라체. 마지막은 '따라서 답은 [답]이다.' 로 마무리.
- 🚨 **[오답/모순 증명 필수]** 경우를 나누어 푸는 문제(예: c=2 또는 c=4)에서 특정 경우가 답이 되더라도, **나머지 오답 케이스(모순이 발생하는 경우)가 왜 안 되는지에 대한 증명 과정도 해설에 반드시 포함**하세요.
- 🚨 **[직관적/그래프 풀이 우선]** 복잡하고 긴 대수적 계산(방정식, 부등식의 기계적 전개식 등)보다는, **함수 그래프의 기하학적 성질(대칭성, 넓이, 교점, 주기성, 평행이동 등)**이나 직관적인 해석을 이용해 풀 수 있는 문제라면 무조건 그 방법을 우선하여 해설을 작성하세요.
- 🚨 **[반복 나열 금지 & 해설 압축]** 해설 시 n=1, n=2, n=3... 처럼 동일한 패턴을 표나 여러 줄로 반복해서 나열하지 마세요. "n=1, 2, ... 인 경우를 확인하면"과 같이 축약하세요. 또한, 시스템 토큰 한도로 인해 출력이 중간에 끊길 수 있으므로 **장황하고 지루한 사칙연산 중간 과정은 과감히 하나로 합쳐서 해설을 최대한 간결하고 핵심 위주로 압축**하세요.

[응답 형식]
아래 제공된 JSON 배열 템플릿의 형식을 100% 동일하게 유지하여, 4개의 객체가 정확히 채워진 JSON 하나만 출력하세요. 다른 텍스트는 절대 쓰지 마세요.

```json
[
  {{
    "question_num": "{q_num}",
    "question": "(원본 문제 본문 그대로)",
    "answer_options": ["(원본 보기가 있으면 배열에 넣고, 없으면 빈 배열 [])"],
    "explanation": "(원본 문제의 정확한 해설)"
  }},
  {{
    "question_num": "{q_num}-변형1",
    "question": "(첫 번째 변형 문제 본문 생성)",
    "answer_options": ["(객관식이면 5개 작성, 주관식이면 빈 배열 [])"],
    "explanation": "(첫 번째 변형 문제의 정확한 해설)"
  }},
  {{
    "question_num": "{q_num}-변형2",
    "question": "(두 번째 변형 문제 본문 생성)",
    "answer_options": ["(객관식이면 5개 작성, 주관식이면 빈 배열 [])"],
    "explanation": "(두 번째 변형 문제의 정확한 해설)"
  }},
  {{
    "question_num": "{q_num}-변형3",
    "question": "(세 번째 변형 문제 본문 생성)",
    "answer_options": ["(객관식이면 5개 작성, 주관식이면 빈 배열 [])"],
    "explanation": "(세 번째 변형 문제의 정확한 해설)"
  }}
]
```
🚨 [경고] 절대 중간에 생성을 중단하거나 객체를 빼먹지 마세요! 위 4개 객체가 배열 안에 모두 들어있어야 합니다.
"""
            collected_variants = []
            retries = 0
            max_retries = 4
            current_prompt = prompt
            safe_q_num = str(q_num).replace('?', '').replace('/', '').replace('\\', '').replace(':', '')

            while len(collected_variants) < 4 and retries < max_retries:
                try:
                    if retries == 0 and len(collected_variants) == 0:
                        _log(f"    [문항 {q_num}] ⚙️ 1타 강사 모드: 원본 해설 및 변형 3종 생성 중... (가장 오래 걸립니다)")
                    else:
                        if len(collected_variants) > 0:
                            _log(f"    [문항 {q_num}] (보충구동) ⚠️ 현재 {len(collected_variants)}개. {4 - len(collected_variants)}개 추가 생성명령(Backfill) 송신...")
                        else:
                            _log(f"    [문항 {q_num}] 🔄 변형 생성 0개, 재시도 중... ({retries+1}/{max_retries})")
                        
                    async with variant_sem:
                        resp = await self.model.generate_content_async(
                            current_prompt,
                            generation_config=genai.types.GenerationConfig(
                                temperature=0.65,
                                max_output_tokens=16384,
                                response_mime_type="application/json"
                            )
                        )
                    
                    raw_text = resp.text.strip()
                    is_truncated = False
                    if resp.candidates:
                        fr = getattr(resp.candidates[0], 'finish_reason', None)
                        if fr in [2, 'MAX_TOKENS', 'FinishReason.MAX_TOKENS'] or 'MAX_TOKENS' in str(fr):
                            is_truncated = True
                        elif not raw_text.endswith(']'):
                            is_truncated = True
                            
                    cont_retries = 0
                    while is_truncated and cont_retries < 5:
                        _log(f"    [문항 {q_num}] ⚠️ 변형문제 이어서 작성(Continue) 모드 발동... (시도 {cont_retries+1}/5)")
                        last_context = raw_text[-150:] if len(raw_text) > 150 else raw_text
                        continue_prompt = f"""당신이 앞서 작성하던 변형문제 JSON 응답이 토큰 한도로 인해 중단되었습니다.
절대 앞 내용을 중복해서 쓰지 말고, 이어지는 다음 글자부터 최종 JSON 배열이 닫힐 때까지(`]`) 계속 작성하세요.

[끊긴 부분 (이 뒷부분부터 이어서 작성할 것)]
...{last_context}"""
                        try:
                            async with variant_sem:
                                cont_resp = await self.model.generate_content_async(
                                    continue_prompt,
                                    generation_config=genai.types.GenerationConfig(
                                        temperature=0.65,
                                        max_output_tokens=8192
                                    )
                                )
                            cont_text = cont_resp.text.strip()
                            if cont_text.startswith("```json"):
                                cont_text = cont_text[7:]
                            if cont_text.startswith("```"):
                                cont_text = cont_text[3:]
                            if cont_text.endswith("```"):
                                cont_text = cont_text[:-3]
                                
                            raw_text += cont_text
                            is_truncated = False
                            if cont_resp.candidates:
                                fr = getattr(cont_resp.candidates[0], 'finish_reason', None)
                                if fr in [2, 'MAX_TOKENS', 'FinishReason.MAX_TOKENS'] or 'MAX_TOKENS' in str(fr):
                                    is_truncated = True
                                elif not raw_text.strip().endswith(']'):
                                    is_truncated = True
                            if not is_truncated:
                                _log(f"    [문항 {q_num}] 🌟 변형문제 이어서 작성 완료!")
                        except Exception as e:
                            _log(f"    [문항 {q_num}] Continue 에러: {e}")
                            break
                        cont_retries += 1

                    raw_text = raw_text.strip()
                    if raw_text.startswith('{') and not raw_text.startswith('['):
                        raw_text = f"[\n{raw_text}\n]"
                    if raw_text.endswith('}') and not raw_text.endswith(']'):
                        raw_text = raw_text + "\n]"
                        
                    ext = self._extract_json_objects(self._sanitize_json(raw_text))
                    variants = [e for e in ext if isinstance(e, dict) and e.get('question', '').strip()]
                    
                    if variants:
                        for v in variants:
                            if not any(cv.get('question', '') == v.get('question', '') for cv in collected_variants):
                                collected_variants.append(v)
                                
                        if len(collected_variants) >= 4:
                            _log(f"    [문항 {q_num}] 🔄 총 문항 {len(collected_variants)}개 성공적 확보 완료!")
                            break
                        else:
                            import json
                            past_json = json.dumps(collected_variants, ensure_ascii=False)
                            needed = 4 - len(collected_variants)
                            current_prompt = f"""앞선 요청에서 문항 개수가 부족합니다! (현재 {len(collected_variants)}개 완료, 향후 {needed}개 추가 필요)
아래 기존에 생성된 문항들과 절대 문제 내용이 겹치지 않게, 부족한 {needed}개의 변형문제를 새롭게 추가 창작하세요.
출력 형식은 동일하게 `question_num`, `question`, `answer_options`, `explanation` 4개 키를 가진 객체의 새로운 JSON 배열(`[...]`) 형태로만 출력하세요. 다른 텍스트는 절대 쓰지 마세요.

[기존 생성 완료 리스트 - 중복 절대 금지]
{past_json}
"""
                    else:
                        _log(f"    [문항 {q_num}] ⚠️ 변형문제 파싱 실패 (시도 {retries+1}/{max_retries}), 재시도...")
                        with open(f"debug_variant_fail_q{safe_q_num}_{retries}.json", "w", encoding="utf-8") as f_err:
                            f_err.write(raw_text)
                            
                except Exception as e:
                    _log(f"    [문항 {q_num}] 변형 생성 에러: {e}")
                    
                retries += 1
                if len(collected_variants) < 4:
                    await asyncio.sleep(2 ** min(retries, 3))
                    
            results = collected_variants[:4]
            if len(results) > 0:
                results[0]['question_num'] = str(q_num)
            for i in range(1, len(results)):
                results[i]['question_num'] = f"{q_num}-변형{i}"
                
            # [CRITICAL FIX] Apply LaTeX to HWP conversion on the final variants generated
            # [CRITICAL FIX] Apply AST Compiler for pure LaTeX to HWP conversion
            from latex_hwp_compiler import compile_latex_to_hwp
            import re as _re
            
            def sweep_latex_ast(text):
                if not text: return text
                parts = _re.split(r'\[\[EQUATION:(.*?)\]\]', text)
                out = ""
                for i, part in enumerate(parts):
                    if i % 2 == 0:
                        out += part
                    else:
                        parsed = compile_latex_to_hwp(part.strip())
                        out += f"[[EQUATION:{parsed}]]"
                return out

            for res in results:
                if isinstance(res.get('question'), str): res['question'] = sweep_latex_ast(res['question'])
                if isinstance(res.get('explanation'), str): res['explanation'] = sweep_latex_ast(res['explanation'])
                if isinstance(res.get('answer_options'), list):
                    res['answer_options'] = [sweep_latex_ast(opt) if isinstance(opt, str) else opt for opt in res['answer_options']]

            return results

        # ── 실행 ─────────────────────────────────────────────────────────────
        total_probs = sum(len(pg['problem_list']) for pg in page_data_list)
        _log(f"\n📝 [변형문제 파이프라인] 총 {total_probs}개 문항 처리 시작...")

        # 1단계: 모든 문항 본문 추출 (병렬)
        extract_tasks = []
        for pg in page_data_list:
            padded_img = pg['padded_img']
            for prob in pg['problem_list']:
                q_num = str(prob['q_num']).replace(".", "").strip()
                cropped_img = prob['cropped_img']
                extract_tasks.append(_extract_question_only(q_num, cropped_img, padded_img))

        extracted = await asyncio.gather(*extract_tasks)
        valid_extracted = [e for e in extracted if e]
        _log(f"\n✅ 1단계 완료: {len(valid_extracted)}/{total_probs}개 문제 본문 추출 성공")

        # 2단계: 각 문항별 변형문제 생성 (병렬)
        _log(f"\n⏳ [2/2단계] 원본 해설 및 3종 변형 문제 동시 생성 돌입... (가장 오래 걸리는 작업입니다. 1~2분 이상 소요될 수 있으니 기다려 주세요.)")
        variant_tasks = [_generate_variants(q_info, variant_difficulty) for q_info in valid_extracted]
        variant_results = await asyncio.gather(*variant_tasks)

        # 결과 평탄화 (원본 해설 + 변형 3개 — _generate_variants가 4개 반환)
        for q_info, variants in zip(valid_extracted, variant_results):
            all_results.extend(variants)  # variants[0]=원본+해설, variants[1~3]=변형+해설

        # 문제 번호 기준 정렬 (1, 1-변형1, 1-변형2, 1-변형3, 2, 2-변형1, ...)
        def _sort_key(prob):
            qn = str(prob.get('question_num', ''))
            # '변형' 포함 여부로 원본/변형 구분
            is_variant = '변형' in qn
            base = qn.split('-변형')[0] if is_variant else qn
            # 숫자 부분만 추출하여 정수 비교
            try:
                base_num = float(''.join(c for c in base if c.isdigit() or c == '.'))
            except:
                base_num = 0
            variant_num = int(qn.split('변형')[-1]) if is_variant else 0
            return (base_num, variant_num)

        all_results.sort(key=_sort_key)

        _log(f"\n🎉 [변형문제 파이프라인 완료] 원본 {len(valid_extracted)}개 + 변형 {sum(len(v) for v in variant_results)}개 = 총 {len(all_results)}개")
        return all_results


    def _get_parsing_rules(self):
        return r"""[핵심 번역/출력 규칙]
1. 허수 i vs 알파벳 l 구분 (복소수 맥락이면 i).
2. 분수와 bar 혼동 금지: `{bar {beta}} over {alpha}` 형태 유지.
3. 모든 수식/알파벳 기호/단순 숫자는 무조건 `[[EQUATION:...]]` 태그 필수.
4. 🚨 **[백틱 절대 금지]** 마크다운 백틱(`` `...` ``)이나 `$수식$` 같은 외부 래퍼를 절대 사용하지 마세요! 수식/기호/숫자는 예외 없이 `[[EQUATION:...]]` 로 감싸세요.
5. **[초엄격: 텍스트 자체 보정 절대 금지]** 당신은 원본 텍스트를 그대로 옮겨 적는 '타이피스트 단말기'입니다. 명백한 수학적 오류가 있어 보이더라도 무조건 주어지는 텍스트 그대로 전사하세요. 본인이 판단해서 고쳐 쓰면 치명적인 시스템 파괴로 간주됩니다.
6. **[초엄격: HWP 수식 강제 금지, 오직 완벽한 표준 LaTeX 문법만 사용!]**
   - 이제부터 수식은 절대 HWP 한글 수식 문법(`over`, `root`, `bmatrix` with `#`)을 쓰지 마세요.
   - 분수: 반드시 `\frac{A}{B}` 사용
   - 무한대/루트: 반드시 `\infty`, `\sqrt{A}`, `\sqrt[n]{x}` 사용
   - 행렬/케이스(cases): `\begin{pmatrix} a & b \\ c & d \end{pmatrix}` 나 `\begin{cases} A & (x \le 0) \\ B & (x > 0) \end{cases}` 같이 표준 암퍼샌드(`&`)와 줄바꿈(`\\`) 기호를 '절대' 생략하지 마세요! 생략하면 수식이 한 줄로 찌그러집니다.
   - 🚨 [초엄격: 괄호 크기 찌그러짐 방지!]: 분수(\frac)처럼 위아래로 큰 수식을 괄호로 묶을 때는 일반 ( ) 를 절대 쓰지 마세요. 무조건 크기가 자동 조절되는 \left( \frac{A}{B} \right) 등 \left 와 \right 를 쌍으로 작성하세요.
   - 🚨 [초엄격: 연속된 문자변수 및 기하학 점 표기 규칙]: 
     1) 선분 AB, 직선 PQ 등 글자가 2개 이상 연속되는 기하학적 대상은 무조건 순수 변수 `AB`, `PQ` 로 표기하세요. (절대 `\text{AB}` 나 `\mathrm{AB}` 로 감싸지 마세요!)
     2) 점 A, 점 B, 점 P 처럼 기하학적 점 하나를 단독으로 쓸 때는 무조건 `\mathrm{A}` 형태로 감싸서 로만체로 세우세요!
     3) 집합 A, 행렬 A, 사건 A 처럼 일반적인 수학 변수는 절대 `\mathrm{}` 으로 감싸지 말고 순수 변수 `A` 로 두세요! (행렬이나 집합은 이탤릭체가 표준입니다.)
     4) 단, 한글 텍스트(예: `\text{최댓값}`)가 수식에 들어갈 때만 예외적으로 `\text{}`를 허용합니다.
   - 곱하기/나누기: `\times`, `\div` 사용
   - 상단 선(켤레복소수 등): `\overline{AB}` 형태를 사용하세요.
7. **[시스템 파이프라인]** 시스템 후단부에서 파이썬 기반 AST 컴파일러가 알아서 LaTeX를 HWP로 완벽하게 변환해 줍니다. 그러니 당신은 원문에 충실하게 순수한 수식(LaTeX)만 추출하면 됩니다.
8. **[단어 누락 / <보기> 공백 절대 금지]** 사소한 단어를 빼먹지 마세요. `<보 기>` 처럼 공백이 있더라도 무조건 공백을 제거하고 `<보기>` 로 붙여서 추출하세요.
"""

    def _get_vision_rules(self):
        return r"""[시각적 팩트체크 특별 규칙 (OCR 전용)]
12. 🚨 **[수식 대칭성에 의한 시각적 환각(Hallucination) 경고]** 원본 이미지에 존재하지 않는 기호(`bar` 가로줄, `-` 마이너스 등)를 수학적 대칭성에 이끌려 문맥상 멋대로 창조해서 붙이지 마세요! 픽셀 단위로 '가로줄'이 잉크로 칠해져 있는지 기계처럼 관찰하세요.
13. **극한(Limit) 문제 시각적 풀이 필수**: 함수 그래프 이미지가 주어진 극한 문제는 수식만으로 유추해서 풀지 말고 반드시 픽셀을 눈으로 대조해서 푸세요.
14. **[초긴급! 분모/분자 위치 역전 절대 금지!]** 이미지의 가로줄 위아래 위치를 똑똑히 확인하고 그대로 적으세요!!
15. **[계산 결과 불일치/교정 시 원본 재확인 강제 (가장 중요!)]** 당신이 해설을 위해 푼 연산이 선택지 번호나 문제의 숫자와 다를 경우, '조교가 오타를 냈다'고 함부로 단정하고 숫자를 뜯어고치지 마세요! 반드시 첨부된 원본 이미지의 해당 픽셀을 현미경처럼 다시 관찰하여 팩트체크 후 해설을 수정하세요.
"""

    def _get_core_rules(self):
        return self._get_parsing_rules() + "\n" + self._get_vision_rules()


    async def _extract_single_problem(self, q_num, img_data, pass1_sem, pass2_sem, pass3_sem, log_fn, fallback_img=None, is_rescue=0):
        import contextlib
        @contextlib.asynccontextmanager
        async def _dummy_ctx():
            yield
                
        async with _dummy_ctx():
            final_result = None
            retries = 0
            max_retries = 6 
            while retries < max_retries:
                try:
                    if "1학기" in self.curriculum and "고1" in self.curriculum:
                        level_instr = """🚨[해설 제한 — 고1 1학기: 공통수학1 전용]
- 허용 개념: 다항식 연산, 나머지정리/인수분해, 복소수, 이차방정식, 이차함수, 여러가지 방/부등식, 경우의수/순열/조합, 행렬
- 절대 금지 개념: 
  · '구간', '열린구간', '닫힌구간' 기호 (범위는 부등식 a<=x<=b 사용)
  · 함수기호, 역함수, 유리/무리함수, 삼각비, 집합/명제
  · 미분, 도함수, 극대, 극소, 극한, 적분
  · 🚨 도형 문제 푸는데 아직 좌표평면을 안배웠으니 좌표계로 끌고오지 말 것. 최대최소는 절대 미분금지. 이차함수 꼭짓점 이용."""
                    elif "2학기" in self.curriculum and "고1" in self.curriculum:
                        level_instr = """🚨[해설 제한 — 고1 2학기: 공통수학2 전용]
- 허용 개념: 도형의 방정식(좌표평면, 직선, 원, 이동), 집합과 명제, 함수(합성, 역함수), 유리함수, 무리함수
- 절대 금지 개념:
  · '구간', '열린구간', '닫힌구간' 기호 (여전히 부등식 사용 강제)
  · 수열, 삼각함수, 지수로그함수
  · 극한(lim), 미분, 적분, 극대, 극소, 변곡점
  · 🚨 점근선을 설명할 때 lim 기호 쓰지말고 수식으로만 서술. 최대최소는 미분 없이 산술기하 및 코시슈바르츠 부등식 이용."""
                    elif "1학기" in self.curriculum and "고2" in self.curriculum:
                        level_instr = """🚨[해설 제한 — 고2 1학기: 대수 전용]
- 허용 개념: 지수와 로그, 지수함수/로그함수, 삼각함수, 사인/코사인법칙, 수열, 수학적 귀납법
- 절대 금지 개념:
  · '구간' 기호 (범위는 부등식 사용), 극한, 연속
  · 미분, 도함수, 접선의 방정식, 적분, 극대, 극소, 이계도함수
  · 🚨 함수의 최대최소에 미분 절대 쓰지말고 치환, 주기성 등 대수적 방식으로만 풀 것."""
                    elif "2학기" in self.curriculum and "고2" in self.curriculum:
                        level_instr = """🚨[해설 제한 — 고2 2학기: 미적분I 전용]
- 허용 개념: 극한, 연속, '구간' 기호, 다항함수의 미적분, 롤의 정리, 극대/극소, 도함수
- 절대 금지 개념:
  · 자연상수 e, 자연로그 ln, 삼각함수/초월함수의 연속/미분/적분 (미적분II 영역)
  · 음함수/매개변수 미분, 이계도함수, 변곡점, 부분적분, 치환적분
  · 🚨 3/4차 함수 개형 판단에 변곡점을 직접 가져와서 쓰지 말 것. 증감표 기반으로만 서술할 것."""
                    else:
                        level_instr = """🚨[해설 제한 — 고3 전체 교육과정 허용]
모든 정규 교과과정(미적분II, 확률과 통계, 기하 포함)의 개념과 용어를 사용할 수 있습니다.
🚨 단, 대한민국 정규 과정을 벗어나는 대학교 수준 이론이나 KMO 경시 전용 이론은 절대 불가."""

                    mathpix_str = ""
                    if self.use_mathpix:
                        if retries == 0:
                            log_fn(f"    [문항 {q_num}] 🚀 Mathpix 초고속 무결점 전사 시작...")
                        else:
                            log_fn(f"    [문항 {q_num}] 🚀 Mathpix 1차 전사 재시도... (시도 {retries+1}/{max_retries})")
                        
                        mathpix_text = await self._call_mathpix_async(img_data, log_fn)
                        if str(q_num) == "2":
                            print(f"\n\n====================== MATHPIX Q2 RAW TEXT ======================\n{mathpix_text}\n=================================================================\n\n")
                        if mathpix_text:
                            mathpix_str = f"\n\n🚨 [가장 중요한 원본 텍스트 - 무비판적 수용 필수] 🚨\n최고의 문자인식기 Mathpix가 추출한 무결점 100% 원본 텍스트입니다. 이 내용을 절대 의심하거나 자체 수정하지 말고, 표준 LaTeX 태그 번역 작업의 <<유일무이한 원본>>으로 삼으세요.\n\n[원본 텍스트 시작]\n{mathpix_text}\n[원본 텍스트 끝]\n\n"
                    
                    if mathpix_str:
                        # [V10.1 Two-Pass Architecture (Typing Exemption)]
                        log_fn(f"    [문항 {q_num}] ⚙️ 1차(수식 변환): Mathpix 텍스트 파싱 모드 시작...")
                        prompt1 = f"""[수학 문제 정밀 번역가 모드]
아래 첨부된 '원본 텍스트'는 제 {q_num}번 문제가 포함된 크롭 이미지에서 추출한 텍스트입니다.
당신의 임무는 이 텍스트 중에서 **오직 제 {q_num}번 문제에 해당하는 본문과 보기만** 완벽하게 발췌하여 `question`과 `answer_options` 영역에 밀어 넣는 것입니다.

🚨 [필수 발췌 지침]
1. 크롭 영역의 한계로 인해 원본 텍스트의 맨 앞이나 맨 뒤에 {q_num}번 문제가 아닌 **다른 문제의 파편(예: 다음 문제 번호, 전혀 다른 맥락의 문장 등)**이 섞여 들어왔을 수 있습니다.
2. 문맥을 읽고 판단하여, 명백하게 {q_num}번 문제가 아닌 주변 문제의 파편은 과감하게 잘라내고 버리세요.
3. 단, {q_num}번 문제 내부의 텍스트(수식, 조건, 보기)라면 단 한 글자도 빠뜨리거나 임의로 요약/수정하지 말고 100% 투명하게 전사해야 합니다.
{mathpix_str}
"""

                        from typing import List


                        from typing_extensions import TypedDict
                        class MathpixPass1Response(TypedDict):
                            question_num: str
                            question: str
                            answer_options: List[str]

                        # 1차 파싱에서 절단 에러 발생을 대비하여 재시도 시 Temperature 상향
                        curr_temp_p1 = 0.2 if retries == 0 else min(0.3 + (retries * 0.1), 0.5)

                        async with pass1_sem:
                            resp1 = await self.flash_model.generate_content_async(
                                [prompt1],
                                generation_config=genai.types.GenerationConfig(
                                    temperature=curr_temp_p1,
                                    max_output_tokens=32768,
                                    response_mime_type="application/json",
                                    response_schema=MathpixPass1Response
                                )
                            )
                        text1 = self._sanitize_json(resp1.text)
                        ext1 = self._extract_json_objects(text1)
                        if not ext1:
                            log_fn(f"\n--- [디버그: 문항 {q_num} Pass 1 파싱 실패 원본 텍스트] ---\n{resp1.text}\n-----------------------------------\n")
                            raise ValueError("Pass 1 Extraction Failed")
                        pass1_result = ext1[0]
                        
                        # [V12.6 FIX] Pass1 question 잘림 감지: question이 [[EQUATION: 로 끝나거나 닫힌 태그가 없으면 재시도
                        raw_q = pass1_result.get('question', '')
                        q_is_truncated = False
                        if resp1.candidates:
                            fr1 = getattr(resp1.candidates[0], 'finish_reason', None)
                            if fr1 in [2, 'MAX_TOKENS', 'FinishReason.MAX_TOKENS'] or 'MAX_TOKENS' in str(fr1):
                                q_is_truncated = True
                        # 열린 [[EQUATION: 가 닫히지 않으면 잘린 것
                        if not q_is_truncated:
                            open_count = raw_q.count('[[EQUATION:')
                            close_count = raw_q.count(']]')
                            if open_count > close_count:
                                q_is_truncated = True
                                log_fn(f"    [문항 {q_num}] ⚠️ Pass1 question 수식 태그 미닫힘 감지 ({open_count}개 열림 vs {close_count}개 닫힘) → 재시도")
                        if q_is_truncated:
                            log_fn(f"    [문항 {q_num}] ⚠️ Pass1 question 잘림 감지 → 재시도")
                            raise ValueError("Pass1 Question Truncated")

                        # [V12.5.19 FIX] Pass1 question이 비어있으면 Mathpix 원문을 fallback으로 사용
                        # 원인: 크롭 이미지에 문제 번호가 없거나 Gemini가 번호 불일치로 question을 빈 값 반환
                        if not pass1_result.get('question', '').strip():
                            log_fn(f"    [문항 {q_num}] ⚠️ Pass1 question 공백 감지 → Mathpix 원문 fallback 적용")
                            pass1_result['question'] = mathpix_text
                        
                        log_fn(f"    [문항 {q_num}] 🧠 2차(본격 해설): 번역 완료 지문({len(pass1_result.get('question', ''))}자) 공급, 해설 집중 작성 돌입!")
                        prompt2 = f"""[1타 강사 모드 - 해설 전담 작성]
아래 문제는 이미 시스템이 완벽하게 준비한 {q_num}번 문제입니다.
[문제 본문]
{pass1_result.get('question', '')}
[보기]
{pass1_result.get('answer_options', [])}

이 문제를 바탕으로 완벽한 해설을 `thought_process`와 `explanation_raw` 영역에 작성하세요.
**풀이의 핵심 단계와 수식 위주로 최대한 간결하게(개조식으로) 작성해 줘.**

🚨 [AI 해설 전담 작성 강제 프로세스 (Zero-Hallucination)] 🚨
[1단계: 설계 (Plan)] 문제의 핵심 조건과 해결해야 할 방향 3가지를 먼저 선언하라.
[2단계: 연산 (Solve)] 절대 암산하지 마라. 가상의 파이썬 코드 실행기를 이용해 연산하거나, 중간 연산 과정을 철저하게 수식 블록으로 전개하라.
[3단계: 역대입 검증 (Critique)] 도출된 답을 원래 방정식/조건에 다시 대입하여 좌변/우변이 일치하는지 `thought_process` 안에서 반드시 증명하라. 완벽히 일치할 때만 해설 작성을 시작/완료하고, 오차가 있다면 즉시 과정 전체를 다시 점검하라.

🚨 [수식 태그 작성 필수 규칙] 🚨
1. 해설 글 속의 모든 수식, 변수, 수학 기호는 [[EQUATION:수식]] 형태로 감싸야 합니다. ($ 기호 절대 금지)
   - ✅ 올바른 예시: [[EQUATION:\\alpha \\overline{{\\alpha}} = 4^{{2}} + 3^{{2}} = 25]]
   - ❌ 잘못된 예시: $\\alpha\\bar{{\\alpha}} = 25$ (달러 기호 사용 불가)
2. [[EQUATION:...]] 내부는 절대 HWP 수식을 직접 사용하지 말고 반드시 **완벽한 국제 표준 LaTeX 문법**만을 사용하세요:
   - 분수: \\frac{{분자}}{{분모}}
   - 루트/거듭제곱근: \\sqrt{{A}}, \\sqrt[n]{{x}}
   - 그리스 문자/기능: \\alpha, \\sum, \\int, \\lim
   - 행렬: \\begin{{pmatrix}} a & b \\\\ c & d \\end{{pmatrix}} 등 표준 LaTeX 환경 사용
3. 단순 변수/숫자도 빠짐없이 [[EQUATION:x]], [[EQUATION:5]]처럼 감싸세요.
4. 해설 작성 형식:
   - **수식 중심 개조식**으로 작성하세요.
   - 🚨 **[함수 정의 줄바꿈 분리 필수]**: f(x), g(x), h(x) 등 서로 다른 함수 정의가 여러 개 있을 때 절대 한 줄에 이어 쓰지 마세요. 반드시 함수마다 별도 줄(\\n)로 분리하세요.
   - 🚨 **`-`(하이픈, 대시, 불릿) 절대 사용 금지** — 각 단계를 그냥 줄바꿈(\\n)으로 구분하세요.
   - 각 계산 단계는 줄바꿈으로 분리하여 가독성을 높이세요. (2단 한글 문서 기준이므로 줄바꿈 적극 활용)
   - 예시:
     ✅ [[EQUATION:x = 1]]\\n[[EQUATION:x + 1 = 2]]\\n따라서 정답은 ③이다.
     ❌ - [[EQUATION:x = 1]] - [[EQUATION:x + 1 = 2]]
   - 불필요한 섹션 제목(예: "각 항의 값 계산", "최종 값 계산" 등 구분 헤더) 금지.
   - 마지막 결론 줄 형식:
     · 객관식(보기 ①②③④⑤ 있음): "따라서 정답은 ①이다." — 🚨 반드시 원문자(①②③④⑤)로! 숫자(1,2,3,4,5) 절대 금지!
     · 단답형(보기 없음): "따라서 정답은 [[EQUATION:24]]이다." — 🚨 답 수치/식도 반드시 [[EQUATION:...]]으로 감쌀 것! 텍스트 그대로 쓰기 절대 금지!

5. 🚨 [숫자 절대 변경 금지] 문제에 등장하는 모든 계수, 상수, 지수, 숫자는 단 하나도 바꾸거나 단순화하거나 반올림하지 마라. 이미지와 교차 검증하여 그대로만 사용하라.
6. 해설 전체 길이는 최대한 짧게 - 핵심 수식 흐름만 보여주면 충분합니다.
7. 🚨 **[오답/모순 증명 필수]** 경우를 나누어 푸는 문제(예: c=2 또는 c=4)에서 특정 경우가 답이 되더라도, **나머지 오답 케이스(모순이 발생하는 경우)가 왜 안 되는지에 대한 증명 과정도 해설에 반드시 포함**하세요. 정답 케이스만 설명하고 넘어가는 것을 엄격히 금지합니다.
8. 🚨 **[직관적/그래프 풀이 우선]** 복잡하고 긴 대수적 계산(방정식, 부등식의 기계적 전개식 등)보다는, **함수 그래프의 기하학적 성질(대칭성, 넓이, 교점, 주기성, 평행이동 등)**이나 직관적인 해석을 이용해 풀 수 있는 문제라면 무조건 그 방법을 우선하여 해설을 작성하세요. 일반 학생들이 봤을 때 이질적이고 불필요하게 긴 대수적 풀이는 피하고, 가장 간결하고 세련된(직관적인) 풀이 방식을 채택하세요.


{level_instr}
"""


                        class MathpixPass2Response(TypedDict):
                            thought_process: str
                            explanation_raw: str
                            
                        curr_temp = 0.2 if retries == 0 else min(0.3 + (retries * 0.15), 0.7)
                        if retries > 0:
                            log_fn(f"    [문항 {q_num}] Temperature 상향 조정 (반복 절단 회피): {curr_temp:.2f}")

                        # Use Pro Model for explanation, optionally with image for geometry context
                        async with pass2_sem:
                            resp2 = await self.pro_model_clean.generate_content_async(
                                [img_data, prompt2],
                                generation_config=genai.types.GenerationConfig(
                                    temperature=curr_temp,
                                    max_output_tokens=32768,
                                    response_mime_type="application/json",
                                    response_schema=MathpixPass2Response
                                )
                            )
                        print("\n[DEBUG RAW PAYLOAD LEN]:", len(resp2.text))
                        print("[DEBUG RAW PAYLOAD TRUNCATED]:\n", repr(resp2.text[:1000] + "\n...\n" + resp2.text[-1000:]))
                        text2 = self._sanitize_json(resp2.text)
                        ext2 = self._extract_json_objects(text2)
                        
                        if ext2:
                            pass2_result = ext2[0]
                            explanation_raw = pass2_result.get("explanation_raw", "")
                            thought_process = pass2_result.get("thought_process", "")
                            
                            is_truncated = False
                            if resp2.candidates:
                                finish_reason = getattr(resp2.candidates[0], 'finish_reason', None)
                                if finish_reason in [2, 'MAX_TOKENS', 'FinishReason.MAX_TOKENS'] or 'MAX_TOKENS' in str(finish_reason):
                                    is_truncated = True
                                elif "정답은" not in explanation_raw and "답은" not in explanation_raw and "답:" not in explanation_raw:
                                    is_truncated = True
                                    log_fn(f"    [문항 {q_num}] ⚠️ API 정상 종료 코드가 떴으나 '정답' 문구가 없어 절단된 것으로 간주합니다 (JSON 강제 닫힘).")

                            cont_retries = 0
                            while is_truncated and cont_retries < 5:
                                log_fn(f"    [문항 {q_num}] ⚠️ 이어서 작성(Continue) 모드 발동... (시도 {cont_retries+1}/3)")
                                last_context = explanation_raw[-150:] if len(explanation_raw) > 150 else explanation_raw
                                continue_prompt = f"""당신이 앞서 작성하던 해설이 문장 중간에 끊겼습니다.
아래 [끊긴 부분]을 읽고, **절대 앞 내용을 중복해서 다시 적지 말고**, 그 바로 다음 단어부터 이어서 끝까지 완성하세요.
만약 수식을 무한 반복하고 있었다면 즉시 멈추고 결론으로 넘어가세요. 
해설의 문체는 반드시 '~한다', '~이다' 형태의 해라체(평어체)를 유지해야 하며 ('~해요/입니다' 금지), 마지막에는 '따라서 정답은 [최종답안]이다.' 로 마무리해야 합니다.

[끊긴 부분 (이 뒷부분부터 이어서 작성할 것)]
...{last_context}"""
                                
                                class MathpixPass2Continue(TypedDict):
                                    explanation_raw_continued: str
                                    
                                async with pass2_sem:
                                    cont_resp = await self.pro_model_clean.generate_content_async(
                                        [img_data, continue_prompt] if isinstance(img_data, Image.Image) else [continue_prompt],
                                        generation_config=genai.types.GenerationConfig(
                                            temperature=curr_temp,
                                            max_output_tokens=8192,
                                            response_mime_type="application/json",
                                            response_schema=MathpixPass2Continue
                                        )
                                    )
                                print("\n[DEBUG CONT RAW PAYLOAD LEN]:", len(cont_resp.text))
                                cont_text = self._sanitize_json(cont_resp.text)
                                cont_ext = self._extract_json_objects(cont_text)
                                if cont_ext:
                                    appended_text = cont_ext[0].get("explanation_raw_continued", "")
                                    if not appended_text: appended_text = cont_ext[0].get("explanation_raw", "")
                                    explanation_raw += " " + appended_text
                                    is_truncated = False
                                    if cont_resp.candidates:
                                        fr = getattr(cont_resp.candidates[0], 'finish_reason', None)
                                        if fr in [2, 'MAX_TOKENS', 'FinishReason.MAX_TOKENS'] or 'MAX_TOKENS' in str(fr):
                                            is_truncated = True
                                        elif "정답은" not in explanation_raw and "답은" not in explanation_raw and "답:" not in explanation_raw:
                                            is_truncated = True
                                            log_fn(f"    [문항 {q_num}] ⚠️ Continue 로직에서도 JSON 강제 닫힘이 감지되어 연장합니다.")
                                    if not is_truncated:
                                        log_fn(f"    [문항 {q_num}] 🌟 이어서 작성(Continue) 완료!")
                                else:
                                    break
                                cont_retries += 1

                            # [V11.8.8 Pass 3 대규모 숙청 (Excision)]
                            # Pass 3 플래시 모델이 지능적 환각(Summarization)을 자행하므로, AI 호출을 완전히 제거하고 
                            # Pass 2의 결과를 직접 확정합니다. 이후 파이프라인 하단의 정규식 엔진(force_equation_tags)이 나머지 변환을 담당합니다.
                            explanation_final = explanation_raw
                            
                            log_fn(f"\n================ [디버그: Pass 2 FINAL 해설 (포맷팅 렌더링 전 RAW)] ================\n{explanation_final}\n=================================================================================\n")

                            final_result = {
                                "question_num": pass1_result.get("question_num", q_num),
                                "question": pass1_result.get("question", ""),
                                "answer_options": pass1_result.get("answer_options", []),
                                "thought_process": thought_process,
                                "explanation": explanation_final
                            }
                            log_fn(f"    [문항 {q_num}] Two-Pass 파싱 및 해설 도출 완전 성공! (Python Regex Delegated)")
                            break
                        else:
                            log_fn(f"    [문항 {q_num}] Two-Pass JSON 파싱 실패, 재시도 중...")
                            log_fn(f"\n--- [디버그: 문항 {q_num} Pass2 파싱 실패 원본 텍스트] ---\n{resp2.text}\n-----------------------------------\n")

                    else:
                        # [하이브리드 모드 (자체 비전 스캔)]
                        log_fn(f"    [문항 {q_num}] 👁️ 하이브리드: 기계 추출+1타 강사 해설 통합 시작... (시도 {retries + 1}/{max_retries})")
                        prompt = f"""당신은 지금부터 두 가지 역할을 순서대로 완벽하게 수행해야 합니다.

[Step 1: 정밀 타겟 추출기 모드 (문제 발췌)]
첨부된 이미지에는 넉넉한 크롭 영역으로 인해 위아래로 다른 문제의 파편(예: 다음 문제 번호/지문 등)이 섞여 있을 수 있습니다.
당신의 임무는 시각적 문맥을 판단하여 **제 {q_num}번 문제에 해당하는 본문과 보기만**을 정확하게 발라내고, 명백하게 주변 문제의 파편인 부분은 과감하게 쳐내어 버리세요.
단, {q_num}번 문제 내부에 존재하는 수식과 문장 구조만큼은 단 1픽셀도 임의로 생략/요약하지 말고 100% 투명하게 `question`과 `answer_options` 영역에 전사해야 합니다.

[Step 2: 1타 강사 모드 (해설 작성)]
추출이 끝났다면, 이제 똑똑한 강사로 돌아와 방금 추출한 '{q_num}'번 문제를 바탕으로 논리적인 해설을 작성하여 `thought_process`와 `explanation` 영역에 채워 넣으세요.

🚨 [AI 해설 전담 작성 강제 프로세스 (Zero-Hallucination)] 🚨
[1단계: 설계 (Plan)] 문제의 핵심 조건과 해결해야 할 방향 3가지를 먼저 선언하라.
[2단계: 연산 (Solve)] 절대 암산하지 마라. 가상의 파이썬 코드 실행기를 이용해 연산하거나, 중간 연산 과정을 철저하게 수식 블록으로 전개하라.
[3단계: 역대입 검증 (Critique)] 도출된 답을 원래 방정식/조건에 다시 대입하여 좌변/우변이 일치하는지 `thought_process` 안에서 반드시 증명하라. 완벽히 일치할 때만 해설 작성을 시작/완료하고, 오차가 있다면 즉시 과정 전체를 다시 점검하라.

{level_instr} 
🚨 [수식 태그 작성 필수 규칙] 🚨
1. 해설 글 속의 모든 수식, 변수, 수학 기호는 [[EQUATION:수식]] 형태로 감싸야 합니다. ($ 기호 절대 금지)
   - ✅ 올바른 예시: [[EQUATION:\\alpha \\overline{{\\alpha}} = 4^{{2}} + 3^{{2}} = 25]]
   - ❌ 잘못된 예시: $\\alpha\\bar{{\\alpha}} = 25$ (달러 기호 사용 불가)
2. [[EQUATION:...]] 내부는 절대 HWP 수식을 직접 사용하지 말고 반드시 **완벽한 국제 표준 LaTeX 문법**만을 사용하세요:
   - 분수: \\frac{{분자}}{{분모}}
   - 루트/거듭제곱근: \\sqrt{{A}}, \\sqrt[n]{{x}}
   - 그리스 문자/기능: \\alpha, \\sum, \\int, \\lim
   - 행렬: \\begin{{pmatrix}} a & b \\\\ c & d \\end{{pmatrix}} 등 표준 LaTeX 환경 사용
3. 단순 변수/숫자도 빠짐없이 [[EQUATION:x]], [[EQUATION:5]]처럼 감싸세요.
4. 해설 전체의 문체는 '~한다', '~이다' 형태의 해라체로 통일하세요. 마지막 문장은 '따라서 정답은 [최종답안]이다.' 형식으로 끝내세요.
5. 🚨 [숫자 절대 변경 금지] 문제에 등장하는 모든 계수, 상수, 지수, 숫자는 단 하나도 바꾸거나 반올림하지 마라.
6. 🚨 **[오답/모순 증명 필수]** 경우를 나누어 푸는 문제(예: c=2 또는 c=4)에서 특정 경우가 답이 되더라도, **나머지 오답 케이스(모순이 발생하는 경우)가 왜 안 되는지에 대한 증명 과정도 해설에 반드시 포함**하세요. 정답 케이스만 설명하고 넘어가는 것을 엄격히 금지합니다.
7. 🚨 **[직관적/그래프 풀이 우선]** 복잡하고 긴 대수적 계산(방정식, 부등식의 기계적 전개식 등)보다는, **함수 그래프의 기하학적 성질(대칭성, 넓이, 교점, 주기성, 평행이동 등)**이나 직관적인 해석을 이용해 풀 수 있는 문제라면 무조건 그 방법을 우선하여 해설을 작성하세요. 일반 학생들이 봤을 때 이질적이고 불필요하게 긴 대수적 풀이는 피하고, 가장 간결하고 세련된(직관적인) 풀이 방식을 채택하세요.

"""

                        curr_temp = 0.2 if retries == 0 else min(0.3 + (retries * 0.15), 0.7)
                        if retries > 0:
                            log_fn(f"    [문항 {q_num}] Temperature 상향 조정 (반복 절단 회피): {curr_temp:.2f}")

                        model_to_use = self.model
                        
                        from typing import List

                        
                        from typing_extensions import TypedDict
                        class HybridResponse(TypedDict):
                            question_num: str
                            pre_reading_aloud: str
                            question: str
                            answer_options: List[str]
                            thought_process: str
                            explanation: str
                        
                        async with pass2_sem:
                            resp = await model_to_use.generate_content_async(
                                [img_data, prompt],
                                generation_config=genai.types.GenerationConfig(
                                    temperature=curr_temp,
                                    max_output_tokens=32768,
                                    response_mime_type="application/json",
                                    response_schema=HybridResponse
                                )
                            )
                        text = self._sanitize_json(resp.text)
                        ext = self._extract_json_objects(text)
                        if ext:
                            final_result = ext[0]
                            explanation_text = final_result.get("explanation", "")
                            thought_process = final_result.get("thought_process", "")
                            
                            is_truncated = False
                            if resp.candidates:
                                finish_reason = getattr(resp.candidates[0], 'finish_reason', None)
                                if finish_reason in [2, 'MAX_TOKENS', 'FinishReason.MAX_TOKENS'] or 'MAX_TOKENS' in str(finish_reason):
                                    is_truncated = True
                                elif "정답은" not in explanation_text and "답은" not in explanation_text and "답:" not in explanation_text:
                                    is_truncated = True
                                    log_fn(f"    [문항 {q_num}] ⚠️ API 정상 종료 코드가 떴으나 '정답' 문구가 없어 절단된 것으로 간주합니다.")

                            cont_retries = 0
                            while is_truncated and cont_retries < 5:
                                log_fn(f"    [문항 {q_num}] ⚠️ 이어서 작성(Continue) 모드 발동... (시도 {cont_retries+1}/3)")
                                last_context = explanation_text[-150:] if len(explanation_text) > 150 else explanation_text
                                continue_prompt = f"""당신이 앞서 작성하던 해설이 문장 중간에 끊겼습니다.
아래 [끊긴 부분]을 읽고, **절대 앞 내용을 중복해서 다시 적지 말고**, 그 바로 다음 단어부터 이어서 끝까지 완성하세요.
만약 수식을 무한 반복하고 있었다면 즉시 멈추고 결론으로 넘어가세요. 
해설의 문체는 반드시 '~한다', '~이다' 형태의 해라체(평어체)를 유지해야 하며 ('~해요/입니다' 금지), 마지막에는 '따라서 정답은 [최종답안]이다.' 로 마무리해야 합니다.

[끊긴 부분 (이 뒷부분부터 이어서 작성할 것)]
...{last_context}"""
                                
                                class HybridContinue(TypedDict):
                                    explanation_continued: str
                                    
                                async with pass2_sem:
                                    cont_resp = await model_to_use.generate_content_async(
                                        [img_data, continue_prompt] if isinstance(img_data, Image.Image) else [continue_prompt],
                                        generation_config=genai.types.GenerationConfig(
                                            temperature=curr_temp,
                                            max_output_tokens=8192,
                                            response_mime_type="application/json",
                                            response_schema=HybridContinue
                                        )
                                    )
                                cont_text = self._sanitize_json(cont_resp.text)
                                cont_ext = self._extract_json_objects(cont_text)
                                if cont_ext:
                                    explanation_text += " " + cont_ext[0].get("explanation_continued", "")
                                    is_truncated = False
                                    if cont_resp.candidates:
                                        fr = getattr(cont_resp.candidates[0], 'finish_reason', None)
                                        if fr in [2, 'MAX_TOKENS', 'FinishReason.MAX_TOKENS'] or 'MAX_TOKENS' in str(fr):
                                            is_truncated = True
                                        elif "정답은" not in explanation_text and "답은" not in explanation_text and "답:" not in explanation_text:
                                            is_truncated = True
                                            log_fn(f"    [문항 {q_num}] ⚠️ Continue 로직에서도 JSON 강제 닫힘이 감지되어 연장합니다.")
                                    if not is_truncated:

                                        log_fn(f"    [문항 {q_num}] 🌟 이어서 작성(Continue) 완료!")
                                else:
                                    break
                                cont_retries += 1
                                
                            final_result["thought_process"] = thought_process
                            final_result["explanation"] = explanation_text
                            log_fn(f"    [문항 {q_num}] 하이브리드 파싱 완전 성공!")
                            break
                        else:
                            log_fn(f"    [문항 {q_num}] JSON 파싱 실패, 재시도 중...")
                            log_fn(f"\n--- [디버그: 문항 {q_num} 파싱 실패 원본 텍스트] ---\n{resp.text}\n-----------------------------------\n")

                        if fallback_img is not None and ('[]' in resp.text or resp.text.strip() == ''):
                            log_fn(f"    [문항 {q_num}] 🚨 영역 절단 의심! 다음 시도부터 전체 풀-페이지를 투입합니다.")
                            img_data = fallback_img
                            fallback_img = None
                        
                    import random
                    jitter = random.uniform(0.5, 2.0)
                    wait_time = (2 ** retries) + jitter
                    log_fn(f"    [문항 {q_num}] 파싱 실패! Jitter 대기: {wait_time:.1f}초 (Exponential Backoff)")
                    retries += 1
                    await asyncio.sleep(wait_time)
                except Exception as e:
                    import random
                    jitter = random.uniform(1.0, 4.0)
                    wait_time = (2 ** retries) + 5.0 + jitter
                    log_fn(f"    [문항 {q_num}] API 에러: {e} -> 대기: {wait_time:.1f}초")
                    retries += 1
                    await asyncio.sleep(wait_time)

            if not final_result:
                log_fn(f"    [문항 {q_num}] ❌ 1:1 단독 추출마저 예외 발생 (총 {max_retries}회 증발). 구조 불가 처리됩니다.")
                return None

            # [V12.5 아키텍처] 수식 추출 및 캐폁화
            # equations는 새롭게 시작해야 retry 누적 버그 방지
            import re
            import json

            equations = []  # 항상 retry 루프 이후에 새로 시작
            def replacer(match):
                eq = match.group(2) or match.group(3) or match.group(4)
                if not eq: return match.group(0)
                equations.append(eq.strip())
                return f"__MATH_{len(equations)-1}__"

            pattern = re.compile(r'(\$\$?)(.+?)\1|\\\[(.+?)\\\]|\\\((.+?)\\\)', re.DOTALL)

            for k in ['question', 'explanation', 'explanation_raw', 'thought_process']:
                if k in final_result and isinstance(final_result[k], str):
                    final_result[k] = pattern.sub(replacer, final_result[k])

            if 'answer_options' in final_result and isinstance(final_result['answer_options'], list):
                for i in range(len(final_result['answer_options'])):
                    if isinstance(final_result['answer_options'][i], str):
                        final_result['answer_options'][i] = pattern.sub(replacer, final_result['answer_options'][i])

            # [V12.5.5 글로벌 배치] LaTeX -> 번역은 글로벌 단계에서 일괄 처리. 여기선 raw_equations만 저장.
            final_result['_raw_equations'] = equations

            # [Safety Net] 모든 필드를 대상으로 점검: LaTeX 쟐해 처리
            # 조건: 단순히 텍스트 전체에 백슬래시가 남아있을 때만 실행 (조건 범위 고침)
            def sweep_stray_latex(val):
                if not isinstance(val, str): return val
                def _fix(m):
                    chunk = m.group(0)
                    if '[[EQUATION:' in chunk: return chunk
                    inner = chunk.strip()
                    inner = inner.replace('+', ' + ').replace('-', ' - ').replace('=', ' = ')
                    inner = re.sub(r'\s+', ' ', inner).strip()
                    return f'[[EQUATION:{inner}]]'
                return re.sub(
                    r'(?<!\[\[EQUATION:)((?:\\[a-zA-Z]+(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})?)+(?:[^$\n\[\]]*(?:\\[a-zA-Z]+(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})?)?)*)',
                    lambda m: _fix(m) if '[[EQUATION:' not in m.group(0) else m.group(0),
                    val
                )

            for k in ['explanation', 'explanation_raw', 'thought_process']:
                if k in final_result and isinstance(final_result[k], str):
                    val = final_result[k]
                    # 수식이 남아있는지 전체 텍스트 대상으로 확인 (기존 [:50] 범위 버그 수정)
                    if '\\' in val:
                        final_result[k] = sweep_stray_latex(val)

            log_fn(f"    [문항 {q_num}] [성공] 단일 코어 추출 완료! (One-Pass)")
            return final_result



    async def _generate_single_variant(self, original_prob, difficulty, log_fn):
        q_num = original_prob.get("question_num", "unknown")
        
        prompt = f"""다음 수학 문제를 바탕으로 유사한 쌍둥이/변형 문제 3개를 생성하세요.
[원본 문제]
{original_prob.get('question', '')}

[조건]
1. 난이도: {difficulty}
2. 모든 수식은 `[[EQUATION:수식]]` 태그를 사용하고 절대 HWP 수식이 아닌 **표준 LaTeX 문법**(`\\frac`, `\\sqrt` 등)을 엄격히 따르세요.
3. 응답은 JSON 배열 형식으로만 하세요."""

        try:
            resp = await self.model.generate_content_async(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.7
                )
            )
            return self._extract_json_objects(self._sanitize_json(resp.text))
        except:
            return []

    def _parse_list(self, text):
        try:
            # 텍스트에서 [ ] 부분을 찾아 리스트로 변환
            match = re.search(r'\[\s*(.*?)\s*\]', text, re.DOTALL)
            if match:
                # 안전한 평가 또는 json.loads 시도
                content = match.group(1)
                # 각 요소를 따옴표로 감싼 형태인지 확인하고 로드
                # (가장 간단하게 json.loads 시도)
                return json.loads(f"[{content}]")
        except:
            # 정규식으로 직접 추출 시도
            return re.findall(r'"([^"]+)"', text)
        return []

    def _sanitize_json(self, text):
        # 1. 만약 ```json 블록이 있다면, 쓰레기 생각(thought) 부분을 다 날리고 블록 안쪽만 가져온다.
        import re
        match = re.search(r'```(?:json)?\s*(.*?)\s*```', text, re.DOTALL | re.IGNORECASE)
        if match:
            text = match.group(1)
        else:
            # Remove markdown code block markers if present
            text = re.sub(r'```json\s*', '', text)
            text = re.sub(r'```\s*', '', text)
            
            # We won't tightly bounded by first/last brackets because the last bracket might be garbage
            first_brace = text.find('{')
            first_bracket = text.find('[')
            firsts = [i for i in (first_brace, first_bracket) if i != -1]
            first = min(firsts) if firsts else -1
            
            last_brace = text.rfind('}')
            last_bracket = text.rfind(']')
            lasts = [i for i in (last_brace, last_bracket) if i != -1]
            last = max(lasts) if lasts else -1
            if first != -1 and last != -1 and last > first:
                text = text[first:last+1]
            
        # [CRITICAL FIX] Escape literal newlines within JSON string values
        # Gemini 3 Preview occasionally outputs raw \n inside strings without escaping them as \\n
        def escape_newlines(match):
            return match.group(0).replace('\n', '\\n').replace('\r', '')

        # Find string values enclosed in quotes and escape literal newlines within them
        text = re.sub(r'"([^"\\]*(?:\\.[^"\\]*)*)"', escape_newlines, text)
        
        # [CRITICAL FIX 2] Remove invalid JSON escapes that Gemini generates for LaTeX sets like \{ and \}
        text = text.replace(r'\{', r'\\lbrace ').replace(r'\}', r'\\rbrace ').replace(r'\[', '[').replace(r'\]', ']')
        
        # [CRITICAL FIX 3] JSON 파서가 이스케이프 기호를 제어 문자로 삼키는 증상 방지
        # AI가 LaTeX 명령어(\frac, \beta 등)의 백슬래시를 강제 이스케이프하여 기호 누락(폼피드 등)을 방지함.
        latex_cmds = [
            'rightarrow', 'Rightarrow', 'leftarrow', 'Leftarrow', 
            'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
            'Alpha', 'Beta', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
            'times', 'div', 'frac', 'neq', 'le', 'ge', 'leq', 'geq', 'infty', 'sqrt', 'log', 'ln', 'lim', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
            'int', 'oint', 'sum', 'prod', 'cdot', 'ldots', 'cdots', 'quad', 'qquad',
            'bar', 'hat', 'vec', 'tilde', 'overline', 'underline', 'begin', 'end', 'pmatrix', 'bmatrix', 'vmatrix', 'matrix', 'cases',
            'mathbf', 'mathrm', 'mathbb', 'mathcal', 'mathit', 'text', 'left', 'right', 'lbrace', 'rbrace', 'langle', 'rangle', 'equiv', 'approx', 'propto', 'pm', 'mp', 'subset', 'supset', 'subseteq', 'supseteq', 'in', 'notin', 'cap', 'cup',
            'to', 'dots', 'cdots', 'ldots'
        ]
        text = text.replace(r'\\\\', '@@FOUR@@')
        text = text.replace(r'\\', '@@TWO@@')
        text = text.replace('\\', '@@ONE@@')
        for cmd in latex_cmds:
            text = text.replace('@@FOUR@@' + cmd, r'\\' + cmd)
            text = text.replace('@@TWO@@' + cmd, r'\\' + cmd)
            text = text.replace('@@ONE@@' + cmd, r'\\' + cmd)
        text = text.replace('@@FOUR@@', r'\\\\')
        text = text.replace('@@TWO@@', r'\\\\')
        text = text.replace('@@ONE@@', r'\\')
        return text

    def _extract_json_objects(self, text):
        import json_repair
        try:
            # 1차 시도: json_repair AST 파서 가동 (문법적 오류/절단 자동 수리)
            parsed = json_repair.loads(text)
            
            # 깊게 중첩된 배열 껍질 벗기기 (예: [ [ { ... } ] ] -> [ { ... } ])
            while isinstance(parsed, list) and len(parsed) == 1 and isinstance(parsed[0], list):
                parsed = parsed[0]
                
            if isinstance(parsed, list):
                valid = [p for p in parsed if isinstance(p, dict)]
                if valid: return valid
            elif isinstance(parsed, dict):
                return [parsed]
        except Exception as e:
            pass
            
        import re
        # 최후의 보루: json-repair마저 실패한 극단적 절단 텍스트에서 explanation 강제 추출
        exp_match = re.search(r'"explanation"\s*:\s*"(.*?)"\s*(?:\}|,)', text, re.DOTALL)
        if not exp_match:
            exp_match = re.search(r'"explanation_raw"\s*:\s*"(.*?)"\s*(?:\}|,)', text, re.DOTALL)
        if not exp_match:
            exp_match = re.search(r'"explanation_continued"\s*:\s*"(.*?)"\s*(?:\}|,)', text, re.DOTALL)
        if not exp_match:
            exp_match = re.search(r'"explanation_raw_continued"\s*:\s*"(.*?)"\s*(?:\}|,)', text, re.DOTALL)
        if not exp_match:
            exp_match = re.search(r'"explanation"\s*:\s*"(.*)', text, re.DOTALL)
        if not exp_match:
            exp_match = re.search(r'"explanation_raw"\s*:\s*"(.*)', text, re.DOTALL)
        if not exp_match:
            exp_match = re.search(r'"explanation_continued"\s*:\s*"(.*)', text, re.DOTALL)
        if not exp_match:
            exp_match = re.search(r'"explanation_raw_continued"\s*:\s*"(.*)', text, re.DOTALL)
            
        if exp_match:
            forced_exp = exp_match.group(1).replace('\\n', '\n').replace('\\"', '"')
            forced_exp = re.sub(r'"\s*\}\s*\]?\s*$', '', forced_exp)
            
            q_match = re.search(r'"question"\s*:\s*"(.*?)"\s*(?:,|})', text, re.DOTALL)
            forced_q = q_match.group(1).replace('\\n', '\n').replace('\\"', '"') if q_match else ""
            
            # 여기서 explanation_continued든 explanation_raw든 모두 통합 키(explanation/explanation_raw/explanation_raw_continued)로 담아 반환해야 
            # 호출부의 cont_ext[0].get("...") 에서 값을 찾을 수 있습니다.
            return [{"question": forced_q, "thought_process": "", "explanation": forced_exp, "explanation_raw": forced_exp, "explanation_continued": forced_exp, "explanation_raw_continued": forced_exp}]
            
        return []

    def _natural_sort_key(self, problem):
        q_num = str(problem.get('question_num', ''))
        digits = re.findall(r'\d+', q_num)
        try:
            num_val = int(digits[0][:10]) if digits else 999
        except Exception:
            num_val = 999
        return num_val
