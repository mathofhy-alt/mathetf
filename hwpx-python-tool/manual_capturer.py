import tkinter as tk
from tkinter import messagebox
import cv2
import numpy as np
import os
import time
import win32gui
from PIL import Image, ImageGrab, ImageTk
import uuid
import sys
from ctypes import windll
import winsound

# [CRITICAL] 윈도우 DPI 정책 강제 설정
try:
    windll.shcore.SetProcessDpiAwareness(1)
except:
    try:
        windll.user32.SetProcessDPIAware()
    except:
        pass

def debug_log(msg):
    try:
        log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_captures")
        os.makedirs(log_dir, exist_ok=True)
        with open(os.path.join(log_dir, "hunter_debug.log"), "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
        print(f"DEBUG: {msg}")
    except:
        pass

class HunterV16_15(tk.Tk):
    def __init__(self):
        super().__init__()
        self.app_state = "LAUNCHER"
        self.title("Hunter v16.15 - Tolerant Stitching")
        self.attributes("-topmost", True)
        
        self.selected_blocks = []
        self.base_x = None
        self.base_w = None
        
        self.container = tk.Frame(self)
        self.container.pack(fill="both", expand=True)
        
        self.last_tab_time = 0
        self.last_f2_time = 0
        self.poll_global_keys()
        
        self.bind_all("<Key>", self.dispatch_keys)
        
        self.setup_launcher()
        self.center_window(560, 420)
        debug_log("Hunter v16.15 Initialized.")

    def center_window(self, w, h):
        ws = self.winfo_screenwidth()
        hs = self.winfo_screenheight()
        x = (ws/2) - (w/2)
        y = (hs/2) - (h/2)
        self.geometry('%dx%d+%d+%d' % (int(w), int(h), int(x), int(y)))

    def poll_global_keys(self):
        try:
            # VK_TAB = 0x09
            if windll.user32.GetAsyncKeyState(0x09) & 0x8000:
                if time.time() - self.last_tab_time > 0.3:
                    self.on_global_tab()
                    self.last_tab_time = time.time()
            
            # VK_F2 = 0x71
            if windll.user32.GetAsyncKeyState(0x71) & 0x8000:
                if time.time() - self.last_f2_time > 0.3:
                    self.on_global_f2()
                    self.last_f2_time = time.time()
        except:
            pass
        finally:
            self.after(50, self.poll_global_keys)

    def on_global_tab(self):
        if self.app_state == "CAPTURE":
            winsound.Beep(600, 100)
            self.enter_scroll_mode()
        elif self.app_state == "SCROLL_MODE":
            winsound.Beep(1000, 100)
            self.resume_capture_from_scroll()
        elif self.app_state == "FINETUNE":
            self.cycle_selection()

    def on_global_f2(self):
        if self.app_state == "LAUNCHER":
            self.start_capture_flow()

    def dispatch_keys(self, event):
        k = event.keysym
        if k == "Escape":
            self.destroy()
            sys.exit(0)
        
        if self.app_state == "CAPTURE":
            if k in ["space", "Return"]:
                self.finish_capture()
                return "break"
                
        elif self.app_state == "FINETUNE":
            if k in ["space", "Return"]:
                self.save_and_exit()
                return "break"
            if k == "Left": self.adjust(-1, 0)
            elif k == "Right": self.adjust(1, 0)
            elif k == "Up": self.adjust(0, -1)
            elif k == "Down": self.adjust(0, 1)
        return None

    def enter_scroll_mode(self):
        self.app_state = "SCROLL_MODE"
        self.attributes("-alpha", 0.0)
        self.geometry("+10000+10000")
        self.update()

    def resume_capture_from_scroll(self):
        self.app_state = "CAPTURE"
        try:
            shot = ImageGrab.grab(all_screens=True)
            self.raw_img = np.array(shot)
            self.img_h, self.img_w = self.raw_img.shape[:2]
            self.blocks = self.vision_brain(self.raw_img)
            
            v_x = windll.user32.GetSystemMetrics(76)
            v_y = windll.user32.GetSystemMetrics(77)
            v_w = windll.user32.GetSystemMetrics(78)
            v_h = windll.user32.GetSystemMetrics(79)
            
            self.geometry(f"{v_w}x{v_h}+{v_x}+{v_y}")
            self.update()

            self.setup_capture_overlay() 

            self.attributes("-alpha", 0.3)
            self.attributes("-topmost", True)
            self.lift()
            self.focus_force()
            
        except Exception as e:
            debug_log(f"RESUME_ERROR: {e}")
            self.deiconify()
            self.app_state = "CAPTURE"
            self.attributes("-alpha", 0.3)

    def setup_launcher(self):
        self.app_state = "LAUNCHER"
        for widget in self.container.winfo_children():
            widget.destroy()
        
        self.attributes("-alpha", 1.0)
        self.overrideredirect(False)
        self.attributes("-fullscreen", False)
        self.wm_state('normal')
        self.center_window(560, 420)
        self.config(bg="#f3f4f6")
        
        main_frame = tk.Frame(self.container, padx=30, pady=30, bg="#f3f4f6")
        main_frame.pack(expand=True, fill="both")
        
        tk.Label(main_frame, text="🛡️ Hunter v16.15 Tolerant Stitching", 
                 font=("Malgun Gothic", 16, "bold"), fg="#1e40af", bg="#f3f4f6").pack(pady=(0, 15))
        
        guide = (
            "• [F2] 캡쳐 시작\n"
            "• [Tab] 숨기기 <-> 보이기\n"
            "• [Space] 저장 (자동 착! 붙임)\n\n"
            "💡 박스 크기를 대충 잡아도 찰떡같이 알아듣고 붙여줍니다.\n"
            "이제 신경 써서 드래그하지 않으셔도 됩니다."
        )
        tk.Label(main_frame, text=guide, font=("Malgun Gothic", 10), justify="left", fg="#374151", bg="#f3f4f6").pack(pady=(0, 25))
        
        tk.Button(main_frame, text="🎯 캡쳐 엔진 가동 (F2)", 
                  bg="#2563eb", fg="white", font=("Malgun Gothic", 12, "bold"), 
                  padx=45, pady=12, relief="flat", command=self.start_capture_flow).pack()
        
        self.after(300, self.focus_force)

    def start_capture_flow(self):
        debug_log("Starting Capture Flow...")
        self.withdraw()
        time.sleep(0.4)
        try:
            shot = ImageGrab.grab(all_screens=True)
            self.raw_img = np.array(shot)
            self.img_h, self.img_w = self.raw_img.shape[:2]
            self.blocks = self.vision_brain(self.raw_img)
            self.deiconify()
            self.setup_capture_overlay()
        except Exception as e:
            debug_log(f"INIT_ERROR: {e}")
            messagebox.showerror("Error", f"초기화 실패: {e}")
            self.deiconify()
            self.setup_launcher()

    def vision_brain(self, rgb_img):
        img_bgr = cv2.cvtColor(rgb_img, cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        kernel = np.ones((5,5), np.uint8)
        closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        dilated = cv2.dilate(closed, np.ones((30,1), np.uint8), iterations=2)
        dilated = cv2.dilate(dilated, np.ones((1,20), np.uint8), iterations=1)
        
        extracted_blocks = []
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            extracted_blocks.append({'x': x, 'y': y, 'w': w, 'h': h})
        extracted_blocks.sort(key=lambda b: (b['y'] // 100, b['x']))
        return extracted_blocks

    def setup_capture_overlay(self):
        self.app_state = "CAPTURE"
        for widget in self.container.winfo_children():
            widget.destroy()
            
        self.attributes("-alpha", 0.3)
        self.attributes("-fullscreen", False)
        self.overrideredirect(True)
        self.config(bg="black", cursor="cross")
        
        self.update_idletasks()
        
        v_x = windll.user32.GetSystemMetrics(76)
        v_y = windll.user32.GetSystemMetrics(77)
        v_w = windll.user32.GetSystemMetrics(78)
        v_h = windll.user32.GetSystemMetrics(79)
        
        self.geometry(f"{v_w}x{v_h}+{v_x}+{v_y}")
        
        self.off_x, self.off_y = v_x, v_y
        self.sc_x = 1.0 
        self.sc_y = 1.0
        
        self.v_left = v_x
        self.v_top = v_y
        
        self.overlay_canvas = tk.Canvas(self.container, highlightthickness=0, bg="black")
        self.overlay_canvas.pack(fill="both", expand=True)
        
        status_text = f"🎯 {len(self.selected_blocks)}개 선택됨 | [Tab] 숨기기/보이기 | [Space] 완료"
        self.status_msg = tk.StringVar(value=status_text)
        
        tk.Label(self.container, textvariable=self.status_msg, 
                 fg="white", bg="#ef4444", font=("Malgun Gothic", 12, "bold"), pady=12).place(relx=0.5, y=60, anchor="center")
        
        self.overlay_canvas.bind("<Motion>", self.on_mouse_move)
        self.overlay_canvas.bind("<Button-1>", self.on_left_click)
        self.overlay_canvas.bind("<Button-3>", self.on_right_down)
        self.overlay_canvas.bind("<B3-Motion>", self.on_right_drag)
        self.overlay_canvas.bind("<ButtonRelease-3>", self.on_right_up)
        
        self.draw_existing_blocks()
        self.cur_candidate = None
        self.tmp_rect_id = None
        self.snap_ids = []
        self.after(300, self.focus_force)

    def draw_existing_blocks(self):
        for block_data in self.selected_blocks:
            block = block_data['info']
            bx = (block['x'] - self.v_left) 
            by = (block['y'] - self.v_top)
            self.overlay_canvas.create_rectangle(bx, by, bx+block['w'], by+block['h'], fill="#10b981", stipple="gray25", outline="#10b981", width=3)

    def on_mouse_move(self, e):
        rx = self.v_left + e.x
        ry = self.v_top + e.y
        
        self.cur_candidate = next((b for b in self.blocks if b['x']<=rx<=b['x']+b['w'] and b['y']<=ry<=b['y']+b['h'] and b['w']>50 and b['h']>30), None)
        
        if self.tmp_rect_id: self.overlay_canvas.delete(self.tmp_rect_id)
        for sid in self.snap_ids: self.overlay_canvas.delete(sid)
        self.snap_ids = []
            
        if self.cur_candidate:
            dx = self.cur_candidate['x'] - self.v_left
            dy = self.cur_candidate['y'] - self.v_top
            dw = self.cur_candidate['w']
            dh = self.cur_candidate['h']
            
            color = "#3b82f6"
            if self.base_x is not None and abs(self.cur_candidate['x'] - self.base_x) < 80:
                dx = self.base_x - self.v_left
                dw = self.base_w
                color = "#ec4899"
                line1 = self.overlay_canvas.create_line(dx, 0, dx, 10000, fill=color, dash=(2,2), tags="dynamic")
                line2 = self.overlay_canvas.create_line(dx+dw, 0, dx+dw, 10000, fill=color, dash=(2,2), tags="dynamic")
                self.snap_ids = [line1, line2]
            self.tmp_rect_id = self.overlay_canvas.create_rectangle(dx, dy, dx+dw, dy+dh, fill=color, stipple="gray50", outline=color, width=3, tags="dynamic")

    def add_selected_piece(self, block):
        try:
            if self.base_x is None:
                self.base_x = block['x']
                self.base_w = block['w']
            y1, y2, x1, x2 = max(0, block['y']), min(self.img_h, block['y']+block['h']), max(0, block['x']), min(self.img_w, block['x']+block['w'])
            im = self.raw_img[int(y1):int(y2), int(x1):int(x2)]
            if im.size == 0: return
            
            self.selected_blocks.append({'image': Image.fromarray(cv2.cvtColor(im, cv2.COLOR_BGR2RGB)), 'info': block})
            
            bx = block['x'] - self.v_left
            by = block['y'] - self.v_top
            
            self.overlay_canvas.create_rectangle(bx, by, bx+block['w'], by+block['h'], fill="#10b981", stipple="gray25", outline="#10b981", width=3)
            self.status_msg.set(f"✅ {len(self.selected_blocks)}개 선택됨 | [Tab] 숨기기/보이기 | [Space] 완료")
            self.focus_force()
        except: pass

    def on_left_click(self, e):
        if self.cur_candidate:
            to_add = self.cur_candidate.copy()
            if self.base_x is not None and abs(to_add['x'] - self.base_x) < 80:
                to_add['x'] = self.base_x
                to_add['w'] = self.base_w
            self.add_selected_piece(to_add)

    def on_right_down(self, e):
        self.drag_start_pos = (e.x, e.y)
        self.drag_rect_id = self.overlay_canvas.create_rectangle(e.x, e.y, e.x, e.y, outline="#f59e0b", width=2, dash=(4,4), tags="dynamic")
    def on_right_drag(self, e):
        self.overlay_canvas.coords(self.drag_rect_id, min(self.drag_start_pos[0], e.x), min(self.drag_start_pos[1], e.y), max(self.drag_start_pos[0], e.x), max(self.drag_start_pos[1], e.y))
    def on_right_up(self, e):
        p1_x, p1_y = self.v_left + self.drag_start_pos[0], self.v_top + self.drag_start_pos[1]
        p2_x, p2_y = self.v_left + e.x, self.v_top + e.y
        fx, fy, fw, fh = min(p1_x, p2_x), min(p1_y, p2_y), abs(p2_x-p1_x), abs(p2_y-p1_y)
        if fw > 10 and fh > 10:
            if self.base_x is not None and abs(fx-self.base_x) < 80: fx, fw = self.base_x, self.base_w
            self.add_selected_piece({'x': fx, 'y': fy, 'w': fw, 'h': fh})
        self.overlay_canvas.delete(self.drag_rect_id)

    def finish_capture(self):
        if not self.selected_blocks: return
        try:
            self.app_state = "FINETUNE"
            for widget in self.container.winfo_children(): widget.destroy()
            self.attributes("-alpha", 1.0); self.attributes("-fullscreen", False); self.overrideredirect(False); self.wm_state('zoomed')
            self.config(bg="#111827")
            self.offsets = [[0, 0] for _ in range(len(self.selected_blocks))]
            self.active_idx = 0
            
            # [V16.15] Robust Stitching (Width-Independent)
            for i in range(len(self.selected_blocks)-1):
                try:
                    img_t = np.array(self.selected_blocks[i]['image'])
                    img_b = np.array(self.selected_blocks[i+1]['image'])
                    t = cv2.cvtColor(img_t, cv2.COLOR_RGB2GRAY)
                    b = cv2.cvtColor(img_b, cv2.COLOR_RGB2GRAY)
                    
                    # Binarize
                    _, t = cv2.threshold(t, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
                    _, b = cv2.threshold(b, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
                    
                    h_t, w_t = t.shape
                    h_b, w_b = b.shape
                    
                    # Use common width for matching
                    min_w = min(w_t, w_b)
                    
                    # Crop center (or left) for matching
                    t_crop = t[:, 0:min_w]
                    b_crop = b[:, 0:min_w]
                    
                    templ_h = min(80, h_t)
                    if templ_h < 10: continue
                    
                    # Template: Bottom of Top Image
                    templ = t_crop[h_t-templ_h:h_t, :]
                    
                    search_h = min(160, h_b)
                    if search_h < templ_h: continue
                    
                    # Search: Top of Bottom Image
                    search = b_crop[0:search_h, :]
                    
                    # Crop check
                    if templ.shape[1] > search.shape[1]: 
                        search = search[:, 0:templ.shape[1]]
                    
                    res = cv2.matchTemplate(search, templ, cv2.TM_CCOEFF_NORMED)
                    _, v, _, l = cv2.minMaxLoc(res)
                    
                    debug_log(f"Stitch {i}->{i+1}: Val={v:.2f}, OffsetY={l[1]}")
                    
                    if v > 0.65: # Slightly lower threshold
                        overlap_h = l[1] + templ_h
                        self.offsets[i+1] = [-l[0], -overlap_h]
                        
                except Exception as e:
                    debug_log(f"STITCH_WARNING: {e}")
            
            self.setup_finetune_ui()
            self.after(500, self.focus_force)
        except Exception as e:
            debug_log(f"FINISH_ERROR: {e}")
            messagebox.showerror("Error", f"편집 모드 진입 실패: {e}")
            self.setup_launcher()

    def setup_finetune_ui(self):
        head = tk.Frame(self.container, bg="#111827", pady=15, padx=25); head.pack(fill="x")
        tk.Label(head, text="🛠️ 정밀 얼라인먼트 (v16.15)", fg="#60a5fa", bg="#111827", font=("Malgun Gothic", 12, "bold")).pack(side="left")
        tk.Label(head, text="[Tab] 조각순환 | [Space] 최종 저장", fg="#9ca3af", bg="#111827", font=("Malgun Gothic", 10)).pack(side="left", padx=40)
        tk.Button(head, text="💾 저장", bg="#059669", fg="white", font=("Malgun Gothic", 11, "bold"), padx=35, pady=8, command=self.save_and_exit).pack(side="right")
        body = tk.Frame(self.container); body.pack(fill="both", expand=True)
        self.tune_canvas = tk.Canvas(body, bg="#1f2937", highlightthickness=0); self.tune_canvas.pack(side="left", fill="both", expand=True)
        self.render_tune_view()

    def cycle_selection(self):
        self.active_idx = (self.active_idx + 1) % len(self.selected_blocks)
        self.render_tune_view()
    def adjust(self, dx, dy):
        self.offsets[self.active_idx][0] += dx; self.offsets[self.active_idx][1] += dy; self.render_tune_view()

    def render_tune_view(self):
        self.tune_canvas.delete("all"); y=80
        for i, b in enumerate(self.selected_blocks):
            dx, dy = self.offsets[i]; y+=dy; x=300+dx
            pi = ImageTk.PhotoImage(b['image']); setattr(self.tune_canvas, f"img_{i}", pi)
            self.tune_canvas.create_image(x, y, image=pi, anchor="nw")
            if i == self.active_idx:
                self.tune_canvas.create_rectangle(x-3, y-3, x+b['image'].width+3, y+b['image'].height+3, outline="#60a5fa", width=4)
            y+=b['image'].height
        self.tune_canvas.config(scrollregion=(0,0,3500,y+350))

    def save_and_exit(self):
        try:
            msg = tk.Frame(self.container, bg="#ef4444", padx=60, pady=30); msg.place(relx=0.5, rely=0.5, anchor="center")
            tk.Label(msg, text="🚀 저장 중...", fg="white", bg="#ef4444", font=("Malgun Gothic", 15, "bold")).pack(); self.update()
            
            min_x = min(o[0] for o in self.offsets)
            max_x = max(o[0]+s['image'].width for o, s in zip(self.offsets, self.selected_blocks))
            h = sum(o[1]+s['image'].height for o, s in zip(self.offsets, self.selected_blocks))
            img = Image.new('RGB', (int(max_x-min_x), int(max(1, h))), (255,255,255)); cy=0
            for i, s in enumerate(self.selected_blocks):
                cy += self.offsets[i][1]; img.paste(s['image'], (int(self.offsets[i][0]-min_x), int(cy))); cy += s['image'].height
            
            p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_captures", f"final_v16_15_{uuid.uuid4().hex[:8]}.png")
            img.save(p); print(f"CAPTURED_FILE:{p}"); sys.stdout.flush(); time.sleep(0.5); self.destroy(); sys.exit(0)
        except Exception as e: messagebox.showerror("Error", f"저장 실패: {e}")

if __name__ == "__main__":
    try: HunterV16_15().mainloop()
    except Exception as e: debug_log(f"CRITICAL: {e}")
