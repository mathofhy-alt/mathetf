import win32gui
import win32con
import time
import threading
import win32com.client as win32
import pyautogui
import os

def inspect_and_save(hwnd):
    title = win32gui.GetWindowText(hwnd)
    print(f"\nFinal Inspection of HWND: {hwnd} ('{title}')")
    rect = win32gui.GetWindowRect(hwnd)
    w, h = rect[2]-rect[0], rect[3]-rect[1]
    print(f"Rect: {rect} ({w}x{h})")
    
    # Save screenshot of dialog
    shot = pyautogui.screenshot(region=(rect[0], rect[1], w, h))
    shot.save("blocking_dialog_debug.png")
    print(f"Saved 'blocking_dialog_debug.png'")

    def callback(child_hwnd, results):
        t = win32gui.GetWindowText(child_hwnd)
        c = win32gui.GetClassName(child_hwnd)
        results.append((child_hwnd, t, c))
    
    children = []
    win32gui.EnumChildWindows(hwnd, callback, children)
    for ch, t, c in children:
        print(f"  Child: '{t}' (Class: {c})")

def watchdog():
    found = False
    start_time = time.time()
    while not found and (time.time() - start_time < 10):
        def callback(hwnd, results):
            if win32gui.IsWindowVisible(hwnd):
                t = win32gui.GetWindowText(hwnd)
                if t == "한글" or "보안" in t:
                    results.append(hwnd)
        wins = []
        win32gui.EnumWindows(callback, wins)
        for hwnd in wins:
            inspect_and_save(hwnd)
            found = True
        time.sleep(0.5)

threading.Thread(target=watchdog, daemon=True).start()

try:
    os.system("taskkill /F /IM Hwp.exe /T >nul 2>&1")
    time.sleep(1.5)
    hwp = win32.Dispatch("HWPFrame.HwpObject")
    hwp.XHwpWindows.Item(0).Visible = True
    print("Opening file...")
    hwp.Open(r"C:\hwp_temp\q_001.hml", "HML", "")
except Exception as e:
    print(f"Error: {e}")

time.sleep(5)
print("Done.")
