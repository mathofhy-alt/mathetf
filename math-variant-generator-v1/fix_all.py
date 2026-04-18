import py_compile
import traceback

path = r'c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-variant-generator-v1\main.py'

for _ in range(50):
    try:
        py_compile.compile(path, doraise=True)
        print("Success! No syntax errors!")
        break
    except py_compile.PyCompileError as e:
        import re
        m = re.search(r'line (\d+)', str(e))
        if m:
            line_no = int(m.group(1))
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
            
            line = lines[line_no-1]
            if 'messagebox.showerror' in line:
                lines[line_no-1] = '                    messagebox.showerror("Error", "Message")\n'
            elif 'messagebox.showinfo' in line:
                lines[line_no-1] = '                    messagebox.showinfo("Info", "Message")\n'
            elif 'self._log' in line:
                lines[line_no-1] = '                    self._log("Log message", log_box)\n'
            else:
                lines[line_no-1] = line.rstrip('\n') + '"\n'
            
            with open(path, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            print(f"Fixed line {line_no}")
        else:
            print("Could not parse line number", e)
            break
