import codecs

path = r'c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-variant-generator-v1\main.py'
with codecs.open(path, 'r', 'utf-8', errors='replace') as f:
    lines = f.readlines()

lines[489] = '                suffix = "_modified" if generate_variants else ""\n'
lines[490] = '                output_path = os.path.join(base_dir, f"{base_name}{suffix}.hml")\n'
lines[491] = '                generator.save(output_path)\n'
lines[492] = '                self._log(f"Success! Saved to: {output_path}", log_box)\n'
lines[493] = '            \n'
lines[494] = '            self._log("Process finished", log_box)\n'
lines[495] = '            messagebox.showinfo("Info", "Process complete")\n'
lines[496] = '        except Exception as e:\n'
lines[497] = '            self._log(f"Error: {str(e)}", log_box)\n'
lines[498] = '            messagebox.showerror("Error", "Process failed")\n'
lines[499] = '        finally:\n'

with codecs.open(path, 'w', 'utf-8') as f:
    f.writelines(lines)
