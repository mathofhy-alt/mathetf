import win32com.client as win32
import pythoncom
import win32gui
import win32con
import win32api
import time
import os
import threading

def watchdog():
    titles = ["보안", "한글", "Hwp", "Action", "승인", "문서", "열기", "확인", "주의", "알림"]
    print("Watchdog: Started.")
    while True:
        try:
            def callback(hwnd, results):
                if win32gui.IsWindowVisible(hwnd):
                    t = win32gui.GetWindowText(hwnd)
                    if any(x in t for x in titles) and "한컴오피스" not in t:
                        results.append((hwnd, t))
            wins = []
            win32gui.EnumWindows(callback, wins)
            for hwnd, t in wins:
                print(f"Watchdog: Found dialog '{t}'. Dismissing...")
                for k in [win32con.VK_ESCAPE, win32con.VK_RETURN, ord('A'), ord('N')]:
                    win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, k, 0)
                    time.sleep(0.05)
        except: pass
        time.sleep(0.5)

threading.Thread(target=watchdog, daemon=True).start()

try:
    pythoncom.CoInitialize()
    hwp = win32.Dispatch("HWPFrame.HwpObject")
    hwp.XHwpWindows.Item(0).Visible = True
    time.sleep(2)
    
    path = r"C:\hwp_temp\q_001.hml"
    print(f"Testing path: {path}")
    
    print("Test 1: Standard Open starting...")
    res1 = hwp.Open(path, "HML", "")
    print(f"Test 1 (Standard) Result: {res1}")
    
    print("Test 2: Action Open starting...")
    pset = hwp.CreateSet("FileOpen")
    hwp.HAction.GetDefault("FileOpen", pset)
    pset.SetItem("FileName", path)
    pset.SetItem("Format", "HML")
    res2 = hwp.HAction.Execute("FileOpen", pset)
    print(f"Test 2 (Action) Result: {res2}")

except Exception as e:
    print(f"Error: {e}")

print("Diagnostic script finished.")
