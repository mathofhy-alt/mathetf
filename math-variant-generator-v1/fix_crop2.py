with open('gemini_client.py', 'r', encoding='utf-8') as f:
    content = f.read()

content_norm = content.replace('\r\n', '\n')

# ================================================================
# FIX 1: Move seen_q to global scope to prevent page-number
#         false positives (e.g., page 2's number "2" being
#         mistaken for problem 2).
# ================================================================
old1 = (
    '        # V10.1 스로틀링 고도화 (Jitter 탑재로 인한 안정성 확보) -> 모델 티어별 비동기 큐 분리\n'
    '        is_flash = "flash" in getattr(self, \'pro_model\', self.model).model_name.lower()\n'
    '        pass1_sem = asyncio.Semaphore(15)\n'
    '        pass2_sem = asyncio.Semaphore(5 if is_flash else 3)\n'
    '        pass3_sem = asyncio.Semaphore(15)\n'
)
new1 = (
    '        # V10.1 스로틀링 고도화 (Jitter 탑재로 인한 안정성 확보) -> 모델 티어별 비동기 큐 분리\n'
    '        is_flash = "flash" in getattr(self, \'pro_model\', self.model).model_name.lower()\n'
    '        pass1_sem = asyncio.Semaphore(15)\n'
    '        pass2_sem = asyncio.Semaphore(5 if is_flash else 3)\n'
    '        pass3_sem = asyncio.Semaphore(15)\n'
    '        \n'
    '        # [V12.5.17 FIX] 전역 seen_q: 페이지 번호(2, 4, 6...)가 문제번호로 오인식되는 현상 차단\n'
    '        # 동일 번호가 다른 페이지에서 다시 나오면(= 페이지 번호) 무조건 무시한다\n'
    '        global_seen_q = set()\n'
    '        global_seen_q_lock = asyncio.Lock()\n'
)

# FIX 2: Replace per-page seen_q with global check
old2 = (
    '                problem_list = []\n'
    '                seen_q = set()\n'
    '                \n'
    '                for b in blocks:\n'
    '                    if len(b) >= 5 and b[6] == 0:\n'
    '                        x0, y0, x1, y1, text = b[:5]\n'
    '                        \n'
    '                        # 꼬리말/페이지 번호 구역(하단 10%)은 문항 번호 탐색에서 무조건 제외\n'
    '                        if y0 > page_h * 0.9: continue\n'
    '                        \n'
    '                        text = text.strip()\n'
    '                        if not text: continue\n'
    '                        \n'
    '                        # 문항 번호는 반드시 X축의 좌측단에 위치 (여백 감안, 범위 밖 숫자는 페이지 번호나 오답 선지로 간주)\n'
    '                        is_valid_x = (x0 < page_w * 0.20) or (page_w * 0.45 < x0 < page_w * 0.65)\n'
    '                        if not is_valid_x: continue\n'
    '                        \n'
    '                        match = q_pattern.match(text)\n'
    '                        if match:\n'
    '                            raw_q = match.group(1).replace(" ", "")\n'
    '                            try:\n'
    '                                int_q = int(raw_q)\n'
    '                                if int_q == 0 or int_q > 150: continue\n'
    '                            except:\n'
    '                                continue\n'
    '                                \n'
    '                            if raw_q not in seen_q:\n'
    '                                seen_q.add(raw_q)\n'
    '                                col_str = "left" if x0 < page_w / 2.0 else "right"\n'
    '                                \n'
    '                                # 패딩된 폴 백 이미지 좌표계 비율로 스케일 변환 (Ratio: 0.0 ~ 1.0)\n'
    '                                sy_ratio = (y0 * 5.0) / padded_h\n'
    '                                \n'
    '                                problem_list.append({\n'
    '                                    \'q_num\': raw_q,\n'
    '                                    \'start_y\': sy_ratio,\n'
    '                                    \'column\': col_str\n'
    '                                })\n'
)
new2 = (
    '                problem_list = []\n'
    '                page_seen_q = set()  # 이 페이지 내 중복 방지용\n'
    '                \n'
    '                for b in blocks:\n'
    '                    if len(b) >= 5 and b[6] == 0:\n'
    '                        x0, y0, x1, y1, text = b[:5]\n'
    '                        \n'
    '                        # 꼬리말/페이지 번호 구역(하단 10%)은 문항 번호 탐색에서 무조건 제외\n'
    '                        if y0 > page_h * 0.9: continue\n'
    '                        \n'
    '                        # [V12.5.17] 페이지 상단 헤더 구역(상단 6%)도 제외 - 페이지 번호 오인식 차단\n'
    '                        if y0 < page_h * 0.06: continue\n'
    '                        \n'
    '                        text = text.strip()\n'
    '                        if not text: continue\n'
    '                        \n'
    '                        # 문항 번호는 반드시 X축의 좌측단에 위치 (여백 감안, 범위 밖 숫자는 페이지 번호나 오답 선지로 간주)\n'
    '                        is_valid_x = (x0 < page_w * 0.20) or (page_w * 0.45 < x0 < page_w * 0.65)\n'
    '                        if not is_valid_x: continue\n'
    '                        \n'
    '                        match = q_pattern.match(text)\n'
    '                        if match:\n'
    '                            raw_q = match.group(1).replace(" ", "")\n'
    '                            try:\n'
    '                                int_q = int(raw_q)\n'
    '                                if int_q == 0 or int_q > 150: continue\n'
    '                            except:\n'
    '                                continue\n'
    '                            \n'
    '                            # [V12.5.17 FIX] 전역 중복 체크: 이미 다른 페이지에서 추출된 번호는 페이지 번호로 간주\n'
    '                            if raw_q in global_seen_q: continue\n'
    '                                \n'
    '                            if raw_q not in page_seen_q:\n'
    '                                page_seen_q.add(raw_q)\n'
    '                                col_str = "left" if x0 < page_w / 2.0 else "right"\n'
    '                                \n'
    '                                # 패딩된 폴 백 이미지 좌표계 비율로 스케일 변환 (Ratio: 0.0 ~ 1.0)\n'
    '                                sy_ratio = (y0 * 5.0) / padded_h\n'
    '                                \n'
    '                                problem_list.append({\n'
    '                                    \'q_num\': raw_q,\n'
    '                                    \'start_y\': sy_ratio,\n'
    '                                    \'column\': col_str\n'
    '                                })\n'
)

# FIX 3: Register found q_nums into global_seen_q after detection
old3 = (
    '                problem_numbers = [str(x.get(\'q_num\', \'\')).strip() for x in problem_list]\n'
    '                _log(f"  -> [{page_num + 1}페이지] {len(problem_numbers)}개 문항 정밀 물리 좌표 탐지: {problem_numbers}")\n'
)
new3 = (
    '                problem_numbers = [str(x.get(\'q_num\', \'\')).strip() for x in problem_list]\n'
    '                _log(f"  -> [{page_num + 1}페이지] {len(problem_numbers)}개 문항 정밀 물리 좌표 탐지: {problem_numbers}")\n'
    '                # [V12.5.17] 확정된 문제번호를 전역 seen_q에 등록 (다음 페이지에서 중복 차단)\n'
    '                async with global_seen_q_lock:\n'
    '                    for pn in problem_numbers:\n'
    '                        global_seen_q.add(pn)\n'
)

# FIX 4: Reduce bottom padding and tighten max_ey_limit
old4 = (
    '                        # 여유를 주되, 인접 문항 경계선(Limit)까지만 정확히 허용하여 하단 수식 잘림(Clipping) 완벽 방지\n'
    '                        sy = max(0.0, max(sy - 0.015, min_sy_limit)) \n'
    '                        ey = min(1.0, min(ey + 0.020, max_ey_limit))\n'
    '                        if ey <= sy: ey = min(1.0, sy + 0.02) # 초소형 방어선\n'
)
new4 = (
    '                        # 여유를 주되, 인접 문항 경계선(Limit)까지만 정확히 허용하여 하단 수식 잘림(Clipping) 완벽 방지\n'
    '                        sy = max(0.0, max(sy - 0.010, min_sy_limit)) \n'
    '                        # [V12.5.17 FIX] 하단 패딩을 max_ey_limit 기준으로 엄격 제한\n'
    '                        # max_ey_limit = 다음 문제 start_y이므로 그보다 10px(ratio≈0.002) 앞에서 끊음\n'
    '                        ey_padded = min(ey + 0.010, max_ey_limit - 0.003)\n'
    '                        ey = min(1.0, ey_padded)\n'
    '                        if ey <= sy: ey = min(1.0, sy + 0.02) # 초소형 방어선\n'
)

changed = 0
for old, new in [(old1, new1), (old2, new2), (old3, new3), (old4, new4)]:
    if old in content_norm:
        content_norm = content_norm.replace(old, new, 1)
        changed += 1
        print(f"Fix {changed}: OK")
    else:
        print(f"Fix {changed+1}: NOT FOUND")

# Restore CRLF and save
content_out = content_norm.replace('\n', '\r\n')
with open('gemini_client.py', 'w', encoding='utf-8', newline='') as f:
    f.write(content_out)

print(f"\n총 {changed}/4 수정 완료")
