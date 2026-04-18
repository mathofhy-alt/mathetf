with open('gemini_client.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Use a simpler string substitution
old_block = (
    '                            if len(y_nonzero) > 0:\n'
    '                                trim_y1 = max(0, y_nonzero[0] - 10)\n'
    '                                trim_y2 = min(gray.shape[0], y_nonzero[-1] + 10)\n'
    '                                \n'
    '                                # Y구역 내에서 X축 계산\n'
    '                                valid_thresh = thresh[trim_y1:trim_y2, :]\n'
    '                                col_sums = np.sum(valid_thresh, axis=0)\n'
    '                                x_nonzero = np.where(col_sums > 0)[0]\n'
    '                                \n'
    '                                if len(x_nonzero) > 0:\n'
    '                                    trim_x1 = max(0, x_nonzero[0] - 10)\n'
    '                                    trim_x2 = min(gray.shape[1], x_nonzero[-1] + 10)\n'
    '                                else:\n'
    '                                    trim_x1, trim_x2 = 0, gray.shape[1]\n'
    '                                    \n'
    '                                cropped_img = cropped_img.crop((trim_x1, trim_y1, trim_x2, trim_y2))'
)

new_block = (
    '                            if len(y_nonzero) > 0:\n'
    '                                raw_trim_y1 = max(0, y_nonzero[0] - 10)\n'
    '                                trim_y2 = min(gray.shape[0], y_nonzero[-1] + 10)\n'
    '                                \n'
    '                                # [V12.5.17 FIX] 크롭 상단 10% 내 수평 구분선(♦——♦) 감지 시 skip\n'
    '                                top_guard = int(gray.shape[0] * 0.10)\n'
    '                                skip_until = raw_trim_y1\n'
    '                                if raw_trim_y1 < top_guard:\n'
    '                                    for ry in range(raw_trim_y1, min(top_guard + 1, len(row_sums))):\n'
    '                                        if row_sums[ry] > gray.shape[1] * 255 * 0.5:\n'
    '                                            skip_until = ry + 1\n'
    '                                if skip_until > raw_trim_y1:\n'
    '                                    remaining = np.where(row_sums[skip_until:] > 0)[0]\n'
    '                                    trim_y1 = max(0, skip_until + remaining[0] - 10) if len(remaining) > 0 else raw_trim_y1\n'
    '                                else:\n'
    '                                    trim_y1 = raw_trim_y1\n'
    '                                \n'
    '                                # Y구역 내에서 X축 계산\n'
    '                                valid_thresh = thresh[trim_y1:trim_y2, :]\n'
    '                                col_sums = np.sum(valid_thresh, axis=0)\n'
    '                                x_nonzero = np.where(col_sums > 0)[0]\n'
    '                                \n'
    '                                if len(x_nonzero) > 0:\n'
    '                                    trim_x1 = max(0, x_nonzero[0] - 10)\n'
    '                                    trim_x2 = min(gray.shape[1], x_nonzero[-1] + 10)\n'
    '                                else:\n'
    '                                    trim_x1, trim_x2 = 0, gray.shape[1]\n'
    '                                    \n'
    '                                cropped_img = cropped_img.crop((trim_x1, trim_y1, trim_x2, trim_y2))'
)

# Normalize line endings to \n for search
content_norm = content.replace('\r\n', '\n')

if old_block in content_norm:
    content_new = content_norm.replace(old_block, new_block, 1)
    # Restore \r\n line endings
    content_new = content_new.replace('\n', '\r\n')
    with open('gemini_client.py', 'w', encoding='utf-8', newline='') as f:
        f.write(content_new)
    print("OK - replaced successfully")
else:
    # Try to find actual indentation
    idx = content_norm.find('trim_y1 = max(0, y_nonzero[0] - 10)')
    if idx > 0:
        # Show 20 chars before to see indentation
        start = content_norm.rfind('\n', 0, idx) + 1
        print(f"Block starts at line char {start}")
        print(repr(content_norm[start:idx+50]))
    else:
        print("marker not found at all")
