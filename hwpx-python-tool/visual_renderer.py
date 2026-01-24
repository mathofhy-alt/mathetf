import win32com.client as win32
import pythoncom
import pygetwindow as gw
import pyautogui
import cv2
import numpy as np
from PIL import Image
import os
import time
import glob
import threading
import win32gui
import win32con
import win32api
import ctypes

# Enable DPI awareness to get correct window coordinates
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(1) # 1 = DPI_AWARE
except:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except:
        pass

# Win32 API helpers for robust focus and input
def force_foreground(hwnd):
    """Force a window to the foreground, bypassing common restrictions."""
    try:
        current_thread = win32api.GetCurrentThreadId()
        foreground_thread = win32gui.GetWindowThreadProcessId(win32gui.GetForegroundWindow())[0]
        if current_thread != foreground_thread:
            ctypes.windll.user32.AttachThreadInput(foreground_thread, current_thread, True)
            win32gui.SetForegroundWindow(hwnd)
            win32gui.BringWindowToTop(hwnd)
            ctypes.windll.user32.AttachThreadInput(foreground_thread, current_thread, False)
        else:
            win32gui.SetForegroundWindow(hwnd)
    except:
        pass

def find_hwp_window():
    """Finds the main HWP window using multiple possible class names and title patterns."""
    classes = ["HwpFrameClass", "HwpApp", "HwpApp : 9.0"]
    for cls in classes:
        hwnd = win32gui.FindWindow(cls, None)
        if hwnd:
            title = win32gui.GetWindowText(hwnd).lower()
            if "한글" in title or "hwp" in title:
                return hwnd
    
    # Fallback: search all windows for title pattern
    def enum_cb(hwnd, results):
        if win32gui.IsWindowVisible(hwnd):
            title = win32gui.GetWindowText(hwnd).lower()
            if "한컴오피스 한글" in title or ("- 한글" in title and "HwpApp" in win32gui.GetClassName(hwnd)):
                results.append(hwnd)
    
    results = []
    win32gui.EnumWindows(enum_cb, results)
    return results[0] if results else None

class VisualRenderer:
    def __init__(self, zoom=300):
        self.hwp = None
        self.zoom = zoom
        self.output_dir = "question_images_v28"
        if not os.path.exists(self.output_dir):
            os.mkdir(self.output_dir)
        self._stop_watchdog = False

    def _log(self, msg):
        print(f"[VisualRenderer] {msg}")

    def security_watchdog(self):
        """Monitors for HWP security dialogs and clips them."""
        self._log("Watchdog: Started monitoring for security dialogs.")
        
        # Dial titles gathered from observation (including partials)
        titles = ["보안 승인", "한컴오피스 한글 보안 승인", "Action Security", "한글", "Hwp"]
        # Classes to ignore (Main HWP window)
        ignore_classes = ["HwpFrameClass", "HwpApp", "HwpApp : 9.0"]
        
        while not self._stop_watchdog:
            try:
                def enum_callback(hwnd, results):
                    if win32gui.IsWindowVisible(hwnd):
                        title = win32gui.GetWindowText(hwnd)
                        class_name = win32gui.GetClassName(hwnd)
                        
                        # Only target dialogs, not the main app
                        if class_name in ignore_classes:
                            return
                            
                        if any(t in title for t in titles) or class_name == "HNC_DIALOG":
                            rect = win32gui.GetWindowRect(hwnd)
                            w, h = rect[2] - rect[0], rect[3] - rect[1]
                            # Security dialogs are typically small
                            if 50 < w < 800 and 50 < h < 500:
                                results.append((hwnd, title, rect))
                
                detected = []
                win32gui.EnumWindows(enum_callback, detected)

                for hwnd, title, rect in detected:
                    # Skip main HWP window (it often has '한글' in title)
                    w, h = rect[2]-rect[0], rect[3]-rect[1]
                    if w > 800 and h > 600:
                        continue

                    # self._log(f"Watchdog: Trapped dialog '{title}' ({w}x{h})")
                    
                    # 1. Direct key signaling (No focus required)
                    # Send 'A' (VK_A) to the window directly
                    win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, ord('A'), 0)
                    time.sleep(0.05)
                    win32gui.PostMessage(hwnd, win32con.WM_KEYUP, ord('A'), 0xC0000001)
                    
                    # 2. Try Alt+A signalling
                    win32gui.PostMessage(hwnd, win32con.WM_SYSKEYDOWN, ord('A'), 0x20000001)
                    time.sleep(0.05)
                    win32gui.PostMessage(hwnd, win32con.WM_SYSKEYUP, ord('A'), 0xE0000001)

                    # 3. Focus and Keyboard Strategy (PyAutoGUI)
                    try:
                        force_foreground(hwnd)
                        pyautogui.press('a')
                        pyautogui.hotkey('alt', 'a')
                    except: pass
                    
                    # 4. Click Strategy (Coordinates based on 612x158 typical size)
                    # "Always Allow" is usually the 2nd button in the row.
                    # Middle area ~45% width, 80% height.
                    click_x = rect[0] + int(w * 0.45)
                    click_y = rect[1] + int(h * 0.8)
                    pyautogui.click(click_x, click_y)
                    
                    # 5. ESC fallback for other popups
                    time.sleep(0.2)
                    if win32gui.IsWindowVisible(hwnd):
                        win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_ESCAPE, 0)

            except Exception as e:
                pass
            time.sleep(1.0)

    def init_hwp(self):
        try:
            pythoncom.CoInitialize()
            
            # Start/Restart Watchdog thread
            self._stop_watchdog = False
            self.watchdog_thread = threading.Thread(target=self.security_watchdog, daemon=True)
            self.watchdog_thread.start()
            
            self._log("Ensuring fresh HWP instance...")
            try:
                os.system("taskkill /F /IM Hwp.exe /T")
                time.sleep(2.0)
            except: pass

            for i in range(3):
                try:
                    self.hwp = win32.Dispatch("HWPFrame.HwpObject")
                    # Register module to bypass file path security alerts
                    self.hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
                    self._log(f"Hwp instance launched (Attempt {i+1}).")
                    break
                except:
                    time.sleep(2.0)
            
            if not self.hwp: return False
            
            # Make visible and Maximize
            self.hwp.XHwpWindows.Item(0).Visible = True
            time.sleep(1.0)
            
            hwnd = find_hwp_window()
            if hwnd:
                win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
                self._log(f"HWP window maximized (HWND: {hwnd}, Class: {win32gui.GetClassName(hwnd)})")
            else:
                self._log("HWP window NOT found after launch!")

            # Setup View - Zoom 300%
            try:
                self.hwp.XHwpWindows.Item(0).ZoomRate = self.zoom
            except:
                pset = self.hwp.CreateSet("ViewProperties")
                self.hwp.HAction.GetDefault("ViewProperties", pset)
                pset.SetItem("ZoomRate", self.zoom)
                pset.SetItem("ZoomType", 0)
                self.hwp.HAction.Execute("ViewProperties", pset)
            
            self.hwp.HAction.Run("ViewGridNone")
            self.hwp.HAction.Run("ViewShowParaGraphNone")
            
            return True
        except Exception as e:
            self._log(f"Init Error: {e}")
            return False

    def capture_question(self, hml_path):
        max_retries = 2
        for attempt in range(max_retries):
            try:
                filename = os.path.basename(hml_path)
                q_id = filename.replace(".hml", "")
                
                try: self.hwp.Clear(1)
                except:
                    if not self.init_hwp(): return False

                abs_path = os.path.abspath(hml_path)
                self._log(f"[{q_id}] Opening: {abs_path}")
                
                # We wrap Open in a thread to prevent hanging if a modal blocks
                # But COM is tricky, so we'll just rely on the watchdog and a longer sleep
                try:
                    self.hwp.Open(abs_path, "", "forceopen:true|forceopen_readonly:true")
                except Exception as e:
                    self._log(f"Open failed for {q_id}: {e}")
                    if not self.init_hwp(): return False
                    self.hwp.Open(abs_path, "", "forceopen:true")
                
                # Wait for open and render
                time.sleep(3.5) 
                
                hwnd = find_hwp_window()
                if not hwnd:
                    self._log(f"[{q_id}] Error: HWP window disappear!")
                    continue
                
                self._log(f"[{q_id}] Focus, align and re-zoom...")
                force_foreground(hwnd)
                time.sleep(1.0)
                
                # Re-apply zoom in case Open reset it
                try:
                    self.hwp.XHwpWindows.Item(0).ZoomRate = self.zoom
                except:
                    pset = self.hwp.CreateSet("ViewProperties")
                    self.hwp.HAction.GetDefault("ViewProperties", pset)
                    pset.SetItem("ZoomRate", self.zoom)
                    pset.SetItem("ZoomType", 0)
                    self.hwp.HAction.Execute("ViewProperties", pset)
                
                # Align content to top
                pyautogui.hotkey('ctrl', 'home')
                time.sleep(1.5) # Wait a bit longer for HWP UI to settle
                
                # Take maximized screenshot
                rect = win32gui.GetWindowRect(hwnd)
                # Note: rect is (left, top, right, bottom)
                w_rect, h_rect = rect[2]-rect[0], rect[3]-rect[1]
                self._log(f"Window Rect: {rect} (Width: {w_rect}, Height: {h_rect})")
                
                screenshot = pyautogui.screenshot(region=(rect[0], rect[1], w_rect, h_rect))
                
                # Processing
                img_np = cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2BGR)
                gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)
                # Adaptive/Otsu could be better but let's stick to a robust manual thresh
                _, thresh = cv2.threshold(gray, 252, 255, cv2.THRESH_BINARY_INV)
                contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                
                if not contours:
                    self._log(f"No content found for {q_id}. Saving debug fail image.")
                    screenshot.save(f"{self.output_dir}/{q_id}_fail_no_content.png")
                    continue
                    
                x_min, y_min = w_rect, h_rect
                x_max, y_max = 0, 0
                
                # Toolbar is typically top 25-30% of a maximized window
                ignore_y_limit = int(h_rect * 0.25) 
                
                content_found = False
                for cnt in contours:
                    x, y, cw, ch = cv2.boundingRect(cnt)
                    if cw < 3 or ch < 3: continue
                    if y < ignore_y_limit: continue 
                    
                    content_found = True
                    x_min, y_min = min(x_min, x), min(y_min, y)
                    x_max, y_max = max(x_max, x+cw), max(y_max, y+ch)

                if not content_found or x_max <= x_min or y_max <= y_min:
                    self._log(f"Invalid crop for {q_id}. Content might be in toolbar area or hidden.")
                    # Save a debug image showing why it failed (with the toolbar limit marked)
                    debug_fail = img_np.copy()
                    cv2.line(debug_fail, (0, ignore_y_limit), (w_rect, ignore_y_limit), (0, 0, 255), 2)
                    cv2.imwrite(f"{self.output_dir}/{q_id}_fail_visual_debug.png", debug_fail)
                    continue
                    
                # Success: save a debug overlay first
                debug_img = img_np.copy()
                cv2.rectangle(debug_img, (x_min, y_min), (x_max, y_max), (0, 255, 0), 2)
                cv2.line(debug_img, (0, ignore_y_limit), (w_rect, ignore_y_limit), (0, 0, 255), 1)
                cv2.imwrite(f"{self.output_dir}/{q_id}_debug_overlay.png", debug_img)

                margin = 35
                x_min, y_min = max(0, x_min-margin), max(0, y_min-margin)
                x_max, y_max = min(w_rect, x_max+margin), min(h_rect, y_max+margin)
                
                cropped = img_np[y_min:y_max, x_min:x_max]
                output_path = os.path.join(self.output_dir, f"{q_id}.png")
                cv2.imwrite(output_path, cropped)
                self._log(f"Captured: {output_path} ({cropped.shape[1]}x{cropped.shape[0]})")
                return True

            except Exception as e:
                self._log(f"Fatal error capturing {hml_path}: {e}")
                self.hwp = None # Reset
                time.sleep(2.0)
        return False

if __name__ == "__main__":
    renderer = VisualRenderer(zoom=300)
    if renderer.init_hwp():
        hml_files = sorted(glob.glob("../temp_hml_splits/q_001_*.hml"))
        print(f"Starting batch visual capture for {len(hml_files)} files...")
        success_count = 0
        for i, f in enumerate(hml_files):
            print(f"[{i+1}/{len(hml_files)}] {f}")
            if renderer.capture_question(f):
                success_count += 1
            # Small delay between files for UI stability
            time.sleep(0.5)
        
        print(f"Batch complete. Success: {success_count}/{len(hml_files)}")
