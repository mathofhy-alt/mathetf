"""
crop_review_dialog.py
크롭 확인 모달 UI — 변환 전 사용자가 크롭 결과를 확인하고 수동 수정할 수 있는 단계.
수동으로 지정된 좌표는 YOLO 학습 데이터로 자동 저장됨.
"""

import tkinter as tk
from tkinter import ttk, messagebox
import os
import json
from PIL import Image, ImageTk, ImageDraw


# ─── YOLO 레이블 저장 ───────────────────────────────────────────────────────────

def save_yolo_label(out_dir: str, pdf_basename: str, page_num: int,
                    padded_img: Image.Image, problem_list: list):
    """수동 수정된 크롭 좌표를 YOLO format으로 저장."""
    img_dir = os.path.join(out_dir, pdf_basename, "images")
    lbl_dir = os.path.join(out_dir, pdf_basename, "labels")
    os.makedirs(img_dir, exist_ok=True)
    os.makedirs(lbl_dir, exist_ok=True)

    # 이미지 저장
    img_filename = f"page_{page_num:03d}.jpg"
    padded_img.save(os.path.join(img_dir, img_filename), "JPEG", quality=90)

    # 라벨 저장 (YOLO: class cx cy w h — 모두 0~1 비율)
    W, H = padded_img.width, padded_img.height
    lbl_path = os.path.join(lbl_dir, f"page_{page_num:03d}.txt")
    with open(lbl_path, "w", encoding="utf-8") as f:
        for p in problem_list:
            sx = p.get("sx_abs", 0)
            sy = p.get("sy_abs", 0)
            ex = p.get("ex_abs", W)
            ey = p.get("ey_abs", H)
            cx = ((sx + ex) / 2) / W
            cy = ((sy + ey) / 2) / H
            bw = (ex - sx) / W
            bh = (ey - sy) / H
            f.write(f"0 {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}\n")

    # data.yaml (없으면 생성)
    yaml_path = os.path.join(out_dir, pdf_basename, "data.yaml")
    if not os.path.exists(yaml_path):
        with open(yaml_path, "w", encoding="utf-8") as f:
            f.write(f"path: {os.path.join(out_dir, pdf_basename)}\n")
            f.write("train: images\nval: images\nnc: 1\nnames: ['problem']\n")


# ─── 메인 다이얼로그 ────────────────────────────────────────────────────────────

class CropReviewDialog:
    """
    크롭 확인 모달 다이얼로그.

    Parameters
    ----------
    parent : tk.Tk | tk.Toplevel
        부모 창
    page_data_list : list[dict]
        각 페이지별 데이터:
        {
            'page_num': int,          # 1-indexed
            'padded_img': PIL.Image,  # 풀페이지 이미지
            'problem_list': [         # 감지된 문항 리스트
                {
                    'q_num': str,
                    'sx_abs': int, 'sy_abs': int,  # 절대 픽셀 좌표 (padded_img 기준)
                    'ex_abs': int, 'ey_abs': int,
                    'column': str,
                    'cropped_img': PIL.Image,
                }
            ]
        }
    pdf_basename : str
        YOLO 데이터 저장 시 폴더명으로 사용
    yolo_out_dir : str
        YOLO 학습 데이터 저장 루트 디렉토리

    Returns (via .result)
    ------
    None  — 취소
    list  — 확인된 page_data_list (수동 수정 반영됨)
    """

    # 미리보기 최대 표시 크기 (pixel)
    PREVIEW_W = 750
    PREVIEW_H = 950
    THUMB_W = 320
    THUMB_H = 200

    def __init__(self, parent, page_data_list: list,
                 pdf_basename: str = "pdf", yolo_out_dir: str = "training_data"):
        self.parent = parent
        self.page_data_list = [self._deep_copy_page(p) for p in page_data_list]
        self.pdf_basename = pdf_basename
        self.yolo_out_dir = yolo_out_dir

        self.result = None           # None = 취소, list = 확인됨
        self._modified_pages = set() # 수정된 페이지 번호 (YOLO 저장 대상)

        self._cur_page_idx = 0        # 현재 보이는 페이지 인덱스
        self._cur_q_idx = None        # 현재 선택된 문항 인덱스
        self._scale = 1.0             # 캔버스 축척

        # 드래그 상태
        self._drag_start = None
        self._drag_rect_id = None

        self._build_ui()
        self._load_page(0)

    # ── 내부 유틸 ────────────────────────────────────────────────────────────────

    def _deep_copy_page(self, p: dict) -> dict:
        """페이지 데이터 얕은 복사 (problem_list는 깊은 복사)."""
        import copy
        new_p = {k: v for k, v in p.items() if k != "problem_list"}
        new_p["problem_list"] = [dict(prob) for prob in p.get("problem_list", [])]
        return new_p

    def _scale_img(self, img: Image.Image, max_w: int, max_h: int):
        """이미지를 max_w×max_h 안에 들어오도록 비율 축소."""
        w, h = img.size
        scale = min(max_w / w, max_h / h, 1.0)
        new_w = max(1, int(w * scale))
        new_h = max(1, int(h * scale))
        return img.resize((new_w, new_h), Image.LANCZOS), scale

    # ── UI 구성 ──────────────────────────────────────────────────────────────────

    def _build_ui(self):
        self.win = tk.Toplevel(self.parent)
        self.win.title("📋 크롭 확인 — 문항을 선택하여 수정하세요")
        self.win.geometry("1280x980")
        self.win.resizable(True, True)
        self.win.grab_set()          # 모달

        # ── 상단 툴바 ────────────────────────────────────────────────────────────
        toolbar = tk.Frame(self.win, bg="#1e293b", pady=6)
        toolbar.pack(fill="x")

        self._page_label = tk.Label(toolbar, text="", bg="#1e293b", fg="white",
                                    font=("Segoe UI", 11, "bold"))
        self._page_label.pack(side="left", padx=12)

        tk.Button(toolbar, text="◀ 이전 페이지", command=self._prev_page,
                  bg="#334155", fg="white", relief="flat", padx=8).pack(side="left", padx=4)
        tk.Button(toolbar, text="다음 페이지 ▶", command=self._next_page,
                  bg="#334155", fg="white", relief="flat", padx=8).pack(side="left", padx=4)

        tk.Button(toolbar, text="✅ 확인 — 변환 시작", command=self._confirm,
                  bg="#16a34a", fg="white", font=("Segoe UI", 10, "bold"),
                  relief="flat", padx=12, pady=4).pack(side="right", padx=12)
        tk.Button(toolbar, text="❌ 취소", command=self._cancel,
                  bg="#dc2626", fg="white", relief="flat", padx=10).pack(side="right", padx=4)
        tk.Button(toolbar, text="➕ 새 문항 추가 (드래그)", command=self._start_add_mode,
                  bg="#7c3aed", fg="white", relief="flat", padx=10).pack(side="left", padx=8)
        self._delete_btn = tk.Button(toolbar, text="🗑️ 선택 문항 삭제", command=self._delete_selected_q,
                  bg="#b91c1c", fg="white", relief="flat", padx=10, state="disabled")
        self._delete_btn.pack(side="left", padx=4)

        tk.Button(toolbar, text="💣 모든 페이지 지우기", command=self._delete_all_q,
                  bg="#991b1b", fg="white", font=("Segoe UI", 9, "bold"), relief="flat", padx=10).pack(side="left", padx=4)

        # ── 메인 패널 (좌/우) ────────────────────────────────────────────────────
        pane = tk.PanedWindow(self.win, orient="horizontal", sashwidth=4,
                              bg="#e2e8f0")
        pane.pack(fill="both", expand=True)

        # ─ 왼쪽: 풀페이지 캔버스 ─────────────────────────────────────────────────
        left_frame = tk.Frame(pane, bg="#f8fafc")
        pane.add(left_frame, minsize=400)

        canvas_toolbar = tk.Frame(left_frame, bg="#f1f5f9", pady=4)
        canvas_toolbar.pack(fill="x")
        tk.Label(canvas_toolbar, text="📄 전체 페이지 — 박스 클릭하여 선택",
                 bg="#f1f5f9", fg="#475569", font=("Segoe UI", 9)).pack(side="left", padx=8)
        self._redraw_btn = tk.Button(canvas_toolbar, text="✏️ 선택 문항 재지정",
                                     command=self._start_redraw,
                                     state="disabled",
                                     bg="#f59e0b", fg="white", relief="flat", padx=8)
        self._redraw_btn.pack(side="right", padx=8)

        canvas_frame = tk.Frame(left_frame)
        canvas_frame.pack(fill="both", expand=True)

        self._canvas = tk.Canvas(canvas_frame, bg="#cbd5e1", cursor="crosshair")
        self._canvas.pack(side="left", fill="both", expand=True)
        vsb = tk.Scrollbar(canvas_frame, orient="vertical", command=self._canvas.yview)
        vsb.pack(side="right", fill="y")
        self._canvas.config(yscrollcommand=vsb.set)

        self._canvas.bind("<Button-1>", self._on_canvas_click)
        self._canvas.bind("<ButtonPress-1>", self._on_drag_start)
        self._canvas.bind("<B1-Motion>", self._on_drag_move)
        self._canvas.bind("<ButtonRelease-1>", self._on_drag_end)
        self.win.bind("<Escape>", self._cancel_redraw)

        # ─ 오른쪽: 썸네일 목록 ───────────────────────────────────────────────────
        right_frame = tk.Frame(pane, bg="#f8fafc")
        pane.add(right_frame, minsize=300)

        tk.Label(right_frame, text="문항 목록", bg="#1e293b", fg="white",
                 font=("Segoe UI", 10, "bold"), pady=6).pack(fill="x")

        scroll_container = tk.Frame(right_frame)
        scroll_container.pack(fill="both", expand=True)

        thumb_vsb = tk.Scrollbar(scroll_container, orient="vertical")
        thumb_vsb.pack(side="right", fill="y")

        self._thumb_canvas = tk.Canvas(scroll_container, bg="#f8fafc",
                                       yscrollcommand=thumb_vsb.set)
        self._thumb_canvas.pack(side="left", fill="both", expand=True)
        thumb_vsb.config(command=self._thumb_canvas.yview)

        self._thumb_frame = tk.Frame(self._thumb_canvas, bg="#f8fafc")
        self._thumb_canvas.create_window((0, 0), window=self._thumb_frame, anchor="nw")
        self._thumb_frame.bind("<Configure>",
                               lambda e: self._thumb_canvas.config(
                                   scrollregion=self._thumb_canvas.bbox("all")))

        # ─ 상태 바 ───────────────────────────────────────────────────────────────
        self._status_label = tk.Label(self.win, text="문항을 선택하세요.",
                                      bg="#e2e8f0", fg="#475569",
                                      font=("Segoe UI", 9), anchor="w", pady=3)
        self._status_label.pack(fill="x", padx=4)

        self._is_drawing = False   # 드래그 재지정 모드
        self._is_adding = False    # 드래그 새 문항 추가 모드

    # ── 페이지 로드 ──────────────────────────────────────────────────────────────

    def _load_page(self, idx: int):
        if not self.page_data_list:
            return
        idx = max(0, min(idx, len(self.page_data_list) - 1))
        self._cur_page_idx = idx
        self._cur_q_idx = None
        self._is_drawing = False
        self._redraw_btn.config(state="disabled")

        page = self.page_data_list[idx]
        total = len(self.page_data_list)
        q_count = len(page["problem_list"])
        self._page_label.config(
            text=f"페이지 {page['page_num']} / 총 {total}페이지 — 문항 {q_count}개"
        )

        # 풀페이지 이미지 → 캔버스
        img = page["padded_img"]
        disp_img, self._scale = self._scale_img(img, self.PREVIEW_W, self.PREVIEW_H)
        self._disp_img = ImageTk.PhotoImage(disp_img)
        self._canvas.config(width=disp_img.width, height=disp_img.height)
        self._canvas.config(scrollregion=(0, 0, disp_img.width, disp_img.height))
        self._canvas.delete("all")
        self._canvas.create_image(0, 0, anchor="nw", image=self._disp_img)

        self._draw_boxes()
        self._build_thumbnails()

    def _draw_boxes(self):
        """현재 페이지의 모든 박스를 캔버스에 그림."""
        self._canvas.delete("box")
        page = self.page_data_list[self._cur_page_idx]
        for i, p in enumerate(page["problem_list"]):
            sx = int(p["sx_abs"] * self._scale)
            sy = int(p["sy_abs"] * self._scale)
            ex = int(p["ex_abs"] * self._scale)
            ey = int(p["ey_abs"] * self._scale)
            color = "#f97316" if i == self._cur_q_idx else "#ef4444"
            width = 3 if i == self._cur_q_idx else 2
            self._canvas.create_rectangle(sx, sy, ex, ey,
                                          outline=color, width=width,
                                          tags=("box", f"box_{i}"))
            self._canvas.create_text(sx + 4, sy + 4, anchor="nw",
                                     text=f"  {p['q_num']}번",
                                     fill=color, font=("Segoe UI", 9, "bold"),
                                     tags=("box", f"box_{i}"))

    def _build_thumbnails(self):
        """오른쪽 패널에 썸네일 목록 재구성."""
        for w in self._thumb_frame.winfo_children():
            w.destroy()
        self._thumb_imgs = []

        page = self.page_data_list[self._cur_page_idx]
        for i, p in enumerate(page["problem_list"]):
            frame = tk.Frame(self._thumb_frame,
                             bg="#e2e8f0" if i == self._cur_q_idx else "#f8fafc",
                             pady=4, padx=6, relief="solid", bd=1,
                             cursor="hand2")
            frame.pack(fill="x", padx=8, pady=4)
            frame.bind("<Button-1>", lambda e, idx=i: self._select_q(idx))

            # 썸네일
            crop = p.get("cropped_img")
            if crop:
                th, _ = self._scale_img(crop, self.THUMB_W, self.THUMB_H)
                photo = ImageTk.PhotoImage(th)
                self._thumb_imgs.append(photo)
                img_lbl = tk.Label(frame, image=photo, bg=frame["bg"])
                img_lbl.image = photo
                img_lbl.pack()
                img_lbl.bind("<Button-1>", lambda e, idx=i: self._select_q(idx))

            # 문항 번호 라벨
            lbl = tk.Label(frame, text=f"📌 {p['q_num']}번", bg=frame["bg"],
                           font=("Segoe UI", 9, "bold"), fg="#1e293b")
            lbl.pack()
            lbl.bind("<Button-1>", lambda e, idx=i: self._select_q(idx))

            # 삭제 버튼
            del_btn = tk.Button(frame, text="❌ 이 문항 삭제",
                                command=lambda idx=i: self._delete_q(idx),
                                bg="#fee2e2", fg="#b91c1c",
                                font=("Segoe UI", 8), relief="flat", pady=2)
            del_btn.pack(fill="x", padx=4, pady=(2, 0))

    # ── 페이지 이동 ──────────────────────────────────────────────────────────────

    def _prev_page(self):
        if self._cur_page_idx > 0:
            self._load_page(self._cur_page_idx - 1)

    def _next_page(self):
        if self._cur_page_idx < len(self.page_data_list) - 1:
            self._load_page(self._cur_page_idx + 1)

    # ── 문항 선택 ────────────────────────────────────────────────────────────────

    def _select_q(self, idx: int):
        self._cur_q_idx = idx
        self._redraw_btn.config(state="normal")
        self._delete_btn.config(state="normal")
        page = self.page_data_list[self._cur_page_idx]
        p = page["problem_list"][idx]
        self._status_label.config(
            text=f"선택됨: {p['q_num']}번  |  "
                 f"영역: ({p['sx_abs']}, {p['sy_abs']}) ~ ({p['ex_abs']}, {p['ey_abs']})"
        )
        self._draw_boxes()
        self._build_thumbnails()

    def _delete_q(self, idx: int):
        """썸네일 삭제 버튼으로 특정 문항 삭제."""
        page = self.page_data_list[self._cur_page_idx]
        prob = page["problem_list"][idx]
        q_label = prob.get('q_num', '?')
        page["problem_list"].pop(idx)
        self._modified_pages.add(self._cur_page_idx)
        # 선택 인덱스 보정
        if self._cur_q_idx == idx:
            self._cur_q_idx = None
            self._redraw_btn.config(state="disabled")
            self._delete_btn.config(state="disabled")
        elif self._cur_q_idx is not None and self._cur_q_idx > idx:
            self._cur_q_idx -= 1
        q_count = len(page["problem_list"])
        self._page_label.config(
            text=f"페이지 {page['page_num']} / 총 {len(self.page_data_list)}페이지 — 문항 {q_count}개"
        )
        self._status_label.config(text=f"🗑️ {q_label}번 문항을 삭제했습니다. 남은 문항: {q_count}개")
        self._draw_boxes()
        self._build_thumbnails()

    def _delete_selected_q(self):
        """툴바 '선택 문항 삭제' 버튼."""
        if self._cur_q_idx is None:
            return
        self._delete_q(self._cur_q_idx)

    def _delete_all_q(self):
        """툴바 '모든 페이지 문항 지우기' 버튼."""
        total_q = sum(len(pg["problem_list"]) for pg in self.page_data_list)
        if total_q == 0:
            return
            
        from tkinter import messagebox
        if messagebox.askyesno("전체 삭제 확인", 
                               f"모든 페이지({len(self.page_data_list)}쪽 전체)에 감지된 모든 문항 좌표를 한 번에 삭제하시겠습니까?\n(총 {total_q}개 삭제됨. 수동 문항 추가를 권장합니다.)", 
                               parent=self.win):
            for i, pg in enumerate(self.page_data_list):
                if pg["problem_list"]:
                    pg["problem_list"].clear()
                    self._modified_pages.add(i)
                    
            self._cur_q_idx = None
            self._redraw_btn.config(state="disabled")
            self._delete_btn.config(state="disabled")
            
            page = self.page_data_list[self._cur_page_idx]
            self._page_label.config(
                text=f"페이지 {page['page_num']} / 총 {len(self.page_data_list)}페이지 — 문항 0개"
            )
            self._status_label.config(text="💣 모든 페이지의 문항 박스가 일괄 삭제되었습니다. 새 문항을 드래그해 주세요.")
            self._canvas.delete("box")
            self._draw_boxes()
            self._build_thumbnails()

    def _start_add_mode(self):
        """'새 문항 추가' 버튼 → 드래그로 새 영역 지정 모드."""
        self._is_adding = True
        self._continuous_add_active = False
        self._is_drawing = False
        self._canvas.delete("box")
        self._draw_boxes()
        self._status_label.config(
            text="➕ 추가할 문항 영역을 드래그하여 그리세요.  (ESC: 취소)"
        )
        self._canvas.config(cursor="crosshair")

    def _on_canvas_click(self, event):
        """캔버스 클릭 — 드래그 모드 아닐 때 박스 선택."""
        if self._is_drawing or self._is_adding:
            return
        page = self.page_data_list[self._cur_page_idx]
        cx = self._canvas.canvasx(event.x)
        cy = self._canvas.canvasy(event.y)
        for i, p in enumerate(page["problem_list"]):
            sx = p["sx_abs"] * self._scale
            sy = p["sy_abs"] * self._scale
            ex = p["ex_abs"] * self._scale
            ey = p["ey_abs"] * self._scale
            if sx <= cx <= ex and sy <= cy <= ey:
                self._select_q(i)
                return

    # ── 드래그로 재지정 ──────────────────────────────────────────────────────────

    def _cancel_redraw(self, event=None):
        """ESC 키 → 드래그 모드 취소, 박스 복원."""
        if not self._is_drawing and not self._is_adding:
            return
        self._is_drawing = False
        self._is_adding = False
        self._canvas.config(cursor="crosshair")
        if self._drag_rect_id:
            self._canvas.delete(self._drag_rect_id)
            self._drag_rect_id = None
        self._drag_start = None
        self._status_label.config(text="취소됨. 문항을 선택하거나 새 문항을 추가하세요.")
        self._draw_boxes()

    def _start_redraw(self):
        """'재지정' 버튼 클릭 → 드래그 모드 진입. 기존 박스 숨김."""
        if self._cur_q_idx is None:
            return
        page = self.page_data_list[self._cur_page_idx]
        q = page["problem_list"][self._cur_q_idx]
        self._is_drawing = True
        # 기존 박스 전부 숨김 → 드래그 시 방해 없음
        self._canvas.delete("box")
        self._status_label.config(
            text=f"✏️ {q['q_num']}번 영역을 드래그하여 새로 지정하세요.  (ESC: 취소)"
        )
        self._canvas.config(cursor="crosshair")

    def _on_drag_start(self, event):
        if not self._is_drawing and not self._is_adding:
            return
        self._drag_start = (self._canvas.canvasx(event.x),
                            self._canvas.canvasy(event.y))
        if self._drag_rect_id:
            self._canvas.delete(self._drag_rect_id)
            self._drag_rect_id = None

    def _on_drag_move(self, event):
        if (not self._is_drawing and not self._is_adding) or not self._drag_start:
            return
        if self._drag_rect_id:
            self._canvas.delete(self._drag_rect_id)
        x0, y0 = self._drag_start
        x1 = self._canvas.canvasx(event.x)
        y1 = self._canvas.canvasy(event.y)
        color = "#a855f7" if self._is_adding else "#22c55e"
        self._drag_rect_id = self._canvas.create_rectangle(
            x0, y0, x1, y1, outline=color, width=2, dash=(4, 2))

    def _on_drag_end(self, event):
        if (not self._is_drawing and not self._is_adding) or not self._drag_start:
            return
        x0, y0 = self._drag_start
        x1 = self._canvas.canvasx(event.x)
        y1 = self._canvas.canvasy(event.y)

        # 정규화 (x0 < x1, y0 < y1)
        sx = int(min(x0, x1) / self._scale)
        sy = int(min(y0, y1) / self._scale)
        ex = int(max(x0, x1) / self._scale)
        ey = int(max(y0, y1) / self._scale)

        if ex - sx < 10 or ey - sy < 10:
            self._is_drawing = False
            self._is_adding = False
            self._canvas.config(cursor="crosshair")
            self._canvas.delete(self._drag_rect_id)
            self._drag_rect_id = None
            return

        # ── 새 문항 추가 모드 ────────────────────────────────────────────────
        if self._is_adding:
            # 연속 추가 모드 유지 (False로 끄지 않음)
            self._canvas.config(cursor="crosshair")
            if self._drag_rect_id:
                self._canvas.delete(self._drag_rect_id)
                self._drag_rect_id = None
            self._drag_start = None

            page = self.page_data_list[self._cur_page_idx]
            pimg = page["padded_img"]
            W, H = pimg.size
            sx = max(0, min(sx, W - 1))
            sy = max(0, min(sy, H - 1))
            ex = max(0, min(ex, W))
            ey = max(0, min(ey, H))

            # 문항 번호 자동 추천 다이얼로그 (전체 페이지 기준 가장 큰 숫자 + 1)
            suggested_num = "1"
            max_num = 0
            for pg in self.page_data_list:
                for prob_item in pg.get("problem_list", []):
                    qn = prob_item.get("q_num", "0")
                    if qn.isdigit():
                        max_num = max(max_num, int(qn))
            if max_num > 0:
                suggested_num = str(max_num + 1)

            if getattr(self, '_continuous_add_active', False):
                q_num = suggested_num
            else:
                from tkinter.simpledialog import askstring
                q_num = askstring("문항 번호 입력",
                                  "이 영역의 최초 문항 번호를 입력하세요:\n(이후부터는 묻지 않고 +1씩 자동 연번 지정)",
                                  initialvalue=suggested_num,
                                  parent=self.win)
                if not q_num:
                    self._status_label.config(text="문항 추가 취소됨. 연속 추가 모드 종료.")
                    self._is_adding = False
                    self._continuous_add_active = False
                    return
                self._continuous_add_active = True
                
            q_num = q_num.strip()

            crop = pimg.crop((sx, sy, ex, ey))
            new_prob = {
                'q_num': q_num,
                'sx_abs': sx, 'sy_abs': sy,
                'ex_abs': ex, 'ey_abs': ey,
                'column': 'left' if sx < W * 0.5 else 'right',
                'cropped_img': crop,
                '_start_y': sy / H,
                '_end_y': ey / H,
            }
            page["problem_list"].append(new_prob)
            # y 좌표 기준 정렬
            page["problem_list"].sort(key=lambda p: p.get('sy_abs', 0))
            self._modified_pages.add(self._cur_page_idx)

            new_idx = page["problem_list"].index(new_prob)
            self._draw_boxes()
            self._build_thumbnails()
            self._select_q(new_idx)
            self._status_label.config(text=f"✅ {q_num}번 추가됨! [연속 추가 모드] 다음 영역을 계속 드래그하세요. (ESC: 취소)")
            return

        page = self.page_data_list[self._cur_page_idx]
        pimg = page["padded_img"]
        W, H = pimg.size
        sx = max(0, min(sx, W - 1))
        sy = max(0, min(sy, H - 1))
        ex = max(0, min(ex, W))
        ey = max(0, min(ey, H))

        prob = page["problem_list"][self._cur_q_idx]
        prob["sx_abs"] = sx
        prob["sy_abs"] = sy
        prob["ex_abs"] = ex
        prob["ey_abs"] = ey

        # 재크롭
        crop = pimg.crop((sx, sy, ex, ey))
        prob["cropped_img"] = crop

        # 수정된 페이지 기록
        self._modified_pages.add(self._cur_page_idx)

        # 상태 초기화
        self._is_drawing = False
        self._canvas.config(cursor="crosshair")
        if self._drag_rect_id:
            self._canvas.delete(self._drag_rect_id)
            self._drag_rect_id = None

        page = self.page_data_list[self._cur_page_idx]
        q_num = prob['q_num']
        total_q = len(page["problem_list"])
        next_q_idx = self._cur_q_idx + 1

        self._draw_boxes()
        self._build_thumbnails()

        # ── 다음 문항 자동 재지정 ────────────────────────────────────────────────
        if next_q_idx < total_q:
            next_q = page["problem_list"][next_q_idx]
            self._status_label.config(
                text=f"✅ {q_num}번 완료! → 자동으로 {next_q['q_num']}번 재지정 모드 시작..."
            )
            self.win.after(300, lambda: (
                self._select_q(next_q_idx),
                self._start_redraw()
            ))
        else:
            # 현재 페이지 마지막 문항 완료 → 다음 페이지로 자동 이동
            next_page_idx = self._cur_page_idx + 1
            if next_page_idx < len(self.page_data_list):
                next_page = self.page_data_list[next_page_idx]
                next_page_num = next_page["page_num"]
                first_q = next_page["problem_list"][0]["q_num"] if next_page["problem_list"] else "?"
                self._status_label.config(
                    text=f"✅ {q_num}번 완료! → {next_page_num}페이지로 이동, {first_q}번 재지정 시작..."
                )
                def _goto_next_page():
                    self._load_page(next_page_idx)
                    if self.page_data_list[next_page_idx]["problem_list"]:
                        self._select_q(0)
                        self._start_redraw()
                self.win.after(400, _goto_next_page)
            else:
                self._status_label.config(
                    text=f"✅ {q_num}번 재지정 완료! 모든 페이지·문항 재지정 끝. '확인'을 누르세요."
                )

    # ── 확인 / 취소 ──────────────────────────────────────────────────────────────

    def _confirm(self):
        # 수정된 페이지 YOLO 저장
        for pg_idx in self._modified_pages:
            page = self.page_data_list[pg_idx]
            try:
                save_yolo_label(
                    self.yolo_out_dir,
                    self.pdf_basename,
                    page["page_num"],
                    page["padded_img"],
                    page["problem_list"]
                )
            except Exception as e:
                print(f"[YOLO 저장 오류] {e}")

        if self._modified_pages:
            saved = len(self._modified_pages)
            self._status_label.config(
                text=f"💾 {saved}페이지 YOLO 학습 데이터 저장 완료 → {self.yolo_out_dir}/{self.pdf_basename}/"
            )

        self.result = self.page_data_list
        self.win.grab_release()
        self.win.destroy()

    def _cancel(self):
        self.result = None
        self.win.grab_release()
        self.win.destroy()


# ─── 편의 함수 ─────────────────────────────────────────────────────────────────

def show_crop_review(parent, page_data_list: list,
                     pdf_basename: str = "pdf",
                     yolo_out_dir: str = "training_data") -> list | None:
    """
    크롭 확인 모달을 열고 사용자가 확인/수정한 page_data_list를 반환.
    취소 시 None 반환.
    반드시 Tk 메인 스레드에서 호출해야 함.
    """
    dlg = CropReviewDialog(parent, page_data_list, pdf_basename, yolo_out_dir)
    parent.wait_window(dlg.win)
    return dlg.result
