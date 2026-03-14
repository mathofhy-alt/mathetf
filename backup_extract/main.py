import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import os
import threading
from gemini_client import GeminiMathParser
from hml_generator import HMLGenerator
import tempfile
import shutil

class MathPDFToHMLApp:
    def __init__(self, root):
        self.root = root
        self.root.title("수학 PDF to HML 변환기 v1.0")
        self.root.geometry("500x350")
        
        self.api_key = "AIzaSyAGTur0rIYSwjURKcWnV6P05BUbWTSwE0I"
        self.pdf_path = tk.StringVar()
        self.status_msg = tk.StringVar(value="준비됨")
        
        self._setup_ui()
        
    def _setup_ui(self):
        main_frame = tk.Frame(self.root, padx=20, pady=20)
        main_frame.pack(fill="both", expand=True)
        
        # PDF Selection
        tk.Label(main_frame, text="PDF 파일 선택:").pack(anchor="w")
        file_frame = tk.Frame(main_frame)
        file_frame.pack(fill="x", pady=(0, 20))
        tk.Entry(file_frame, textvariable=self.pdf_path, width=40).pack(side="left")
        tk.Button(file_frame, text="찾아보기", command=self._browse_pdf).pack(side="left", padx=5)
        
        # Log Box
        tk.Label(main_frame, text="진행 로그:").pack(anchor="w")
        self.log_box = tk.Text(main_frame, height=8, width=50, state="disabled")
        self.log_box.pack(pady=(0, 20))
        
        # Action Button
        self.convert_btn = tk.Button(main_frame, text="HML 변환 시작", 
                                    command=self._start_conversion, 
                                    bg="#2563eb", fg="white", font=("bold"))
        self.convert_btn.pack(fill="x")
        
    def _browse_pdf(self):
        filename = filedialog.askopenfilename(filetypes=[("PDF files", "*.pdf")])
        if filename:
            self.pdf_path.set(filename)
            
    def _log(self, msg):
        self.log_box.config(state="normal")
        self.log_box.insert(tk.END, f"{msg}\n")
        self.log_box.see(tk.END)
        self.log_box.config(state="disabled")
        self.root.update()

    def _start_conversion(self):
        if not self.pdf_path.get():
            messagebox.showerror("Error", "PDF 파일을 선택하세요.")
            return
            
        self.convert_btn.config(state="disabled")
        threading.Thread(target=self._run_process, daemon=True).start()

    def _run_process(self):
        try:
            self._log("🚀 변환 프로세스 시작...")
            
            # 1. Gemini 분석
            self._log("1/3 Gemini API 분석 중 (몇 분 정도 걸릴 수 있습니다)...")
            parser = GeminiMathParser(self.api_key)
            problems = parser.extract_math_problems(self.pdf_path.get())
            
            if not problems:
                self._log("❌ 문제를 추출하지 못했습니다. PDF 내용이나 API 설정을 확인하세요.")
                return
                
            self._log(f"✅ {len(problems)}개의 문제를 찾았습니다.")
            
            # 2. HML 생성
            self._log("2/3 HML 파일 생성 중...")
            generator = HMLGenerator()
            for i, prob in enumerate(problems, 1):
                generator.add_problem(prob, i)
            
            # 3. 저장
            output_path = filedialog.asksaveasfilename(
                defaultextension=".hml",
                filetypes=[("HML files", "*.hml")],
                initialfile="변환결과.hml"
            )
            
            if output_path:
                generator.save(output_path)
                self._log(f"🎉 성공! 파일이 저장되었습니다: {os.path.basename(output_path)}")
                messagebox.showinfo("완료", "HML 변환이 성공적으로 완료되었습니다.")
            else:
                self._log("⚠️ 저장이 취소되었습니다.")
                
        except Exception as e:
            self._log(f"❌ 오류 발생: {str(e)}")
            messagebox.showerror("오류", f"프로세스 중 오류가 발생했습니다: {e}")
        finally:
            self.convert_btn.config(state="normal")

if __name__ == "__main__":
    root = tk.Tk()
    app = MathPDFToHMLApp(root)
    root.mainloop()
