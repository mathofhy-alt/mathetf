import sys
import asyncio
import tkinter as tk
from main import MathPDFToHMLApp
import json
import traceback
import threading
import time

def run_debug():
    root = tk.Tk()
    root.withdraw() # Hide window
    app = MathPDFToHMLApp(root)
    import os
    abs_path = r'c:\Users\matho\OneDrive\바탕 화면\pdf모음\테스트.pdf'
    app.pdf_paths = [abs_path]
    app.selected_provider.set("Gemini")
    app.selected_model.set("gemini-3.1-pro-preview")
    app.api_key.set(open('gemini_api_key.txt').read().strip())
    
    # redirect log to file
    def new_log(msg):
        with open("debug_ui_log.txt", "a", encoding="utf-8") as f:
            f.write(msg + "\n")
        
    app._log = new_log
    
    print("Starting exact GUI conversion trace...")
    
    def target():
        try:
            app._run_process()
        except:
            traceback.print_exc()
            
    t = threading.Thread(target=target, daemon=True)
    def check_thread():
        if t.is_alive():
            root.after(500, check_thread)
        else:
            print("FINISHED")
            root.destroy()
            
    root.after(500, check_thread)
    t.start()
    
    root.mainloop()

if __name__ == '__main__':
    open("debug_ui_log.txt", "w", encoding="utf-8").write("")
    run_debug()
