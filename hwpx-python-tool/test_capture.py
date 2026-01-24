import pygetwindow as gw
import pyautogui
from PIL import Image
import time
import os

def test_capture():
    print("Searching for HWP window...")
    # Find HWP window (try different titles)
    titles = gw.getAllTitles()
    hwp_window = None
    for t in titles:
        if "빈 문서 1 - 한글" in t or "한글" in t:
            hwp_window = gw.getWindowsWithTitle(t)[0]
            print(f"Found window: {t}")
            break
            
    if not hwp_window:
        print("Error: HWP window not found. Please open HWP first.")
        return

    # Bring to front
    try:
        hwp_window.activate()
        time.sleep(1)
    except:
        print("Warning: Could not activate window. It might already be in focus.")

    # Capture window area
    left, top, width, height = hwp_window.left, hwp_window.top, hwp_window.width, hwp_window.height
    print(f"Capturing area: {left}, {top}, {width}, {height}")
    
    screenshot = pyautogui.screenshot(region=(left, top, width, height))
    
    # Save as artifact for verification
    save_path = os.path.abspath("baseline_hwp_capture.png")
    screenshot.save(save_path)
    print(f"Screenshot saved to: {save_path}")

if __name__ == "__main__":
    test_capture()
