import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import sys
import os
import threading
import asyncio
from gemini_client import GeminiMathParser
from hml_generator import HMLGenerator
import tempfile
import shutil

class MathPDFToHMLApp:
    def __init__(self, root):
        self.root = root
        self.root.title("수학 PDF to HML 변환기 v1.0")
        self.root.geometry("500x400")
        
        # PyInstaller bundled __file__ is ephemeral _MEIPASS, use sys.executable
        if getattr(sys, 'frozen', False):
            base_path = os.path.dirname(sys.executable)
        else:
            base_path = os.path.dirname(os.path.abspath(__file__))
            
        self.api_key_path = os.path.join(base_path, "api_key.txt")
        self.model_path = os.path.join(base_path, "model.txt")
        default_key = ""
        default_model = "gemini-3-flash-preview"
        
        if os.path.exists(self.api_key_path):
            try:
                with open(self.api_key_path, "r", encoding="utf-8") as f:
                    default_key = f.read().strip()
            except: pass
            
        if os.path.exists(self.model_path):
            try:
                with open(self.model_path, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content: default_model = content
            except: pass
            
        self.api_key = tk.StringVar(value=default_key)
        self.selected_model = tk.StringVar(value=default_model)
        self.pdf_paths = []
        self.status_msg = tk.StringVar(value="준비됨")
        
        self._setup_ui()
        
    def _setup_ui(self):
        main_frame = tk.Frame(self.root, padx=20, pady=20)
        main_frame.pack(fill="both", expand=True)
        
        # API Key Input
        tk.Label(main_frame, text="Gemini API 키 (최초 1회 입력 시 자동 저장):").pack(anchor="w")
        api_frame = tk.Frame(main_frame)
        api_frame.pack(fill="x", pady=(0, 10))
        tk.Entry(api_frame, textvariable=self.api_key, width=50, show="*").pack(side="left")
        
        # Model Selection
        tk.Label(main_frame, text="Gemini 모델 (버전) 선택:").pack(anchor="w")
        model_frame = tk.Frame(main_frame)
        model_frame.pack(fill="x", pady=(0, 15))
        
        self.models = ["gemini-3-flash-preview", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite"]
        self.model_combo = ttk.Combobox(model_frame, textvariable=self.selected_model, values=self.models, width=47, state="readonly")
        self.model_combo.pack(side="left")
        
        # PDF Selection
        tk.Label(main_frame, text="PDF 파일 선택 (여러 개 선택 가능):").pack(anchor="w")
        
        file_frame = tk.Frame(main_frame)
        file_frame.pack(fill="x", pady=(0, 20))
        
        self.pdf_listbox = tk.Listbox(file_frame, height=3, width=40)
        self.pdf_listbox.pack(side="left", fill="x", expand=True)
        
        btn_frame = tk.Frame(file_frame)
        btn_frame.pack(side="left", padx=5)
        
        tk.Button(btn_frame, text="파일 추가", command=self._add_pdfs).pack(fill="x", pady=2)
        tk.Button(btn_frame, text="목록 비우기", command=self._clear_pdfs).pack(fill="x", pady=2)
        
        # Log Box
        tk.Label(main_frame, text="진행 로그:").pack(anchor="w")
        self.log_box = tk.Text(main_frame, height=8, width=50, state="disabled")
        self.log_box.pack(pady=(0, 20))
        
        # Action Button
        self.convert_btn = tk.Button(main_frame, text="HML 변환 시작", 
                                    command=self._start_conversion, 
                                    bg="#2563eb", fg="white", font=("bold"))
        self.convert_btn.pack(fill="x")
        
    def _add_pdfs(self):
        filenames = filedialog.askopenfilenames(filetypes=[("PDF files", "*.pdf")])
        if filenames:
            for f in filenames:
                if f not in self.pdf_paths:
                    self.pdf_paths.append(f)
                    self.pdf_listbox.insert(tk.END, os.path.basename(f))
                    
    def _clear_pdfs(self):
        self.pdf_paths.clear()
        self.pdf_listbox.delete(0, tk.END)
            
    def _log(self, msg):
        self.log_box.config(state="normal")
        self.log_box.insert(tk.END, f"{msg}\n")
        self.log_box.see(tk.END)
        self.log_box.config(state="disabled")
        self.root.update()

    def _start_conversion(self):
        api_key_val = self.api_key.get().strip()
        model_val = self.selected_model.get().strip()
        
        if not api_key_val:
            messagebox.showerror("Error", "Gemini API 키를 입력하세요.")
            return
            
        try:
            with open(self.api_key_path, "w", encoding="utf-8") as f:
                f.write(api_key_val)
            with open(self.model_path, "w", encoding="utf-8") as f:
                f.write(model_val)
        except: pass

        if not self.pdf_paths:
            messagebox.showerror("Error", "PDF 파일을 한 개 이상 선택하세요.")
            return
            
        self.convert_btn.config(state="disabled")
        threading.Thread(target=self._run_process, daemon=True).start()

    def _run_process(self):
        try:
            total_files = len(self.pdf_paths)
            self._log(f"🚀 총 {total_files}개의 PDF 변환 프로세스 시작...")
            
            # 한 번에 하나씩 순차적으로 처리
            for idx, current_pdf in enumerate(self.pdf_paths, 1):
                self._log(f"\n[{idx}/{total_files}] 파일 처리 중: {os.path.basename(current_pdf)}")
                
                # 1. Gemini 분석
                self._log(f"1/3 Gemini API 분석 중 [{self.selected_model.get()}] ...")
                parser = GeminiMathParser(self.api_key.get().strip(), self.selected_model.get().strip())
                
                # 비동기 함수 호출을 위해 asyncio.run 사용
                problems = asyncio.run(parser.extract_math_problems(current_pdf, log_callback=self._log))
                
                if not problems:
                    self._log(f"❌ {os.path.basename(current_pdf)}: 문제를 추출하지 못했습니다. 건너뜁니다.")
                    continue
                    
                self._log(f"✅ {len(problems)}개의 문제를 찾았습니다.")
                
                # 2. HML 생성
                self._log("2/3 HML 파일 생성 중...")
                generator = HMLGenerator()
                for i, prob in enumerate(problems, 1):
                    generator.add_problem(prob, i)
                
                # 3. 자동 저장 (PDF와 동일한 위치, 동일한 이름)
                base_dir = os.path.dirname(current_pdf)
                base_name = os.path.splitext(os.path.basename(current_pdf))[0]
                output_path = os.path.join(base_dir, f"{base_name}.hml")
                
                generator.save(output_path)
                self._log(f"🎉 성공! 파일이 자동 저장되었습니다: {output_path}")
            
            self._log(f"\n✨ 모든 변환 작업이 완료되었습니다! ✨")
            messagebox.showinfo("완료", "모든 HML 변환이 성공적으로 완료되었습니다.")
                
        except Exception as e:
            self._log(f"❌ 오류 발생: {str(e)}")
            messagebox.showerror("오류", f"프로세스 중 오류가 발생했습니다: {e}")
        finally:
            self.convert_btn.config(state="normal")

if __name__ == "__main__":
    root = tk.Tk()
    app = MathPDFToHMLApp(root)
    root.mainloop()
