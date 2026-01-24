import tkinter as tk
import cv2
import numpy as np
import os
import time
import win32gui
from PIL import Image, ImageGrab
import uuid
import sys
from ctypes import windll

# [CRITICAL] 윈도우 DPI 정책 강제 설정 - 좌표 어긋남 방지
try:
    windll.user32.SetProcessDPIAware()
except:
    pass

class UltimateHunterV9:
    def __init__(self):
        # 0. 런처 UI (창 조절 금지 고지)
        self.root = tk.Tk()
        self.root.title("Hunter v9 - No Touch & Vision")
        self.root.attributes("-topmost", True)
        self.root.geometry("480x240+100+100")
        
        main = tk.Frame(self.root, padx=20, pady=20)
        main.pack(expand=True, fill="both")

        text = (
            "⚠️ 주의: 한글 창 크기를 절대 변경하지 않습니다.\n"
            "1. 문제를 화면에 띄우고 스크롤을 멈추세요.\n"
            "2. 아래 버튼을 눌러 분석을 시작하세요."
        )
        tk.Label(main, text=text, font=("Malgun Gothic", 10), justify="left", fg="#d13438").pack(pady=(0, 20))
        
        self.btn = tk.Button(main, text="🚀 현재 화면에서 문제 사냥 시작 (F2)", bg="#0078d4", fg="white",
                             font=("Malgun Gothic", 12, "bold"), padx=30, pady=12, command=self.capture_and_analyze)
        self.btn.pack()
        
        self.root.bind("<F2>", lambda e: self.capture_and_analyze())
        self.root.bind("<Escape>", lambda e: sys.exit(0))
        self.root.mainloop()

    def capture_and_analyze(self):
        """윈도우 API를 쓰지 않고 순수 시각 데이터로만 분석"""
        self.root.withdraw()
        time.sleep(0.5)

        # 1. 화면 전체 캡쳐 (물리 픽셀 기준)
        full_shot = ImageGrab.grab(all_screens=True)
        img_np = np.array(full_shot)
        img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        
        # 2. 지능형 문제 인식 엔진 구동
        self.blocks = self.vision_brain(img_bgr)
        
        # 3. 투명 오버레이 UI 생성
        self.launch_overlay()

    def vision_brain(self, img):
        """줄 단위 군집 분석을 통한 문항 분리 인식"""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        
        # [DEBUG] 원본 캡쳐 저장 (나중에 확인용)
        os.makedirs("temp_captures", exist_ok=True)
        cv2.imwrite("temp_captures/v9_raw_capture.png", img)

        # 배경 제거: 밝은 영역(종이)만 남기고 반전
        # Otsu 이진화로 가장 적합한 임계값을 스스로 찾음
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        # 2단 구성을 보호하기 위해 가로 연결보다는 세로 연결을 강력하게 진행
        # 수직 팽창: 글자 줄들을 하나로 뭉침
        kernel_v = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
        dilated = cv2.dilate(binary, kernel_v, iterations=2)
        
        # 수평 팽창: 문항 번호와 보기를 적절히 연결 (단 경계는 안 넘게)
        kernel_h = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 1))
        dilated = cv2.dilate(dilated, kernel_h, iterations=1)
        
        cv2.imwrite("temp_captures/v9_vision_map.png", dilated)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        blocks = []
        # 한글 프로그램의 상단 툴바가 보통 화면의 15% 정도 차지함
        ignore_top = int(h * 0.15)
        
        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            
            # 필터링 로직: 진짜 문제 같은 녀석들만 골라냄
            if cw < 60 or ch < 40: continue # 너무 작은 것은 무시
            if cw > w * 0.55: continue # 화면의 절반을 넘어서면 2단 문서의 단순 배경일 확률 높음
            if y < ignore_top: continue # 툴바 영역에 있는 것은 무시
            
            blocks.append({'x': x, 'y': y, 'w': cw, 'h': ch})
            
        # 사람의 시선 순서로 정렬 (위 -> 아래, 왼쪽 -> 오른쪽)
        blocks.sort(key=lambda b: (b['y'] // 50, b['x']))
        
        print(f"V9 Vision Brain: Found {len(blocks)} candidates.")
        return blocks

    def launch_overlay(self):
        """가장 가시성이 좋은 하이라이트 UI"""
        self.overlay = tk.Toplevel()
        self.overlay.attributes("-fullscreen", True)
        self.overlay.attributes("-alpha", 0.05) # 클릭 감기를 위한 최소 투명도
        self.overlay.attributes("-topmost", True)
        self.overlay.overrideredirect(True)
        self.overlay.configure(cursor="cross")

        # 별도의 선명한 하이라이트 박스 윈도우
        self.highlighter = tk.Toplevel()
        self.highlighter.attributes("-alpha", 0.5)
        self.highlighter.attributes("-topmost", True)
        self.highlighter.overrideredirect(True)
        self.highlighter.configure(bg="#00bcf2") # 더 밝은 하늘색
        self.highlighter.withdraw()

        # 안내 상단 배너
        msg = f"🎯 {len(self.blocks)}개 문항 포착 | 원하는 곳을 클릭하세요 (F5: 새로고침 / Esc: 취소)"
        if not self.blocks:
            msg = "❌ 문항 인식 실패 (문제를 창 중앙에 잘 보이게 띄우고 F5를 눌러보세요)"
            
        banner = tk.Label(self.overlay, text=msg, fg="white", bg="#004e8c", 
                          font=("Malgun Gothic", 14, "bold"), pady=12)
        banner.place(relx=0.5, y=50, anchor="center")

        # 이벤트
        self.overlay.bind("<Motion>", self.track_mouse)
        self.overlay.bind("<Button-1>", self.take_shot)
        self.highlighter.bind("<Button-1>", self.take_shot) # 하이라이트 박스 클릭 시에도 캡쳐 실행
        self.overlay.bind("<F5>", lambda e: [self.overlay.destroy(), self.highlighter.destroy(), self.capture_and_analyze()])
        self.overlay.bind("<Escape>", lambda e: sys.exit(0))
        
        self.current_target = None

    def track_mouse(self, event):
        mx, my = event.x_root, event.y_root
        
        # 마우스 위치에 가장 잘 맞는 박스 탐색
        best = None
        for b in self.blocks:
            if b['x'] <= mx <= b['x'] + b['w'] and b['y'] <= my <= b['y'] + b['h']:
                # 중첩 시 더 작은(정밀한) 박스 선택
                if not best or (b['w'] * b['h'] < best['w'] * best['h']):
                    best = b
        
        self.current_target = best
        if best:
            # 선명한 테두리 효과를 위해 지오메트리 설정
            self.highlighter.geometry(f"{best['w']}x{best['h']}+{best['x']}+{best['y']}")
            self.highlighter.deiconify()
        else:
            self.highlighter.withdraw()

    def take_shot(self, event):
        if not self.current_target: return
        
        target = self.current_target
        # 즉시 모든 창 숨김
        self.highlighter.withdraw()
        self.overlay.withdraw()
        self.root.update()
        time.sleep(0.3) # 창이 완전히 사라지길 기다림
        
        try:
            # 최종 정밀 캡쳐 (여백 추가)
            m = 10
            bbox = (
                int(max(0, target['x'] - m)),
                int(max(0, target['y'] - m)),
                int(target['x'] + target['w'] + m),
                int(target['y'] + target['h'] + m)
            )
            final_img = ImageGrab.grab(bbox=bbox, all_screens=True)
            
            os.makedirs("temp_captures", exist_ok=True)
            path = os.path.join(os.getcwd(), "temp_captures", f"final_{uuid.uuid4().hex[:8]}.png")
            final_img.save(path)
            print(f"CAPTURED_FILE:{path}")
            
            # 뒷정리 및 종료
            self.highlighter.destroy()
            self.overlay.destroy()
            self.root.quit()
        except Exception as e:
            print(f"ERROR: Capture failed - {e}")
            
        sys.exit(0)

if __name__ == "__main__":
    NoTouchHunterV9 = UltimateHunterV9()
