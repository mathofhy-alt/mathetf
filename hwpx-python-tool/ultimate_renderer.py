import win32com.client as win32
import pythoncom
import win32gui
import win32con
import win32api
import time
import os
import threading
import pyautogui
import cv2
import numpy as np
import ctypes
import glob
import shutil
import win32process

# DPI Awareness
try: ctypes.windll.shcore.SetProcessDpiAwareness(1)
except: 
    try: ctypes.windll.user32.SetProcessDPIAware()
    except: pass

class UltimateRenderer:
    def __init__(self):
        self.hwp = None
        self.output_dir = "question_images_v29"
        self.temp_dir = r"C:\hwp_temp"
        self.hnc_hwp_temp = os.path.join(os.environ["LOCALAPPDATA"], "Temp", "Hnc", "Hwp")
        if not os.path.exists(self.output_dir): os.mkdir(self.output_dir)
        if not os.path.exists(os.path.join(self.output_dir, "main")): os.mkdir(os.path.join(self.output_dir, "main"))
        if not os.path.exists(os.path.join(self.output_dir, "comment")): os.mkdir(os.path.join(self.output_dir, "comment"))
        if not os.path.exists(self.temp_dir): os.mkdir(self.temp_dir)

    def _log(self, msg): print(f"[Ultimate] {msg}")

    def purge_hwp_temp(self):
        """Clears HWP's auto-save and lock files to prevent recovery prompts."""
        if os.path.exists(self.hnc_hwp_temp):
            try:
                for f in os.listdir(self.hnc_hwp_temp):
                    path = os.path.join(self.hnc_hwp_temp, f)
                    try:
                        if os.path.isfile(path): os.remove(path)
                        elif os.path.isdir(path): shutil.rmtree(path)
                    except: pass
                # self._log("Purged HWP temp artifacts.")
            except: pass

    def find_hwp_window(self, target_id=None):
        def callback(hwnd, results):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                class_name = win32gui.GetClassName(hwnd)
                if "한컴오피스" in title or "HwpApp" in class_name or "HwpFrame" in class_name:
                    rect = win32gui.GetWindowRect(hwnd)
                    if rect[2]-rect[0] > 600:
                        score = 0
                        if target_id and target_id in title: score += 100
                        if ".asv" not in title.lower(): score += 50
                        if "한글" in title: score += 10
                        results.append((hwnd, score, title, class_name))
        wins = []
        win32gui.EnumWindows(callback, wins)
        if not wins: 
            # Log all visible windows for diagnostics
            # all_wins = []
            # win32gui.EnumWindows(lambda h, r: r.append(win32gui.GetWindowText(h)) if win32gui.IsWindowVisible(h) else None, all_wins)
            # self._log(f"No HWP windows found. Visible windows: {all_wins[:10]}...")
            return None
        
        wins.sort(key=lambda x: x[1], reverse=True)
        # self._log(f"Found windows: {[(w[2], w[1]) for w in wins[:3]]}")
        return wins[0][0]

    def clean_clutter(self, target_id):
        """Closes any HWP windows that are not the target document."""
        def callback(hwnd, results):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                if ("한컴오피스" in title or "HwpApp" in win32gui.GetClassName(hwnd)) and target_id not in title:
                    # Don't close the main app if it's the only one, but here we expect stacking
                    results.append(hwnd)
        wins = []
        win32gui.EnumWindows(callback, wins)
        for hwnd in wins:
            try:
                # Post WM_CLOSE to be graceful but firm
                win32gui.PostMessage(hwnd, win32con.WM_CLOSE, 0, 0)
                time.sleep(0.1)
            except: pass

    def watchdog(self):
        titles = ["보안", "한글", "Hwp", "Action", "승인", "문서", "열기", "확인", "복구", "업데이트", "알림", "저장"]
        while True:
            try:
                def callback(hwnd, results):
                    if win32gui.IsWindowVisible(hwnd):
                        t = win32gui.GetWindowText(hwnd)
                        if any(x in t for x in titles) and "한컴오피스 한글 -" not in t and len(t) < 55:
                            results.append(hwnd)
                wins = []
                win32gui.EnumWindows(callback, wins)
                for hwnd in wins:
                    try:
                        win32gui.SetForegroundWindow(hwnd)
                        # 'A' for Always Allow
                        win32api.keybd_event(ord('A'), 0, 0, 0)
                        time.sleep(0.05)
                        win32api.keybd_event(ord('A'), 0, win32con.KEYEVENTF_KEYUP, 0)
                        
                        # 'N' for No / Don't Save / No Recovery
                        time.sleep(0.1)
                        win32api.keybd_event(ord('N'), 0, 0, 0)
                        time.sleep(0.05)
                        win32api.keybd_event(ord('N'), 0, win32con.KEYEVENTF_KEYUP, 0)
                        
                        time.sleep(0.1)
                        win32api.keybd_event(win32con.VK_RETURN, 0, 0, 0)
                        time.sleep(0.05)
                        win32api.keybd_event(win32con.VK_RETURN, 0, win32con.KEYEVENTF_KEYUP, 0)
                        time.sleep(0.3)
                    except: pass
            except: pass
            time.sleep(0.5)

    def capture(self, hml_path):
        q_id = os.path.basename(hml_path).replace(".hml", "")
        self._log(f"[{q_id}] Starting...")
        try:
            temp_path = os.path.join(self.temp_dir, f"{q_id}.hml")
            shutil.copy2(hml_path, temp_path)
            
            # Simulated Open
            os.startfile(temp_path)
            
            # Polling for HWP Window
            hwnd = None
            for i in range(15): # Up to 15 seconds
                hwnd = self.find_hwp_window(q_id)
                if hwnd: break
                time.sleep(1.0)
            
            if not hwnd: 
                hwnd = self.find_hwp_window()
                if not hwnd:
                    self._log(f"[{q_id}] Window not found after 15s.")
                    return False
            
            # Attach to HWP COM
            pythoncom.CoInitialize()
            try:
                self.hwp = win32.GetActiveObject("HWPFrame.HwpObject")
            except:
                self.hwp = win32.Dispatch("HWPFrame.HwpObject")
            
            # Use Clear(1) to definitely discard anything
            try: self.hwp.Clear(1) 
            except: pass
            
            # Open the file again via COM to be sure if possible, 
            # but os.startfile already did it. Just ensure it's loaded.
            
            # Close stray recovery windows
            self.clean_clutter(q_id)
            time.sleep(1.0)
            
            hwnd = self.find_hwp_window(q_id)
            if not hwnd: return False
            
            win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
            try: 
                win32gui.SetWindowPos(hwnd, win32con.HWND_TOPMOST, 0,0,0,0, win32con.SWP_NOMOVE | win32con.SWP_NOSIZE)
                time.sleep(0.1)
                win32gui.SetWindowPos(hwnd, win32con.HWND_NOTOPMOST, 0,0,0,0, win32con.SWP_NOMOVE | win32con.SWP_NOSIZE)
                win32gui.SetForegroundWindow(hwnd)
            except: pass
            time.sleep(1.0)
            
            # ZOOM + VIEW
            for _ in range(3):
                try:
                    pset = self.hwp.CreateSet("ViewProperties")
                    self.hwp.HAction.GetDefault("ViewProperties", pset)
                    pset.SetItem("ZoomRate", 300)
                    pset.SetItem("ZoomType", 0)
                    self.hwp.HAction.Execute("ViewProperties", pset)
                    self.hwp.HAction.Run("ViewShowParaGraphNone")
                    self.hwp.HAction.Run("ViewGridNone")
                    time.sleep(0.5)
                    break
                except:
                    time.sleep(0.5)
            
            pyautogui.hotkey('ctrl', 'home')
            time.sleep(2.5) # Initial wait for rendering
            
            img = None
            found = False
            x_min, y_min, x_max, y_max = 0, 0, 0, 0
            
            for attempt in range(4): # Up to 4 checks (Initial + 3 retries)
                rect = win32gui.GetWindowRect(hwnd)
                w, h = rect[2]-rect[0], rect[3]-rect[1]
                screenshot = pyautogui.screenshot(region=(rect[0], rect[1], w, h))
                img = cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2BGR)
                
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                _, thresh = cv2.threshold(gray, 235, 255, cv2.THRESH_BINARY_INV)
                
                # V29: Drop safe_y for commentary as it has no headers
                target_safe_y = 150 if "_comment" in q_id else 275
                safe_x = 80
                contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                
                x_min, y_min, x_max, y_max = w, h, 0, 0
                found_local = False
                for cnt in contours:
                    x, y, cw, ch = cv2.boundingRect(cnt)
                    if cw < 3 or ch < 3: continue
                    if cw > w * 0.9 or ch > h * 0.9: continue
                    if x < safe_x or y < target_safe_y: continue
                    if x > w - 60 or y > h - 45: continue
                    found_local = True
                    x_min, y_min = min(x_min, x), min(y_min, y)
                    x_max, y_max = max(x_max, x+cw), max(y_max, y+ch)
                
                if found_local:
                    found = True
                    break
                else:
                    self._log(f"[{q_id}] Blank detected. Waiting for render (Attempt {attempt+1}/4)...")
                    time.sleep(2.0)
                    # Force repaint if possible
                    pyautogui.press('pageup')
                    time.sleep(0.2)
                    pyautogui.press('pagedown')
                    time.sleep(1.0)
                    pyautogui.hotkey('ctrl', 'home')
                    time.sleep(1.0)

            if found:
                margin = 60
                final = img[max(0, y_min-margin):min(h, y_max+margin), max(0, x_min-margin):min(w, x_max+margin)]
                
                # V29: Route to subfolder
                subfolder = "main" if "_main" in q_id else "comment"
                save_name = q_id.replace("_main", "").replace("_comment", "")
                save_path = os.path.join(self.output_dir, subfolder, f"{save_name}.png")
                
                cv2.imwrite(save_path, final)
                self._log(f"[{q_id}] SUCCESS -> {subfolder}.")
                try: self.hwp.Clear(1) # Discard before close
                except: pass
                return True
            else:
                self._log(f"[{q_id}] DETECTION FAILED after retries.")
                subfolder = "main" if "_main" in q_id else "comment"
                cv2.imwrite(os.path.join(self.output_dir, subfolder, f"{q_id}_fail.png"), img)
                return False
        except Exception as e:
            self._log(f"[{q_id}] Error: {e}")
            return False

if __name__ == "__main__":
    renderer = UltimateRenderer()
    renderer.purge_hwp_temp()
    threading.Thread(target=renderer.watchdog, daemon=True).start()
    files = sorted(glob.glob("../temp_hml_splits/q_*.hml"))
    
    for f in files:
        os.system("taskkill /F /IM Hwp.exe /T >nul 2>&1")
        time.sleep(1.0)
        renderer.purge_hwp_temp()
        renderer.capture(f)
        time.sleep(0.5)
