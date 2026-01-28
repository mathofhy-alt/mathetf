
import cv2
import numpy as np
import os

def diagnose():
    if not os.path.exists("last_capture.png"):
        print("FAIL: last_capture.png not found")
        return

    img = cv2.imread("last_capture.png")
    if img is None:
        print("FAIL: Could not load image")
        return

    print(f"Image Shape: {img.shape}")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Check stats
    mn, mx, mean, std = cv2.minMaxLoc(gray)[0], cv2.minMaxLoc(gray)[1], np.mean(gray), np.std(gray)
    print(f"Stats - Min: {mn}, Max: {mx}, Mean: {mean:.2f}, StdDev: {std:.2f}")

    if std < 5.0:
        print("FAIL: Image has very low contrast (solid color?). Capture timing issue?")
        return

    # 1. OTSU
    _, bin_otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    cnts_otsu, _ = cv2.findContours(bin_otsu, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    print(f"Method 1 (Otsu): Found {len(cnts_otsu)} contours")

    # 2. Adaptive
    bin_adapt = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 4)
    cnts_adapt, _ = cv2.findContours(bin_adapt, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    print(f"Method 2 (Adaptive): Found {len(cnts_adapt)} contours")

    # 3. Canny
    edges = cv2.Canny(gray, 50, 150)
    cnts_canny, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    print(f"Method 3 (Canny): Found {len(cnts_canny)} contours")

if __name__ == "__main__":
    diagnose()
