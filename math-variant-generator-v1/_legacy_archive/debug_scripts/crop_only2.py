import fitz, re, os, sys
import numpy as np
from PIL import Image

# 인자가 있으면 그 파일만, 없으면 e1/e2/e3 전부
targets = sys.argv[1:] if len(sys.argv) > 1 else ["dist/e1.pdf", "dist/e2.pdf", "dist/e3.pdf"]

q_pattern = re.compile(r'^\s*(\d[\d\s]*)(?:[\)\.\n]|$)')

for pdf_path in targets:
    base = os.path.splitext(os.path.basename(pdf_path))[0]
    out_dir = f"dist/{base}_crops2"
    os.makedirs(out_dir, exist_ok=True)
    print(f"\n{'='*50}")
    print(f"Processing: {pdf_path}  →  {out_dir}")
    print(f"{'='*50}")

    doc = fitz.open(pdf_path)
    all_crops = []
    global_seen_q = set()  # [V12.5.17] 전역 중복 차단

    for page_num in range(len(doc)):
        page = doc[page_num]
        mat = fitz.Matrix(5, 5)
        pix = page.get_pixmap(matrix=mat)
        mode = "RGBA" if pix.alpha else "RGB"
        img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
        if mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg

        padding_height = 200
        padded_img = Image.new("RGB", (img.width, img.height + padding_height), (255, 255, 255))
        padded_img.paste(img, (0, 0))

        blocks = page.get_text("blocks")
        page_w = page.rect.width
        page_h = page.rect.height
        base_img_h = page_h * 5.0
        padded_h = base_img_h + 200.0

        problem_list = []
        page_seen_q = set()

        for b in blocks:
            if len(b) >= 5 and b[6] == 0:
                x0, y0, x1, y1, text = b[:5]
                if y0 > page_h * 0.9: continue
                # [V12.5.17] 상단 6% 헤더 구역 제외
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

        q_nums = [p['q_num'] for p in final_list]
        print(f"Page {page_num+1}: {q_nums}")

        for prob in final_list:
            q_num = prob['q_num']
            sy = float(prob['start_y'])
            ey = float(prob['end_y'])
            col = prob['column']
            print(f"  [디버그] Q{q_num} col={col} sy_ratio={sy:.4f} ey_ratio={ey:.4f}")

            min_sy_limit = 0.0
            max_ey_limit = 1.0
            for other_p in final_list:
                other_col = other_p.get('column', 'full').lower()
                if other_col == col:
                    other_sy = float(other_p.get('start_y', 1.0))
                    other_ey = float(other_p.get('end_y', 0.0))
                    if other_sy > sy + 0.01:
                        max_ey_limit = min(max_ey_limit, other_sy)
                    if other_ey < ey - 0.01:
                        min_sy_limit = max(min_sy_limit, other_ey)

            sy = max(0.0, max(sy - 0.010, min_sy_limit))
            # [V12.5.17] 하단 침범 차단
            ey = min(1.0, min(ey + 0.010, max_ey_limit - 0.003))
            if ey <= sy: ey = min(1.0, sy + 0.02)

            # 오른쪽 컬럼 헤더선 아래로 보정
            HEADER_LINE_Y = 0.07
            if col == 'right' and sy < HEADER_LINE_Y:
                sy = HEADER_LINE_Y

            sx = 0
            ex = padded_img.width
            if col == "left":
                ex = int(padded_img.width * 0.52)
            elif col == "right":
                sx = int(padded_img.width * 0.48)

            crop_box = (sx, int(sy * padded_img.height), ex, int(ey * padded_img.height))
            cropped = padded_img.crop(crop_box)

            # [V12.5.18] OpenCV trim — separator 80% 기준
            try:
                import cv2
                ocv = np.array(cropped)
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
                        for ry in range(raw_y1, min(top_guard+1, len(row_sums))):
                            # [V12.5.18] 80%+ 행만 진짜 구분선으로 처리
                            if row_sums[ry] > gray.shape[1] * 255 * 0.80:
                                skip_until = ry + 1
                    if skip_until > raw_y1:
                        rem = np.where(row_sums[skip_until:] > 0)[0]
                        trim_y1 = max(0, skip_until + rem[0] - 10) if len(rem) > 0 else raw_y1
                    else:
                        trim_y1 = raw_y1
                    valid_thresh = thresh[trim_y1:trim_y2, :]
                    col_sums = np.sum(valid_thresh, axis=0)
                    x_nz = np.where(col_sums > 0)[0]
                    if len(x_nz) > 0:
                        trim_x1 = max(0, x_nz[0] - 10)
                        trim_x2 = min(gray.shape[1], x_nz[-1] + 10)
                    else:
                        trim_x1, trim_x2 = 0, gray.shape[1]
                    cropped = cropped.crop((trim_x1, trim_y1, trim_x2, trim_y2))
            except:
                pass

            out_path = f"{out_dir}/q{q_num.zfill(2)}_p{page_num+1}.png"
            cropped.save(out_path)
            all_crops.append((int(q_num), out_path))
            print(f"  Saved: {out_path}")

    doc.close()
    all_crops.sort()
    print(f"\n총 {len(all_crops)}개 문항 크롭 완료 ({base})")
    for n, p in all_crops:
        print(f"  {n}번: {p}")
