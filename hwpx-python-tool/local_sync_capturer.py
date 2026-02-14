import os
import sys
import time
import json
import uuid
import tkinter as tk
from tkinter import ttk, messagebox
import threading
import subprocess

# [CRITICAL] Try importing supabase
try:
    from supabase import create_client, Client
except ImportError:
    # Fallback to direct sub-packages if top-level 'supabase' failed to build from source
    try:
        from postgrest import SyncPostgrestClient
        from storage3 import SyncStorageClient
        from gotrue import SyncGoTrueClient
        print("Using direct sub-packages (fallback mode)")
        # We will wrap this in a fake Client-like object for minimal code change
        class FakeClient:
            def __init__(self, url, key):
                self.table = lambda name: SyncPostgrestClient(f"{url}/rest/v1", headers={"apikey": key, "Authorization": f"Bearer {key}"}).from_(name)
                self.storage = SyncStorageClient(f"{url}/storage/v1", headers={"apikey": key, "Authorization": f"Bearer {key}"})
        create_client = lambda url, key: FakeClient(url, key)
        Client = object
    except ImportError:
        print("Error: Required packages not found. Run 'pip install supabase' or sub-packages.")
        # sys.exit(1)
        pass

class LocalSyncCapturer(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("수학ETF 로컬 캡처 헬퍼 v1.0")
        self.geometry("900x700")
        
        # Load Env
        self.load_env()
        
        # UI Setup
        self.setup_ui()
        
        # Supabase Init
        try:
            self.supabase: Client = create_client(self.supabase_url, self.supabase_key)
        except Exception as e:
            messagebox.showerror("Supabase 에러", f"Supabase 연결 실패: {e}")
            sys.exit(1)
        
        # State
        self.questions = []
        self.selected_q = None
        
        # Initial Load
        self.refresh_list()

    def load_env(self):
        # Parent directory's .env.local
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local")
        self.supabase_url = ""
        self.supabase_key = ""
        
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
                        self.supabase_url = line.split("=")[1].strip()
                    if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                        self.supabase_key = line.split("=")[1].strip()
        
        if not self.supabase_url or not self.supabase_key:
            messagebox.showerror("설정 에러", ".env.local 파일에서 URL/KEY를 찾을 수 없습니다.")
            sys.exit(1)

    def setup_ui(self):
        # Layout
        main_paned = ttk.PanedWindow(self, orient=tk.HORIZONTAL)
        main_paned.pack(fill="both", expand=True)

        # Left Panel: Question List
        list_frame = ttk.Frame(main_paned, padding=10)
        main_paned.add(list_frame, weight=3)
        
        ttk.Label(list_frame, text="📦 미캡처 문제 목록 (unsorted)", font=("Malgun Gothic", 12, "bold")).pack(anchor="w", pady=(0, 10))
        
        columns = ("ID", "Num", "Q", "S", "Status")
        self.tree = ttk.Treeview(list_frame, columns=columns, show="headings")
        self.tree.heading("ID", text="DB ID")
        self.tree.heading("Num", text="번호")
        self.tree.heading("Q", text="문제")
        self.tree.heading("S", text="해설")
        self.tree.heading("Status", text="상태")
        self.tree.column("ID", width=120)
        self.tree.column("Num", width=50)
        self.tree.column("Q", width=40, anchor="center")
        self.tree.column("S", width=40, anchor="center")
        self.tree.column("Status", width=80)
        
        scrollbar = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscroll=scrollbar.set)
        
        self.tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        self.tree.bind("<<TreeviewSelect>>", self.on_select)
        
        # Right Panel: Control
        ctrl_frame = ttk.Frame(main_paned, padding=20)
        main_paned.add(ctrl_frame, weight=2)
        
        self.info_card = ttk.LabelFrame(ctrl_frame, text="선택된 문제 정보", padding=15)
        self.info_card.pack(fill="x", pady=(0, 20))
        
        self.lbl_id = ttk.Label(self.info_card, text="ID: -")
        self.lbl_id.pack(anchor="w")
        self.lbl_num = ttk.Label(self.info_card, text="번호: -", font=("Malgun Gothic", 11, "bold"))
        self.lbl_num.pack(anchor="w", pady=5)
        
        # Action Buttons
        ttk.Label(ctrl_frame, text="🎯 캡처 작업", font=("Malgun Gothic", 10, "bold")).pack(anchor="w", pady=(10, 5))
        
        self.btn_q = tk.Button(ctrl_frame, text="📷 문제 영역 캡처", state="disabled", command=lambda: self.start_capture("question"),
                               bg="#2563eb", fg="white", font=("Malgun Gothic", 11, "bold"), pady=12)
        self.btn_q.pack(fill="x", pady=5)
        
        self.btn_s = tk.Button(ctrl_frame, text="💡 해설 영역 캡처", state="disabled", command=lambda: self.start_capture("solution"),
                               bg="#059669", fg="white", font=("Malgun Gothic", 11, "bold"), pady=12)
        self.btn_s.pack(fill="x", pady=5)
        
        ttk.Separator(ctrl_frame, orient=tk.HORIZONTAL).pack(fill="x", pady=20)
        
        tk.Button(ctrl_frame, text="🔄 목록 새로고침", command=self.refresh_list, bg="#f3f4f6", pady=8).pack(fill="x")
        
        # Bottom Status
        self.status = tk.StringVar(value="준비됨")
        status_bar = ttk.Label(self, textvariable=self.status, relief=tk.SUNKEN, anchor=tk.W, padding=5)
        status_bar.pack(side="bottom", fill="x")

    def refresh_list(self):
        self.status.set("서버에서 목록 불러오는 중...")
        def task():
            try:
                # Fetch questions with their image info to check Q/S status
                res = self.supabase.table("questions").select("id, question_number, work_status, question_images(original_bin_id)").eq("work_status", "unsorted").order("question_number").execute()
                self.questions = res.data
                self.after(0, self.update_tree)
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Error", f"목록 로드 실패: {e}"))
        threading.Thread(target=task, daemon=True).start()

    def update_tree(self):
        for i in self.tree.get_children(): self.tree.delete(i)
        for q in self.questions:
            imgs = q.get('question_images', [])
            has_q = any(img.get('original_bin_id', '').startswith('MANUAL_Q_') for img in imgs)
            has_s = any(img.get('original_bin_id', '').startswith('MANUAL_S_') for img in imgs)
            q_mark = "✅" if has_q else "-"
            s_mark = "✅" if has_s else "-"
            self.tree.insert("", "end", values=(q['id'], q['question_number'], q_mark, s_mark, q['work_status']))
        self.status.set(f"총 {len(self.questions)}개의 작업 대기 중")

    def on_select(self, event):
        sel = self.tree.selection()
        if not sel: return
        item = self.tree.item(sel[0])
        val = item['values']
        self.selected_q = {'id': val[0], 'number': val[1]}
        self.lbl_id.config(text=f"ID: {self.selected_q['id']}")
        self.lbl_num.config(text=f"번호: {self.selected_q['number']}번")
        self.btn_q.config(state="normal")
        self.btn_s.config(state="normal")

    def start_capture(self, mode):
        if not self.selected_q: return
        self.status.set(f"[{mode}] 캡처 엔진 가동 중...")
        self.btn_q.config(state="disabled")
        self.btn_s.config(state="disabled")
        
        def run_engine():
            try:
                python_exe = sys.executable
                proc = subprocess.Popen([python_exe, 'manual_capturer.py'], stdout=subprocess.PIPE, text=True, cwd=os.getcwd())
                stdout, _ = proc.communicate()
                if "CAPTURED_FILE:" in stdout:
                    path = stdout.split("CAPTURED_FILE:")[1].split('\n')[0].strip()
                    self.after(0, lambda: self.confirm_and_upload(path, mode))
                else:
                    self.after(0, lambda: self.status.set("캡처가 취소되었습니다."))
                    self.after(0, self.reset_buttons)
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Engin Error", f"캡처 엔진 실행 실패: {e}"))
                self.after(0, self.reset_buttons)
        threading.Thread(target=run_engine, daemon=True).start()

    def reset_buttons(self):
        self.btn_q.config(state="normal")
        self.btn_s.config(state="normal")

    def confirm_and_upload(self, path, mode):
        self.status.set(f"[{mode}] 업로드 중...")
        def upload_task():
            try:
                import time
                timestamp = int(time.time() * 1000)
                q_id = self.selected_q['id']
                file_ext = "png"
                
                # Naming matching web app: manual_captures/{questionId}_{captureType}_{timestamp}.png
                storage_filename = f"manual_captures/{q_id}_{mode}_{timestamp}.{file_ext}"
                
                # 1. Storage Upload (Bucket: 'hwpx')
                with open(path, "rb") as f:
                    file_bytes = f.read()
                    self.supabase.storage.from_("hwpx").upload(
                        path=storage_filename,
                        file=file_bytes,
                        file_options={"content-type": "image/png"}
                    )
                
                # 2. Get Public URL
                public_url = self.supabase.storage.from_("hwpx").get_public_url(storage_filename)
                
                # 3. Insert into question_images table
                # Web app logic: MANUAL_Q_ or MANUAL_S_ prefix in original_bin_id
                prefix = 'MANUAL_S_' if mode == 'solution' else 'MANUAL_Q_'
                original_bin_id = f"{prefix}{timestamp}"
                
                self.supabase.table("question_images").insert({
                    "question_id": q_id,
                    "original_bin_id": original_bin_id,
                    "format": file_ext,
                    "data": public_url, # Store the URL here as per web app
                    "size_bytes": len(file_bytes)
                }).execute()
                
                self.after(0, lambda: self.status.set(f"✅ {mode} 업로드 완료"))
                self.after(0, self.reset_buttons)
                # Auto-refresh to show status
                self.after(500, self.refresh_list)
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Upload Error", f"업로드 실패: {e}"))
                self.after(0, self.reset_buttons)
        threading.Thread(target=upload_task, daemon=True).start()

if __name__ == "__main__":
    # Check dependencies first
    try:
        import supabase
    except ImportError:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("라이브러리 부족", "필요한 라이브러리가 없습니다.\n터미널에서 'pip install supabase'를 실행해 주세요.")
        sys.exit(1)
        
    app = LocalSyncCapturer()
    app.mainloop()
