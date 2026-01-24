import win32com.client as win32
import pythoncom
import win32gui
import win32con
import win32api
import time
import os
import threading
import pyautogui

def get_window_info(hwnd):
    return f"Title: {win32gui.GetWindowText(hwnd)}, Rect: {win32gui.GetWindowRect(hwnd)}, Class: {win32gui.GetClassName(hwnd)}"

def watchdog():
    print("[Watchdog] Started.")
    titles = ["보안", "한글", "Hwp"]
    while True:
        try:
            def callback(hwnd, results):
                if win32gui.IsWindowVisible(hwnd):
                    title = win32gui.GetWindowText(hwnd)
                    if any(t in title for t in titles):
                        rect = win32gui.GetWindowRect(hwnd)
                        w, h = rect[2]-rect[0], rect[3]-rect[1]
                        if w < 800 and h < 500:
                            results.append((hwnd, title, rect))
            
            detected = []
            win32gui.EnumWindows(callback, detected)
            for hwnd, title, rect in detected:
                print(f"[Watchdog] Detected: {title} ({rect})")
                # Try to take a screenshot of the DIALOG for manual inspection if it fails
                # (Skip for now to avoid complexity)
                
                # Activate and Send Keys
                try:
                    win32gui.SetForegroundWindow(hwnd)
                    time.sleep(0.2)
                    win32api.keybd_event(ord('A'), 0, 0, 0)
                    time.sleep(0.05)
                    win32api.keybd_event(ord('A'), 0, win32con.KEYEVENTF_KEYUP, 0)
                    print("[Watchdog] Sent 'A' to dialog.")
                    
                    # Also try Alt+A
                    win32api.keybd_event(win32con.VK_MENU, 0, 0, 0)
                    win32api.keybd_event(ord('A'), 0, 0, 0)
                    time.sleep(0.05)
                    win32api.keybd_event(ord('A'), 0, win32con.KEYEVENTF_KEYUP, 0)
                    win32api.keybd_event(win32con.VK_MENU, 0, win32con.KEYEVENTF_KEYUP, 0)
                    print("[Watchdog] Sent 'Alt+A' to dialog.")

                    # Click if still there
                    time.sleep(0.5)
                    if win32gui.IsWindowVisible(hwnd):
                        w, h = rect[2]-rect[0], rect[3]-rect[1]
                        # Try many points across bottom half
                        for x_off in [0.2, 0.4, 0.6, 0.8]:
                            for y_off in [0.7, 0.8, 0.9]:
                                cx = rect[0] + int(w * x_off)
                                cy = rect[1] + int(h * y_off)
                                win32api.SetCursorPos((cx, cy))
                                time.sleep(0.05)
                                win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, cx, cy, 0, 0)
                                time.sleep(0.05)
                                win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, cx, cy, 0, 0)
                        print("[Watchdog] Performed shotgun clicks.")
                except:
                    pass
        except:
            pass
        time.sleep(1.0)

def test_single():
    pythoncom.CoInitialize()
    threading.Thread(target=watchdog, daemon=True).start()
    
    print("[Test] Launching HWP...")
    hwp = win32.Dispatch("HWPFrame.HwpObject")
    hwp.XHwpWindows.Item(0).Visible = True
    
    abs_path = os.path.abspath("../temp_hml_splits/q_001.hml")
    print(f"[Test] Opening {abs_path}...")
    
    # Use a thread for Open to not block the main script if it refuses to dismiss
    def do_open():
        try:
            hwp.Open(abs_path, "", "forceopen:true")
            print("[Test] Open() completed successfully.")
        except Exception as e:
            print(f"[Test] Open() failed: {e}")

    t = threading.Thread(target=do_open)
    t.start()
    
    print("[Test] Waiting for Open()... (Max 30s)")
    t.join(30.0)
    if t.is_alive():
        print("[Test] Open() is still hung after 30s. HWP might be stuck in a modal.")
        # Take a screenshot to see what's on screen
        pyautogui.screenshot("stuck_state.png")
        print("[Test] Saved stuck_state.png")
    else:
        print("[Test] Open() finished thread.")

if __name__ == "__main__":
    test_single()
