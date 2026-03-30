"""
exam-to-hwp: PDF 시험지 → HML 변환 프로그램
Tkinter GUI – 다중 PDF 배치 처리 지원
"""
import os
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from gemini_ocr import run_ocr
from hml_generator import HMLGenerator
from crop_review_dialog import show_crop_review


# ─── 색상 테마 ─────────────────────────────────────────────────────────────
BG    = "#1e1e2e"
BG2   = "#2a2a3e"
BG3   = "#313145"
ACC   = "#7c5cfc"
ACC2  = "#a07dff"
TEXT  = "#cdd6f4"
TEXT2 = "#6c7086"
SUCCESS = "#a6e3a1"
WARNING = "#f9e2af"
ERROR   = "#f38ba8"
FONT      = ("Malgun Gothic", 10)
FONT_BOLD = ("Malgun Gothic", 10, "bold")
FONT_MONO = ("Consolas", 9)
FONT_SML  = ("Malgun Gothic", 9)

# 파일 상태 상수
ST_PENDING  = "⏳ 대기"
ST_RUNNING  = "🔄 변환중"
ST_DONE     = "✅ 완료"
ST_FAIL     = "❌ 실패"

STATUS_COLOR = {
    ST_PENDING: TEXT2,
    ST_RUNNING: WARNING,
    ST_DONE:    SUCCESS,
    ST_FAIL:    ERROR,
}


class QueueItem:
    """변환 큐 항목 하나"""
    def __init__(self, pdf_path: str):
        self.pdf_path  = pdf_path
        self.out_path  = os.path.splitext(pdf_path)[0] + ".hml"
        self.status    = ST_PENDING
        self.log_lines: list[str] = []
        self.confirmed_data = None


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("시험지 → HML 배치 변환기")
        self.geometry("820x640")
        self.resizable(True, True)
        self.configure(bg=BG)

        # 상태
        self.model_var  = tk.StringVar(value="gemini-3-flash-preview")
        self.queue: list[QueueItem] = []
        self.selected_idx: int | None = None   # 리스트에서 선택된 항목
        self.is_running = False
        self._stop_flag = False

        self._build_ui()
        self._center_window()

    def _center_window(self):
        self.update_idletasks()
        w, h = 820, 640
        x = (self.winfo_screenwidth()  - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

    # ═══════════════════════════════════════════════════════════════════
    # UI 구성
    # ═══════════════════════════════════════════════════════════════════
    def _build_ui(self):
        # ── 헤더 ──
        header = tk.Frame(self, bg=ACC, height=50)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(header, text="📄  시험지 PDF → HML 배치 변환기",
                 font=("Malgun Gothic", 13, "bold"),
                 bg=ACC, fg="white").pack(side="left", padx=18, pady=12)

        # ── 본문 ──
        body = tk.Frame(self, bg=BG, padx=16, pady=12)
        body.pack(fill="both", expand=True)

        # ── 모델 선택 행 ──
        model_row = tk.Frame(body, bg=BG)
        model_row.pack(fill="x", pady=(0, 6))
        tk.Label(model_row, text="🤖  Gemini 모델",
                 font=FONT_BOLD, bg=BG, fg=TEXT,
                 width=18, anchor="w").pack(side="left")
        MODELS = [
            ("⚡ Gemini 3 Flash Preview (빠름/저렴)", "gemini-3-flash-preview"),
            ("🧠 Gemini 3.1 Pro (최신/고정밀)",       "gemini-3.1-pro-preview"),
        ]
        for label, mid in MODELS:
            tk.Radiobutton(
                model_row, text=label, variable=self.model_var, value=mid,
                font=FONT, bg=BG, fg=TEXT2,
                selectcolor=BG2, activebackground=BG, activeforeground=ACC2,
                relief="flat", cursor="hand2"
            ).pack(side="left", padx=(0, 14))

        # ── 좌우 분할 패널 ──
        paned = tk.PanedWindow(body, orient="horizontal", bg=BG,
                               sashwidth=5, sashrelief="flat")
        paned.pack(fill="both", expand=True)

        # ── 왼쪽: 파일 큐 패널 ──
        left = tk.Frame(paned, bg=BG)
        paned.add(left, width=310, minsize=180)

        tk.Label(left, text="📋  변환 목록", font=FONT_BOLD,
                 bg=BG, fg=TEXT).pack(anchor="w", pady=(0, 4))

        # 리스트박스 + 스크롤
        list_frame = tk.Frame(left, bg=BG2, bd=0)
        list_frame.pack(fill="both", expand=True)

        sb_list = tk.Scrollbar(list_frame)
        sb_list.pack(side="right", fill="y")

        self.listbox = tk.Listbox(
            list_frame, font=FONT_SML, bg=BG2, fg=TEXT,
            selectbackground=BG3, selectforeground=ACC2,
            relief="flat", bd=4,
            activestyle="none", cursor="hand2",
            yscrollcommand=sb_list.set
        )
        self.listbox.pack(fill="both", expand=True)
        sb_list.config(command=self.listbox.yview)
        self.listbox.bind("<<ListboxSelect>>", self._on_list_select)

        # 파일 조작 버튼 행
        btn_row = tk.Frame(left, bg=BG)
        btn_row.pack(fill="x", pady=(6, 0))
        self._btn(btn_row, "➕ 추가", self._add_files, ACC).pack(side="left", padx=(0, 4))
        self._btn(btn_row, "🗑 선택 삭제", self._remove_selected, BG3).pack(side="left", padx=(0, 4))
        self._btn(btn_row, "🧹 전체 삭제", self._clear_all, BG3).pack(side="left")

        # ── 오른쪽: 로그 패널 ──
        right = tk.Frame(paned, bg=BG)
        paned.add(right, minsize=200)

        self.log_header = tk.Label(right, text="📝  로그",
                                   font=FONT_BOLD, bg=BG, fg=TEXT, anchor="w")
        self.log_header.pack(fill="x", pady=(0, 4))

        log_frame = tk.Frame(right, bg=BG2, bd=0)
        log_frame.pack(fill="both", expand=True)

        sb_log = tk.Scrollbar(log_frame)
        sb_log.pack(side="right", fill="y")

        self.log_text = tk.Text(
            log_frame, font=FONT_MONO, bg=BG2, fg=TEXT,
            relief="flat", bd=4, wrap="word",
            yscrollcommand=sb_log.set, state="disabled"
        )
        self.log_text.pack(fill="both", expand=True)
        sb_log.config(command=self.log_text.yview)

        self.log_text.tag_config("ok",   foreground=SUCCESS)
        self.log_text.tag_config("warn", foreground=WARNING)
        self.log_text.tag_config("err",  foreground=ERROR)
        self.log_text.tag_config("dim",  foreground=TEXT2)

        # ── 하단 컨트롤 바 ──
        bottom = tk.Frame(body, bg=BG)
        bottom.pack(fill="x", pady=(10, 0))

        self.btn_start = self._btn(bottom, "⚙  전체 변환 시작", self._start_all, ACC,
                                   font=FONT_BOLD, padx=22, pady=8)
        self.btn_start.pack(side="left")

        self.btn_stop = self._btn(bottom, "⏹ 중지", self._stop, ERROR,
                                  font=FONT_BOLD, padx=14, pady=8)
        self.btn_stop.pack(side="left", padx=(8, 0))
        self.btn_stop.config(state="disabled")

        self.total_label = tk.Label(bottom, text="", font=FONT,
                                    bg=BG, fg=TEXT2)
        self.total_label.pack(side="right", padx=4)

        # 진행률
        style = ttk.Style(self)
        style.theme_use("default")
        style.configure("TProgressbar", troughcolor=BG2, background=ACC, thickness=6)
        self.progress_var = tk.DoubleVar()
        self.progress = ttk.Progressbar(body, variable=self.progress_var,
                                        maximum=100, mode="determinate", length=780)
        self.progress.pack(fill="x", pady=(6, 0))

        self.status_label = tk.Label(body, text="PDF 파일을 추가하세요...",
                                     font=FONT, bg=BG, fg=TEXT2, anchor="w")
        self.status_label.pack(fill="x", pady=(4, 0))

    def _btn(self, parent, text, cmd, bg, **kw):
        font   = kw.pop("font", FONT)
        padx   = kw.pop("padx", 10)
        pady   = kw.pop("pady", 5)
        return tk.Button(parent, text=text, command=cmd,
                         font=font, bg=bg, fg="white",
                         activebackground=ACC2, activeforeground="white",
                         relief="flat", bd=0, padx=padx, pady=pady,
                         cursor="hand2", **kw)

    # ═══════════════════════════════════════════════════════════════════
    # 큐 관리
    # ═══════════════════════════════════════════════════════════════════
    def _add_files(self):
        paths = filedialog.askopenfilenames(
            title="PDF 파일 선택 (여러 개 가능)",
            filetypes=[("PDF 파일", "*.pdf"), ("모든 파일", "*.*")]
        )
        existing = {item.pdf_path for item in self.queue}
        added = 0
        for p in paths:
            if p not in existing:
                self.queue.append(QueueItem(p))
                added += 1
        if added:
            self._refresh_listbox()
            self._update_total_label()

    def _remove_selected(self):
        sel = self.listbox.curselection()
        if not sel:
            return
        idx = sel[0]
        if self.queue[idx].status == ST_RUNNING:
            messagebox.showwarning("경고", "현재 변환 중인 파일은 삭제할 수 없습니다.")
            return
        self.queue.pop(idx)
        self.selected_idx = None
        self._refresh_listbox()
        self._update_total_label()
        self._clear_log()

    def _clear_all(self):
        if self.is_running:
            messagebox.showwarning("경고", "변환 중에는 전체 삭제할 수 없습니다.\n먼저 중지하세요.")
            return
        self.queue.clear()
        self.selected_idx = None
        self._refresh_listbox()
        self._update_total_label()
        self._clear_log()

    def _refresh_listbox(self):
        self.listbox.delete(0, "end")
        for item in self.queue:
            name = os.path.basename(item.pdf_path)
            label = f" {item.status}  {name}"
            self.listbox.insert("end", label)
            color = STATUS_COLOR.get(item.status, TEXT)
            self.listbox.itemconfig("end", fg=color)
        # 선택 복원
        if self.selected_idx is not None and self.selected_idx < len(self.queue):
            self.listbox.selection_set(self.selected_idx)

    def _on_list_select(self, _event=None):
        sel = self.listbox.curselection()
        if not sel:
            return
        idx = sel[0]
        self.selected_idx = idx
        item = self.queue[idx]
        name = os.path.basename(item.pdf_path)
        self.log_header.config(text=f"📝  로그 — {name}")
        self._show_item_log(item)

    def _show_item_log(self, item: QueueItem):
        self.log_text.config(state="normal")
        self.log_text.delete("1.0", "end")
        for msg, tag in item.log_lines:
            self.log_text.insert("end", msg + "\n", tag)
        self.log_text.see("end")
        self.log_text.config(state="disabled")

    def _clear_log(self):
        self.log_text.config(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.config(state="disabled")
        self.log_header.config(text="📝  로그")

    def _update_total_label(self):
        total = len(self.queue)
        done  = sum(1 for i in self.queue if i.status == ST_DONE)
        fail  = sum(1 for i in self.queue if i.status == ST_FAIL)
        if total == 0:
            self.total_label.config(text="")
        else:
            self.total_label.config(text=f"✅ {done}  ❌ {fail}  / {total}개")

    # ═══════════════════════════════════════════════════════════════════
    # 변환 제어
    # ═══════════════════════════════════════════════════════════════════
    def _start_all(self):
        if self.is_running:
            return
        pending = [i for i in self.queue if i.status == ST_PENDING]
        if not pending:
            if not self.queue:
                messagebox.showinfo("안내", "변환할 PDF 파일을 먼저 추가하세요.")
            else:
                # 실패한 것들 재시도
                failed = [i for i in self.queue if i.status == ST_FAIL]
                if failed:
                    for item in failed:
                        item.status = ST_PENDING
                        item.log_lines.clear()
                    self._refresh_listbox()
                    self._start_all()
                else:
                    messagebox.showinfo("안내", "모든 파일이 이미 완료되었습니다.")
            return

        self.is_running = True
        self._stop_flag = False
        self.btn_start.config(state="disabled", text="⏳ 변환 중...", bg=TEXT2)
        self.btn_stop.config(state="normal")
        threading.Thread(target=self._batch_worker, daemon=True).start()

    def _stop(self):
        self._stop_flag = True
        self._set_status("⏹ 중지 요청됨... 현재 파일 완료 후 정지합니다.")
        self.btn_stop.config(state="disabled")

    def _batch_worker(self):
        """순차적으로 대기 항목을 변환 (크롭 1회전 -> 변환 1회전)"""
        pending_items = [i for i in self.queue if i.status == ST_PENDING]
        total = len(pending_items)
        if total == 0:
            self.after(0, self._on_batch_done)
            return

        # 1. 크롭 전체 진행
        done_count = 0
        for item in pending_items:
            if self._stop_flag:
                break
            done_count += 1
            self.after(0, lambda i=item, d=done_count, t=total: self._start_crop_item(i, d, t))
            self._item_done_event = threading.Event()
            self._do_crop_item(item, done_count, total)
            self._item_done_event.wait()
            if not self._stop_flag:
                import time; time.sleep(0.5)

        # 2. 변환 전체 진행 (크롭 완료된 것만)
        convert_items = [i for i in pending_items if i.status == ST_RUNNING and getattr(i, 'confirmed_data', None)]
        convert_total = len(convert_items)
        done_count = 0
        for item in convert_items:
            if self._stop_flag:
                break
            done_count += 1
            self.after(0, lambda i=item, d=done_count, t=convert_total: self._start_convert_item(i, d, t))
            self._item_done_event = threading.Event()
            self._do_convert_item(item, done_count, convert_total)
            self._item_done_event.wait()
            if not self._stop_flag:
                import time; time.sleep(0.5)

        self.after(0, self._on_batch_done)

    def _start_crop_item(self, item: QueueItem, done: int, total: int):
        item.status = ST_RUNNING
        item.log_lines.clear()
        self._refresh_listbox()
        self._set_status(f"크롭 지정 중... ({done}/{total})  {os.path.basename(item.pdf_path)}")
        self._set_progress(0)
        if self.selected_idx is not None and self.selected_idx < len(self.queue) and self.queue[self.selected_idx] is item:
            self._show_item_log(item)

    def _do_crop_item(self, item: QueueItem, done_count: int, total: int):
        model_id = self.model_var.get()
        def item_log(msg: str, tag: str = ""):
            item.log_lines.append((msg, tag))
            def _push():
                if self.selected_idx is not None and \
                   self.selected_idx < len(self.queue) and \
                   self.queue[self.selected_idx] is item:
                    self.log_text.config(state="normal")
                    self.log_text.insert("end", msg + "\n", tag)
                    self.log_text.see("end")
                    self.log_text.config(state="disabled")
            self.after(0, _push)

        try:
            item_log(f"▶ 1단계(크롭) 시작: {os.path.basename(item.pdf_path)}", "ok")
            item_log(f"  [1/2] PDF 로드 및 이미지 변환 중...", "dim")
            from gemini_ocr import pdf_to_images
            import threading
            
            images = pdf_to_images(item.pdf_path, dpi=250)
            
            page_data_list = []
            for pg_idx, img in enumerate(images):
                page_data_list.append({
                    'page_num': pg_idx + 1,
                    'padded_img': img,
                    'problem_list': []
                })

            item_log(f"  📌 크롭 팝업 창이 열립니다. 문항 영역을 직접 드래그해 주세요...", "warn")
            
            modal_result = [None]
            modal_event = threading.Event()
            pdf_basename = os.path.splitext(os.path.basename(item.pdf_path))[0]
            base_dir = os.path.dirname(item.pdf_path)
            yolo_dir = os.path.join(base_dir, "training_data")

            def open_modal():
                result = show_crop_review(
                    self,
                    page_data_list,
                    pdf_basename=pdf_basename,
                    yolo_out_dir=yolo_dir
                )
                modal_result[0] = result
                modal_event.set()

            self.after(0, open_modal)
            modal_event.wait()
            
            confirmed_data = modal_result[0]
            if confirmed_data is None:
                item_log(f"⛔ 크롭을 취소했습니다. 변환을 중단합니다.", "err")
                item.status = ST_FAIL
                self._item_done_event.set()
                return

            item.confirmed_data = confirmed_data
            item_log(f"✓ 크롭 완료. 다음 항목으로 넘어갑니다.", "ok")
            
        except Exception as e:
            import traceback
            err_detail = traceback.format_exc()
            item.status = ST_FAIL
            item_log(f"\n❌ 오류:\n{err_detail}", "err")
        finally:
            self.after(0, self._refresh_listbox)
            self._item_done_event.set()

    def _start_convert_item(self, item: QueueItem, done: int, total: int):
        self._set_status(f"HML 변환 중... ({done}/{total})  {os.path.basename(item.pdf_path)}")
        self._set_progress(0)
        try:
            idx = self.queue.index(item)
            self.listbox.selection_clear(0, "end")
            self.listbox.selection_set(idx)
            self._on_list_select()
        except ValueError:
            pass

    def _do_convert_item(self, item: QueueItem, done_count: int, total: int):
        model_id = self.model_var.get()
        def item_log(msg: str, tag: str = ""):
            item.log_lines.append((msg, tag))
            def _push():
                if self.selected_idx is not None and \
                   self.selected_idx < len(self.queue) and \
                   self.queue[self.selected_idx] is item:
                    self.log_text.config(state="normal")
                    self.log_text.insert("end", msg + "\n", tag)
                    self.log_text.see("end")
                    self.log_text.config(state="disabled")
            self.after(0, _push)

        if not getattr(item, 'confirmed_data', None):
            item_log(f"⛔ 크롭 데이터가 없어 변환을 진행할 수 없습니다.", "err")
            item.status = ST_FAIL
            self._item_done_event.set()
            return

        total_pages_ref = [len(item.confirmed_data)]

        def ocr_log(msg: str):
            if "페이지" in msg and "OK" in msg:
                try:
                    page_n = int(msg.split("페이지")[1].split("OK")[0].strip())
                    pct = min(90.0, page_n / max(total_pages_ref[0], 1) * 90.0)
                    self._set_progress(pct)
                except Exception:
                    pass
            tag = "ok"   if ("OK" in msg or "완료" in msg) else \
                  "warn"  if "⚠" in msg else \
                  "err"   if ("✗" in msg or "실패" in msg) else \
                  "dim"
            item_log(f"  {msg}", tag)

        try:
            item_log(f"\n▶ 2단계(변환) 시작: {os.path.basename(item.pdf_path)}", "ok")
            item_log(f"  [2/2] 선택된 문항 개별 추출 시작...", "ok")
            
            from google import genai
            from gemini_ocr import ocr_crop, load_api_key
            client = genai.Client(api_key=load_api_key())
            
            extracted_problems = []
            for page in item.confirmed_data:
                for prob in page["problem_list"]:
                    q_num = prob["q_num"]
                    c_img = prob["cropped_img"]
                    text = ocr_crop(client, model_id, c_img, q_num, log_callback=ocr_log)
                    extracted_problems.append((q_num, text))
                    import time; time.sleep(1.5)

            item_log(f"\n✓ 개별 OCR 추출 완료 (총 {len(extracted_problems)}문항)", "ok")
            self._set_progress(92)
            self._set_status(f"HML 생성 중... ({done_count}/{total})")

            import re
            def natural_keys(text):
                return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', str(text).strip())]
            
            extracted_problems.sort(key=lambda x: natural_keys(x[0]))

            from hml_generator import HMLGenerator
            gen = HMLGenerator()
            for q_num, q_text in extracted_problems:
                item_log(f"  {q_num}번 문항 HML 조립 중...", "dim")
                gen.add_paragraph(f"%% {q_num}. %%")
                for line in q_text.split('\n'):
                    gen.add_paragraph(line)
                gen.add_paragraph("")

            self._set_progress(98)
            gen.save(item.out_path)

            item.status = ST_DONE
            item_log(f"\n✅ 저장 완료: {item.out_path}", "ok")

        except Exception as e:
            import traceback
            err_detail = traceback.format_exc()
            item.status = ST_FAIL
            item_log(f"\n❌ 오류:\n{err_detail}", "err")

        finally:
            self._set_progress(100)
            self.after(0, self._refresh_listbox)
            self.after(0, self._update_total_label)
            self._item_done_event.set()

    def _on_batch_done(self):
        self.is_running = False
        self.btn_start.config(state="normal", text="⚙  전체 변환 시작", bg=ACC)
        self.btn_stop.config(state="disabled")

        done  = sum(1 for i in self.queue if i.status == ST_DONE)
        fail  = sum(1 for i in self.queue if i.status == ST_FAIL)
        total = len(self.queue)

        if self._stop_flag:
            self._set_status(f"⏹ 중지됨  (완료 {done} / 실패 {fail} / 전체 {total})")
        else:
            self._set_status(f"✓ 배치 완료  ✅ {done}  ❌ {fail}  / 전체 {total}개")
            if fail == 0:
                messagebox.showinfo("변환 완료", f"모든 파일 변환이 완료되었습니다!\n\n✅ 완료: {done}개")
            else:
                messagebox.showwarning("일부 실패", f"변환 완료\n\n✅ 완료: {done}개\n❌ 실패: {fail}개\n\n실패 항목을 선택 후 로그를 확인하세요.")

        self._set_progress(0 if done == 0 else 100)
        self._update_total_label()

    # ═══════════════════════════════════════════════════════════════════
    # 헬퍼
    # ═══════════════════════════════════════════════════════════════════
    def _set_status(self, msg: str):
        self.after(0, lambda: self.status_label.config(text=msg))

    def _set_progress(self, val: float):
        self.after(0, lambda: self.progress_var.set(val))


if __name__ == "__main__":
    app = App()
    app.mainloop()
