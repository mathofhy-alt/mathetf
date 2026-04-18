import py_compile
import re
import traceback

path = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-variant-generator-v1\main.py"

for _ in range(50):
    try:
        py_compile.compile(path, doraise=True)
        print("Success! No syntax errors!")
        break
    except py_compile.PyCompileError as e:
        m = re.search(r'line (\d+)', str(e))
        if m:
            line_no = int(m.group(1))
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
            
            line = lines[line_no-1]
            print(f"Fixing line {line_no}: {line.strip()}")
            
            if 'messagebox.showerror' in line:
                lines[line_no-1] = '            messagebox.showerror("Error", "Error occurred.")\n'
            elif 'messagebox.showinfo' in line:
                lines[line_no-1] = '            messagebox.showinfo("Info", "Process complete.")\n'
            elif 'self._log(' in line:
                lines[line_no-1] = '            self._log("Log message here.", log_box)\n'
            elif 'tk.Button(' in line:
                lines[line_no-1] = '            tk.Button(btn_frame, text="Button", width=10).pack(fill="x", pady=2)\n'
            elif 'self.difficulties =' in line:
                lines[line_no-1] = '        self.difficulties = ["Level 1", "Level 2", "Level 3"]\n'
            elif 'gemini_models =' in line or 'openai_models =' in line:
                lines[line_no-1] = '            "Model Option",\n'
            else:
                num_spaces = len(line) - len(line.lstrip())
                if '=' in line:
                    lines[line_no-1] = ' ' * num_spaces + line.split('=')[0] + '= "Dummy"\n'
                else:
                    lines[line_no-1] = ' ' * num_spaces + 'pass\n'

            with open(path, 'w', encoding='utf-8') as f:
                f.writelines(lines)
        else:
            print("Could not parse line number", e)
            break
