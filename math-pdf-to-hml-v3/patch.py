import codecs

def patch():
    with codecs.open('gemini_client.py', 'r', 'utf-8') as f:
        lines = f.readlines()

    start_idx = -1
    end_idx = -1

    for i, line in enumerate(lines):
        if "chat_session = self.model.start_chat(history=[])" in line:
            start_idx = i
        if "temp_pdf_path" in line and "os.remove" in line:
            # The cleanup block at the end where we should break the loop
            end_idx = i - 6 # roughly back up before the final fallback `try` block or just before file cleanup
            
    # Let's find exactly the line: '# 4.' or 'os.remove(temp_pdf_path)'
    for i, line in enumerate(lines):
        if "os.remove(temp_pdf_path)" in line:
            end_idx = i - 5 # Backup to '# 4. 마무리'
            break

    if start_idx == -1 or end_idx == -1:
        print("Could not find start or end index.")
        return

    new_lines = []
    for i in range(start_idx):
        new_lines.append(lines[i])

    new_lines.append("                for page_retry_idx in range(3):\n")

    for i in range(start_idx, end_idx):
        line = lines[i]
        
        # Inject validation loop condition
        if "validation_retries = 0" in line:
            new_lines.append("                    if expected_count == -1:\n")
            new_lines.append("                        print(f\"[{page_num + 1}페이지] ⚠️ 필수 Preamble([탐색된 문제 번호:]) 누락 감지. 페이지 전체 재추출 시도... ({page_retry_idx + 1}/3)\")\n")
            new_lines.append("                        if page_retry_idx < 2:\n")
            new_lines.append("                            continue\n")
            new_lines.append("                        else:\n")
            new_lines.append("                            print(f\"[{page_num + 1}페이지] 3회 연속 Preamble 누락. 존재하는 데이터만이라도 강제 병합합니다.\")\n")
            new_lines.append("\n")

        if line.strip() == "":
            new_lines.append("\n")
        else:
            new_lines.append("    " + line)
            
        # Add break on success
        if "all_problems.extend(unique_objs)" in line or ("all_problems.extend(problems)" in line and "Fallback" in lines[i-3]): # actually we just break after the whole if/else block
            pass # wait, better to break at the end of the page_retry loop
            
    # Insert break after the whole parsing block to exit page_retry_idx loop upon success
    # The block ends right before "4. 루프 마무리"
    new_lines.append("                    break # 성공적으로 완료되었으므로 재시도 루프 탈출\n")

    for i in range(end_idx, len(lines)):
        new_lines.append(lines[i])

    with codecs.open('gemini_client_patched.py', 'w', 'utf-8') as f:
        f.writelines(new_lines)

    print("Successfully patched gemini_client.py")

patch()
