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
from openai_client import OpenAIMathParser

class MathPDFToHMLApp:
    def __init__(self, root):
        self.root = root
        self.root.title("수학 PDF to HML 변환기 v1.0")
        self.root.geometry("550x550")
        
        # PyInstaller bundled __file__ is ephemeral _MEIPASS, use sys.executable
        if getattr(sys, 'frozen', False):
            base_path = os.path.dirname(sys.executable)
        else:
            base_path = os.path.dirname(os.path.abspath(__file__))
            
        self.gemini_key_path = os.path.join(base_path, "gemini_api_key.txt")
        self.openai_key_path = os.path.join(base_path, "openai_api_key.txt")
        self.provider_path = os.path.join(base_path, "provider.txt")
        self.model_path = os.path.join(base_path, "model.txt")
        self.curriculum_path = os.path.join(base_path, "curriculum.txt")
        
        # Migrate old api_key.txt to gemini_api_key.txt if needed
        old_api_key_path = os.path.join(base_path, "api_key.txt")
        if os.path.exists(old_api_key_path) and not os.path.exists(self.gemini_key_path):
            try:
                os.rename(old_api_key_path, self.gemini_key_path)
            except: pass

        self.gemini_key = ""
        self.openai_key = ""
        default_provider = "Gemini"
        default_model = "gemini-3-flash-preview"
        default_curriculum = "고1 수준 (공통수학)"
        
        if os.path.exists(self.gemini_key_path):
            try:
                with open(self.gemini_key_path, "r", encoding="utf-8") as f:
                    self.gemini_key = f.read().strip()
            except: pass

        if os.path.exists(self.openai_key_path):
            try:
                with open(self.openai_key_path, "r", encoding="utf-8") as f:
                    self.openai_key = f.read().strip()
            except: pass
            
        if os.path.exists(self.provider_path):
            try:
                with open(self.provider_path, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content in ["Gemini", "OpenAI"]: default_provider = content
            except: pass

        if os.path.exists(self.model_path):
            try:
                with open(self.model_path, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content: default_model = content
            except: pass
            
        if os.path.exists(self.curriculum_path):
            try:
                with open(self.curriculum_path, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content: default_curriculum = content
            except: pass
            
        self.selected_provider = tk.StringVar(value=default_provider)
        self.api_key = tk.StringVar(value=self.gemini_key if default_provider == "Gemini" else self.openai_key)
        self.selected_model = tk.StringVar(value=default_model)
        self.selected_curriculum = tk.StringVar(value=default_curriculum)
        
        self.gemini_models = [
            "gemini-3-flash-preview", 
            "gemini-3.1-pro-preview"
        ]
        self.openai_models = [
            "o3",
            "gpt5.2",
            "o4mini"
        ]
        
        self.pdf_paths = []
        self.status_msg = tk.StringVar(value="준비됨")
        
        self._setup_ui()
        self._on_provider_change() # Initialize UI state
        
    def _on_provider_change(self, *args):
        # Save current API key to vars before switching
        current_provider = self.selected_provider.get()
        if current_provider == "Gemini":
            self.api_key_label.config(text="Gemini API 키 (자동 저장):")
            self.model_combo.config(values=self.gemini_models)
            if self.selected_model.get() not in self.gemini_models:
                self.selected_model.set(self.gemini_models[0])
            self.api_key.set(self.gemini_key)
        else:
            self.api_key_label.config(text="OpenAI API 키 (자동 저장):")
            self.model_combo.config(values=self.openai_models)
            if self.selected_model.get() not in self.openai_models:
                self.selected_model.set(self.openai_models[0])
            self.api_key.set(self.openai_key)
            
    def _save_current_api_key(self):
        # Update the active key variable on typing/save
        if self.selected_provider.get() == "Gemini":
            self.gemini_key = self.api_key.get().strip()
        else:
            self.openai_key = self.api_key.get().strip()
        
    def _setup_ui(self):
        main_frame = tk.Frame(self.root, padx=20, pady=20)
        main_frame.pack(fill="both", expand=True)
        
        # Provider Selection
        tk.Label(main_frame, text="AI 모델 제공자 선택:").pack(anchor="w")
        provider_frame = tk.Frame(main_frame)
        provider_frame.pack(fill="x", pady=(0, 10))
        
        tk.Radiobutton(provider_frame, text="Gemini", variable=self.selected_provider, value="Gemini", command=self._on_provider_change).pack(side="left")
        tk.Radiobutton(provider_frame, text="OpenAI", variable=self.selected_provider, value="OpenAI", command=self._on_provider_change).pack(side="left", padx=10)

        # API Key Input
        self.api_key_label = tk.Label(main_frame, text="API 키 (최초 1회 입력 시 자동 저장):")
        self.api_key_label.pack(anchor="w")
        api_frame = tk.Frame(main_frame)
        api_frame.pack(fill="x", pady=(0, 10))
        
        api_entry = tk.Entry(api_frame, textvariable=self.api_key, width=50, show="*")
        api_entry.pack(side="left")
        api_entry.bind("<KeyRelease>", lambda e: self._save_current_api_key())
        
        # Model Selection
        tk.Label(main_frame, text="AI 모델 (버전) 선택:").pack(anchor="w")
        model_frame = tk.Frame(main_frame)
        model_frame.pack(fill="x", pady=(0, 15))
        
        self.model_combo = ttk.Combobox(model_frame, textvariable=self.selected_model, width=47, state="readonly")
        self.model_combo.pack(side="left")
        
        # Curriculum Selection
        tk.Label(main_frame, text="해설 난이도 (학년) 선택:").pack(anchor="w")
        curr_frame = tk.Frame(main_frame)
        curr_frame.pack(fill="x", pady=(0, 15))
        
        self.curriculums = [
            "고1 수준 (공통수학)", 
            "고2/고3 수준 (수1, 수2, 선택과목)"
        ]
        self.curr_combo = ttk.Combobox(curr_frame, textvariable=self.selected_curriculum, values=self.curriculums, width=47, state="readonly")
        self.curr_combo.pack(side="left")
        
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
        self._save_current_api_key()
        api_key_val = self.api_key.get().strip()
        model_val = self.selected_model.get().strip()
        provider_val = self.selected_provider.get().strip()
        
        if not api_key_val:
            messagebox.showerror("Error", f"{provider_val} API 키를 입력하세요.")
            return
            
        try:
            if provider_val == "Gemini":
                with open(self.gemini_key_path, "w", encoding="utf-8") as f:
                    f.write(api_key_val)
            else:
                with open(self.openai_key_path, "w", encoding="utf-8") as f:
                    f.write(api_key_val)
                    
            with open(self.provider_path, "w", encoding="utf-8") as f:
                f.write(provider_val)
            with open(self.model_path, "w", encoding="utf-8") as f:
                f.write(model_val)
            with open(self.curriculum_path, "w", encoding="utf-8") as f:
                f.write(self.selected_curriculum.get().strip())
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
                
                # 1. AI 분석
                provider_val = self.selected_provider.get()
                self._log(f"1/3 {provider_val} API 분석 중 [{self.selected_model.get()}] ...")
                
                if provider_val == "Gemini":
                    parser = GeminiMathParser(self.api_key.get().strip(), self.selected_model.get().strip(), self.selected_curriculum.get().strip())
                else:
                    parser = OpenAIMathParser(self.api_key.get().strip(), self.selected_model.get().strip(), self.selected_curriculum.get().strip())
                
                # 비동기 함수 호출을 위해 asyncio.run 사용
                problems = asyncio.run(parser.extract_math_problems(current_pdf, log_callback=self._log))
                
                if not problems:
                    self._log(f"❌ {os.path.basename(current_pdf)}: 문제를 추출하지 못했습니다. 건너뜁니다.")
                    continue
                    
                self._log(f"✅ {len(problems)}개의 문제를 찾았습니다.")
                
                with open('debug_gui_problems.json', 'w', encoding='utf-8') as f:
                    import json
                    json.dump(problems, f, ensure_ascii=False, indent=2)
                
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
