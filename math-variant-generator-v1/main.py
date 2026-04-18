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
from crop_review_dialog import show_crop_review

class MathPDFToHMLApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Math-PDF 蹂?뺣Ц???꾩슜 ?앹꽦湲?v1 (Anti-Hallucination Safety Engine)")
        self.root.geometry("590x820")
        
        if getattr(sys, 'frozen', False):
            base_path = os.path.dirname(sys.executable)
        else:
            base_path = os.path.dirname(os.path.abspath(__file__))
            
        self.gemini_key_path = os.path.join(base_path, "gemini_api_key.txt")
        self.openai_key_path = os.path.join(base_path, "openai_api_key.txt")
        self.mathpix_id_path = os.path.join(base_path, "mathpix_app_id.txt")
        self.mathpix_key_path = os.path.join(base_path, "mathpix_app_key.txt")
        
        self.provider_path = os.path.join(base_path, "provider.txt")
        self.model_path = os.path.join(base_path, "model.txt")
        self.curriculum_path = os.path.join(base_path, "curriculum.txt")
        
        old_api_key_path = os.path.join(base_path, "api_key.txt")
        if os.path.exists(old_api_key_path) and not os.path.exists(self.gemini_key_path):
            try: os.rename(old_api_key_path, self.gemini_key_path)
            except: pass

        self.gemini_key = ""
        self.openai_key = ""
        self.mathpix_id = ""
        self.mathpix_key = ""
        default_provider = "Gemini"
        default_model = "???2: Mathpix(OCR) + Gemini Pro(?댁꽕) - 臾닿껐???좊즺"
        default_curriculum = "怨?怨? 1?숆린 (?ㅽ빆?? 諛⑹젙?? 遺?깆떇)"
        
        if os.path.exists(self.gemini_key_path):
            try:
                with open(self.gemini_key_path, "r", encoding="utf-8") as f: self.gemini_key = f.read().strip()
            except: pass
        if os.path.exists(self.openai_key_path):
            try:
                with open(self.openai_key_path, "r", encoding="utf-8") as f: self.openai_key = f.read().strip()
            except: pass
        if os.path.exists(self.mathpix_id_path):
            try:
                with open(self.mathpix_id_path, "r", encoding="utf-8") as f: self.mathpix_id = f.read().strip()
            except: pass
        if os.path.exists(self.mathpix_key_path):
            try:
                with open(self.mathpix_key_path, "r", encoding="utf-8") as f: self.mathpix_key = f.read().strip()
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
            "Option 1",
            "Option 2",
            "Option 3",
            "Option 4",
            "Option 5"
        ]
        self.openai_models = [
            "o1", "o3", "o3mini", "gpt5.2", "gpt5.4pro", "o4mini"
        ]
        
        self.status_msg = tk.StringVar(value="以鍮꾨맖")
        
        # ??퀎 PDF 紐⑸줉 (媛곴컖 ?낅┰)
        self.pdf_paths_tab2 = []  # 蹂?뺣Ц???앹꽦??        
        self._setup_ui()
        self._on_provider_change()
        
    def _on_provider_change(self, *args):
        current_provider = self.selected_provider.get()
        if current_provider == "Gemini":
            self.api_key_label.config(text="Gemini API ??(?먮룞 ???:")
            self.model_label.config(text="AI 紐⑤뜽 (Phase 0, 1, 2 怨듯넻 ?곸슜):")
            self.model_combo.config(values=self.gemini_models)
            if self.selected_model.get() not in self.gemini_models:
                self.selected_model.set(self.gemini_models[0])
            self.model_combo.config(state="readonly")
            self.api_key.set(self.gemini_key)
            self.gemini_fallback_frame.pack_forget()
            self.mathpix_frame.pack(fill="x", pady=(0, 8))
        else:
            self.api_key_label.config(text="OpenAI API ??(?먮룞 ???:")
            self.model_label.config(text="AI 紐⑤뜽 (踰꾩쟾) ?좏깮:")
            self.model_combo.config(state="readonly")
            self.model_combo.config(values=self.openai_models)
            if self.selected_model.get() not in self.openai_models:
                self.selected_model.set(self.openai_models[0])
            self.api_key.set(self.openai_key)
            self.mathpix_frame.pack_forget()
            self.gemini_fallback_frame.pack(fill="x", pady=(0, 8))
            
    def _save_current_api_key(self):
        if self.selected_provider.get() == "Gemini":
            self.gemini_key = self.api_key.get().strip()
        else:
            self.openai_key = self.api_key.get().strip()
            
    def _save_fallback_key(self, *args):
        self.gemini_key = self.gemini_fallback_var.get().strip()
        
    def _setup_ui(self):
        # ?? ?곷떒 怨듯넻 ?ㅼ젙 ?곸뿭 ??????????????????????????????????????????????
        settings_frame = tk.LabelFrame(self.root, text=" 怨듯넻 ?ㅼ젙 ", padx=15, pady=10)
        settings_frame.pack(fill="x", padx=10, pady=(10, 5))
        
        # ?쒓났???좏깮
        tk.Label(settings_frame, text="AI 紐⑤뜽 ?쒓났??").pack(anchor="w")
        provider_frame = tk.Frame(settings_frame)
        provider_frame.pack(fill="x", pady=(0, 6))
        tk.Radiobutton(provider_frame, text="Gemini", variable=self.selected_provider, value="Gemini", command=self._on_provider_change).pack(side="left")
        tk.Radiobutton(provider_frame, text="OpenAI", variable=self.selected_provider, value="OpenAI", command=self._on_provider_change).pack(side="left", padx=10)

        # API ??        self.api_key_label = tk.Label(settings_frame, text="API ??")
        self.api_key_label.pack(anchor="w")
        api_frame = tk.Frame(settings_frame)
        api_frame.pack(fill="x", pady=(0, 6))
        api_entry = tk.Entry(api_frame, textvariable=self.api_key, width=58, show="*")
        api_entry.pack(side="left")
        api_entry.bind("<KeyRelease>", lambda e: self._save_current_api_key())
        
        # Mathpix / Fallback ?꾨젅??        self.mathpix_frame = tk.Frame(settings_frame)
        tk.Label(self.mathpix_frame, text="??[Mathpix] App ID:").pack(side="left")
        self.mathpix_id_var = tk.StringVar(value=self.mathpix_id)
        tk.Entry(self.mathpix_frame, textvariable=self.mathpix_id_var, width=15).pack(side="left", padx=5)
        tk.Label(self.mathpix_frame, text="App Key:").pack(side="left")
        self.mathpix_key_var = tk.StringVar(value=self.mathpix_key)
        tk.Entry(self.mathpix_frame, textvariable=self.mathpix_key_var, width=22, show="*").pack(side="left", padx=5)
        
        self.gemini_fallback_frame = tk.Frame(settings_frame)
        tk.Label(self.gemini_fallback_frame, text="??Gemini 蹂댁“ ??").pack(anchor="w")
        fallback_api_frame = tk.Frame(self.gemini_fallback_frame)
        fallback_api_frame.pack(fill="x")
        self.gemini_fallback_var = tk.StringVar(value=self.gemini_key)
        fallback_api_entry = tk.Entry(fallback_api_frame, textvariable=self.gemini_fallback_var, width=55, show="*")
        fallback_api_entry.pack(side="left")
        fallback_api_entry.bind("<KeyRelease>", lambda e: self._save_fallback_key())
        
        # 紐⑤뜽 ?좏깮
        self.model_label = tk.Label(settings_frame, text="AI 紐⑤뜽 ?좏깮:")
        self.model_label.pack(anchor="w")
        model_frame = tk.Frame(settings_frame)
        model_frame.pack(fill="x", pady=(0, 6))
        self.model_combo = ttk.Combobox(model_frame, textvariable=self.selected_model, width=60, state="readonly")
        self.model_combo.pack(side="left")
        
        # ?쒖씠???좏깮
        tk.Label(settings_frame, text="?댁꽕 ?쒖씠??(?숇뀈):").pack(anchor="w")
        curr_frame = tk.Frame(settings_frame)
        curr_frame.pack(fill="x", pady=(0, 2))
        self.curriculums = [
            "怨? 1?숆린 (怨듯넻?섑븰1: ?ㅽ빆?? 諛?遺?깆떇, 寃쎌슦???? ?됰젹)",
            "怨? 2?숆린 (怨듯넻?섑븰2: ?꾪삎??諛⑹젙?? 吏묓빀紐낆젣, ?⑥닔)",
            "怨? 1?숆린 (??? 吏?섎줈洹? ?쇨컖?⑥닔, ?섏뿴)",
            "怨? 2?숆린 (誘몄쟻遺껱: ?ㅽ빆?⑥닔??洹뱁븳/?곗냽/誘몃텇/?곷텇)",
            "怨? (?꾩껜 怨쇱젙 ?덉슜: 誘몄쟻遺껱I/湲고븯 ??紐⑤몢 ?덉슜)"
        ]
        if self.selected_curriculum.get() not in self.curriculums: self.selected_curriculum.set(self.curriculums[0])
        self.curr_combo = ttk.Combobox(curr_frame, textvariable=self.selected_curriculum, values=self.curriculums, width=60, state="readonly")
        self.curr_combo.pack(side="left")

        # ?? 湲곕뒫 ????????????????????????????????????????????????????????????
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill="both", expand=True, padx=10, pady=(5, 10))

        self.tab2 = tk.Frame(self.notebook, padx=15, pady=12)

        self.notebook.add(self.tab2, text="  ?봽  蹂??4?명듃 ?꾩슜 ?꾧컻湲? ")

        self._build_tab2(self.tab2)


    # ?? ??2: 臾몄젣 + 蹂?뺣Ц???앹꽦 ??????????????????????????????????????????
    def _build_tab2(self, parent):
        tk.Label(parent, text="?쒗뿕吏 PDF瑜??щ━硫?臾몄젣? 蹂?뺣Ц?쒕? ?먮룞?쇰줈 ?앹꽦?⑸땲??", fg="#555", font=("", 8)).pack(anchor="w", pady=(0, 8))

        tk.Label(parent, text="PDF ?뚯씪 ?좏깮:", font=("", 9, "bold")).pack(anchor="w")
        file_frame = tk.Frame(parent)
        file_frame.pack(fill="x", pady=(4, 10))
        
        self.pdf_listbox2 = tk.Listbox(file_frame, height=4, width=46)
        self.pdf_listbox2.pack(side="left", fill="x", expand=True)
        btn_frame = tk.Frame(file_frame)
        btn_frame.pack(side="left", padx=5)
        tk.Button(btn_frame, text="?뚯씪 異붽?", width=10, command=lambda: self._add_pdfs(self.pdf_listbox2, self.pdf_paths_tab2)).pack(fill="x", pady=2)
        tk.Button(btn_frame, text="紐⑸줉 鍮꾩슦湲?", width=10, command=lambda: self._clear_pdfs(self.pdf_listbox2, self.pdf_paths_tab2)).pack(fill="x", pady=2)

        # 蹂???쒖씠??        diff_frame = tk.Frame(parent)
        diff_frame.pack(fill="x", pady=(0, 10))
        tk.Label(diff_frame, text="蹂???쒖씠??").pack(side="left")
        self.difficulties = ["Level 1", "Level 2", "Level 3"]
        self.selected_difficulty = tk.StringVar(value=self.difficulties[0])
        self.diff_combo = ttk.Combobox(diff_frame, textvariable=self.selected_difficulty, values=self.difficulties, width=20, state="readonly")
        self.diff_combo.pack(side="left", padx=8)

        tk.Label(parent, text="吏꾪뻾 濡쒓렇:", font=("", 9, "bold")).pack(anchor="w")
        log_frame = tk.Frame(parent)
        log_frame.pack(fill="both", expand=True, pady=(4, 10))
        scrollbar2 = tk.Scrollbar(log_frame)
        scrollbar2.pack(side="right", fill="y")
        self.log_box2 = tk.Text(log_frame, height=10, state="disabled", yscrollcommand=scrollbar2.set)
        self.log_box2.pack(side="left", fill="both", expand=True)
        scrollbar2.config(command=self.log_box2.yview)

        self.convert_btn2 = tk.Button(
            parent, text="??  蹂?뺣Ц???앹꽦 ?쒖옉",
            command=lambda: self._start_conversion(generate_variants=True, pdf_paths=self.pdf_paths_tab2, log_box=self.log_box2, btn=self.convert_btn2),
            bg="#7c3aed", fg="white", font=("", 11, "bold"), pady=7
        )
        self.convert_btn2.pack(fill="x")

    # ?? 怨듯넻 ?ы띁 ???????????????????????????????????????????????????????????
    def _add_pdfs(self, listbox, pdf_paths):
        filenames = filedialog.askopenfilenames(filetypes=[("PDF files", "*.pdf")])
        if filenames:
            for f in filenames:
                if f not in pdf_paths:
                    pdf_paths.append(f)
                    listbox.insert(tk.END, os.path.basename(f))
                    
    def _clear_pdfs(self, listbox, pdf_paths):
        pdf_paths.clear()
        listbox.delete(0, tk.END)
            
    def _log(self, msg, log_box):
        log_box.config(state="normal")
        log_box.insert(tk.END, f"{msg}\n")
        log_box.see(tk.END)
        log_box.config(state="disabled")
        self.root.update()

    def _start_conversion(self, generate_variants, pdf_paths, log_box, btn):
        self._save_current_api_key()
        api_key_val = self.api_key.get().strip()
        model_val = self.selected_model.get().strip()
        provider_val = self.selected_provider.get().strip()
        
        m_id = self.mathpix_id_var.get().strip()
        m_key = self.mathpix_key_var.get().strip()
        
        if not api_key_val:
            messagebox.showerror("Error", "Message")
            return
            
        if "Mathpix" in model_val and (not m_id or not m_key):
            messagebox.showerror("Error", "Message")
            return
            
        try:
            if provider_val == "Gemini":
                with open(self.gemini_key_path, "w", encoding="utf-8") as f: f.write(api_key_val)
            else:
                with open(self.openai_key_path, "w", encoding="utf-8") as f: f.write(api_key_val)
            with open(self.mathpix_id_path, "w", encoding="utf-8") as f: f.write(m_id)
            with open(self.mathpix_key_path, "w", encoding="utf-8") as f: f.write(m_key)
            with open(self.provider_path, "w", encoding="utf-8") as f: f.write(provider_val)
            with open(self.model_path, "w", encoding="utf-8") as f: f.write(model_val)
            with open(self.curriculum_path, "w", encoding="utf-8") as f: f.write(self.selected_curriculum.get().strip())
        except: pass

        if not pdf_paths:
            messagebox.showerror("Error", "Message")
            return
            
        btn.config(state="disabled")
        threading.Thread(
            target=self._run_process,
            args=(generate_variants, list(pdf_paths), log_box, btn),
            daemon=True
        ).start()

    def _run_process(self, generate_variants, pdf_paths, log_box, btn):
        try:
            total_files = len(pdf_paths)
            self._log(f"?? 珥?{total_files}媛쒖쓽 PDF 蹂???꾨줈?몄뒪 ?쒖옉...", log_box)
            
            gemini_key_val = self.gemini_key if hasattr(self, 'gemini_key') else ""
            if not gemini_key_val and os.path.exists(self.gemini_key_path):
                try:
                    with open(self.gemini_key_path, "r", encoding="utf-8") as f: gemini_key_val = f.read().strip()
                except: pass
            
            pending_tasks = []
            
            # --- 1?④퀎: ?쒖감???щ∼ ?뺤씤 ---
            for idx, current_pdf in enumerate(pdf_paths, 1):
                self._log(f"\n[?щ∼ ?뺤씤 1?④퀎 | {idx}/{total_files}] ?대엺 以? {os.path.basename(current_pdf)}", log_box)
                provider_val = self.selected_provider.get()
                self._log(f"1/3 {provider_val} API 遺꾩꽍 以?[{self.selected_model.get()}] ...", log_box)
                
                if provider_val == "Gemini":
                    parser = GeminiMathParser(
                        api_key=self.api_key.get().strip(), 
                        model_name=self.selected_model.get().strip(), 
                        curriculum=self.selected_curriculum.get().strip(),
                        mathpix_app_id=self.mathpix_id_var.get().strip(),
                        mathpix_app_key=self.mathpix_key_var.get().strip()
                    )
                else:
                    if not gemini_key_val:
                        self._log("?좑툘 寃쎄퀬: Gemini 蹂댁“ ?ㅺ? ?놁뒿?덈떎.", log_box)
                    parser = OpenAIMathParser(self.api_key.get().strip(), self.selected_model.get().strip(), self.selected_curriculum.get().strip(), gemini_key_val)
                
                self._log("?뱪 ?щ∼ 媛먯? 以?.. (Mathpix/AI ?몄텧 ?놁쓬)", log_box)
                page_data_list = asyncio.run(parser.detect_crops(
                    current_pdf,
                    log_callback=lambda m: self._log(m, log_box)
                ))
                
                if not page_data_list:
                    self._log(f"?좑툘 ?먮룞 媛먯? ?ㅽ뙣 ???섎룞 ?щ∼ 紐⑤뱶濡??꾪솚?⑸땲??", log_box)
                    # PDF ?뚮뜑留곹빐??鍮?page_data_list ?앹꽦 (?섎룞 ?щ∼??
                    try:
                        import fitz
                        from PIL import Image as _Image
                        doc = fitz.open(current_pdf)
                        page_data_list = []
                        for pg_idx in range(len(doc)):
                            page = doc[pg_idx]
                            mat = fitz.Matrix(3, 3)
                            pix = page.get_pixmap(matrix=mat)
                            mode = "RGBA" if pix.alpha else "RGB"
                            img = _Image.frombytes(mode, [pix.width, pix.height], pix.samples)
                            if mode == "RGBA":
                                bg = _Image.new("RGB", img.size, (255, 255, 255))
                                bg.paste(img, mask=img.split()[3])
                                img = bg
                            padding_height = 200
                            padded_img = _Image.new("RGB", (img.width, img.height + padding_height), (255, 255, 255))
                            padded_img.paste(img, (0, 0))
                            page_data_list.append({
                                'page_num': pg_idx + 1,
                                'padded_img': padded_img,
                                'problem_list': []   # 鍮꾩뼱?덉쓬 ???섎룞?쇰줈 異붽?
                            })
                        doc.close()
                        self._log(f"?뱞 {len(page_data_list)}?섏씠吏 ?뚮뜑留??꾨즺 ???щ∼李쎌뿉??吏곸젒 臾명빆 ?곸뿭??洹몃젮二쇱꽭??", log_box)
                    except Exception as render_err:
                        self._log(f"??PDF ?뚮뜑留??ㅽ뙣: {render_err}", log_box)
                        continue

                total_detected = sum(len(p['problem_list']) for p in page_data_list)
                if total_detected > 0:
                    self._log(f"??{total_detected}媛?臾명빆 媛먯? ?꾨즺 ???щ∼ ?뺤씤 李쎌쓣 ?댁뼱二쇱꽭??", log_box)
                else:
                    self._log(f"???щ∼ ?뺤씤 李쎌쓣 ?댁뼱二쇱꽭?? ?대?吏瑜??쒕옒洹명븯??臾명빆???섎룞 異붽??섏꽭??", log_box)


                modal_result = [None]
                modal_event = threading.Event()
                pdf_basename = os.path.splitext(os.path.basename(current_pdf))[0]
                base_dir = os.path.dirname(current_pdf)
                yolo_dir = os.path.join(base_dir, "training_data")

                def open_modal():
                    result = show_crop_review(
                        self.root,
                        page_data_list,
                        pdf_basename=pdf_basename,
                        yolo_out_dir=yolo_dir
                    )
                    modal_result[0] = result
                    modal_event.set()

                self.root.after(0, open_modal)
                modal_event.wait()

                confirmed_data = modal_result[0]
                if confirmed_data is None:
                    self._log("???щ∼ ?뺤씤 痍⑥냼?? ???뚯씪 嫄대꼫?곷땲??", log_box)
                    continue
                
                # 蹂대쪟 紐⑸줉??異붽?
                pending_tasks.append({
                    "idx": idx,
                    "current_pdf": current_pdf,
                    "parser": parser,
                    "confirmed_data": confirmed_data,
                    "provider_val": provider_val,
                    "base_dir": base_dir
                })
                self._log(f"-> {os.path.basename(current_pdf)} ??Queue)???깅줉 ?꾨즺.\n", log_box)

            if not pending_tasks:
                self._log("??異붿텧???뚯씪 ?먭? 鍮꾩뼱?덉뒿?덈떎. ?묒뾽??醫낅즺?⑸땲??", log_box)
                return

            self._log(f"\n?? [異붿텧 諛?HML ?앹꽦 2?④퀎 ?쒖옉] (珥?{len(pending_tasks)}媛? - ?댁젣 ?ㅻⅨ ?묒뾽???섏뀛???⑸땲??", log_box)

            # --- 2?④퀎: 諛깃렇?쇱슫??AI 異붿텧 諛?HML ???---
            for task in pending_tasks:
                idx = task['idx']
                current_pdf = task['current_pdf']
                # parser = task['parser'] # Removed to avoid "Event loop is closed" issue from reusing parser initialized in Phase 1
                confirmed_data = task['confirmed_data']
                provider_val = task['provider_val']
                base_dir = task['base_dir']

                gemini_key_val = self.gemini_key if hasattr(self, 'gemini_key') else ""
                if not gemini_key_val and os.path.exists(self.gemini_key_path):
                    try:
                        with open(self.gemini_key_path, "r", encoding="utf-8") as f: gemini_key_val = f.read().strip()
                    except: pass

                # Create a fresh parser for Phase 2 to ensure a clean asyncio Event Loop
                if provider_val == "Gemini":
                    parser = GeminiMathParser(
                        api_key=self.api_key.get().strip(), 
                        model_name=self.selected_model.get().strip(), 
                        curriculum=self.selected_curriculum.get().strip(),
                        mathpix_app_id=self.mathpix_id_var.get().strip(),
                        mathpix_app_key=self.mathpix_key_var.get().strip()
                    )
                else:
                    parser = OpenAIMathParser(self.api_key.get().strip(), self.selected_model.get().strip(), self.selected_curriculum.get().strip(), gemini_key_val)

                self._log(f"\n[{idx}/{total_files}] AI 泥섎━ 以? {os.path.basename(current_pdf)}", log_box)
                self._log(f"1/3 {provider_val} API 異붿텧 ?쒖옉 [{self.selected_model.get()}] ...", log_box)

                if generate_variants:
                    # ?? ?? ?꾩슜 ?뚯씠?꾨씪?? 臾몄젣 異붿텧 + 蹂?뺣Ц???앹꽦 ??
                    problems = asyncio.run(parser.extract_variants_from_crops(
                        confirmed_data,
                        log_callback=lambda m: self._log(m, log_box),
                        variant_difficulty=self.selected_difficulty.get()
                    ))
                else:
                    # ?? ?? ?꾩슜 ?뚯씠?꾨씪?? 臾몄젣 + ?댁꽕 異붿텧 ??
                    problems = asyncio.run(parser.extract_from_crops(
                        confirmed_data,
                        log_callback=lambda m: self._log(m, log_box),
                        generate_variants=False,
                        variant_difficulty=""
                    ))

                
                if not problems:
                    self._log(f"??{os.path.basename(current_pdf)}: 異붿텧 ?ㅽ뙣.", log_box)
                    continue
                    
                self._log(f"??{len(problems)}媛쒖쓽 臾몄젣瑜?李얠븯?듬땲??", log_box)
                with open('debug_gui_problems.json', 'w', encoding='utf-8') as f:
                    import json
                    json.dump(problems, f, ensure_ascii=False, indent=2)
                
                self._log("2/3 HML ?뚯씪 ?앹꽦 以?..", log_box)
                generator = HMLGenerator()
                for i, prob in enumerate(problems, 1):
                    generator.add_problem(prob, i)
                
                base_name = os.path.splitext(os.path.basename(current_pdf))[0]
                suffix = "_modified" if generate_variants else ""
                output_path = os.path.join(base_dir, f"{base_name}{suffix}.hml")
                generator.save(output_path)
                self._log(f"Success! Saved to: {output_path}", log_box)
            
            self._log("Process finished", log_box)
            messagebox.showinfo("Info", "Process complete")
        except Exception as e:
            self._log(f"Error: {str(e)}", log_box)
            messagebox.showerror("Error", "Process failed")
        finally:
            btn.config(state="normal")

if __name__ == "__main__":
    root = tk.Tk()
    app = MathPDFToHMLApp(root)
    root.mainloop()
