import win32gui

def callback(hwnd, results):
    if win32gui.IsWindowVisible(hwnd):
        results.append((hwnd, win32gui.GetWindowText(hwnd), win32gui.GetClassName(hwnd)))

windows = []
win32gui.EnumWindows(callback, windows)

print("--- ALL VISIBLE WINDOWS ---")
for hwnd, title, classname in sorted(windows, key=lambda x: x[1]):
    if title or classname:
        print(f"HWND: {hwnd} | Title: [{title}] | Class: {classname}")
