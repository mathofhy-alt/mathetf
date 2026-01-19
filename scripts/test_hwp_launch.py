import win32con
import win32api
import win32gui
import os
import shutil

def register_hwp_security():
    print("Trying to register HWP security module...")
    
    # 레지스트리 경로 (한글 버전에 따라 다를 수 있음)
    # HKEY_CURRENT_USER\Software\Hnc\HwpCtrl\Modules
    
    try:
        key_path = r"Software\Hnc\HwpCtrl\Modules"
        key = win32api.RegCreateKey(win32con.HKEY_CURRENT_USER, key_path)
        
        # 모듈 이름과 값 등록 (FilePathCheckerModule)
        # 값은 모듈 dll의 절대 경로여야 하는데, 보통 한글 설치 폴더의 FilePathCheckerModule.dll 을 가리키거나
        # 단순히 아무 경로 문자열이나 등록해서 우회하기도 함 (일부 버전).
        # 하지만 정석은 'FilePathCheckDLL'이라는 이름으로 'FilePathCheckerModule' 문자열을 등록하고,
        # 해당 모듈이 실제로 허용 리스트에 있어야 함.
        
        # 더 간단한 방법: "FilePathCheckerModule"이라는 이름의 값을 만들고, 
        # 데이터로 현재 스크립트가 있는 폴더나 특정 dll 경로를 지정.
        
        # 하지만 최근 한글 버전은 "보안 승인" 팝업을 띄우는 것이 기본 동작.
        # win32com으로 HwpObject를 생성할 때 자동으로 뜸.
        
        print("레지스트리 접근 성공. 하지만 자동 등록은 복잡하므로 테스트 코드로 대체합니다.")
        print("한글을 실행하여 '도구 > 환경 설정 > 보안 > 보안 수준'을 확인하세요.")
        print("또는 아래 코드로 한글을 한번 실행해봅니다.")

    except Exception as e:
        print(f"Registry Access Failed: {e}")

    # 간단 테스트 실행
    try:
        import win32com.client as win32
        hwp = win32.gencache.EnsureDispatch("HWPFrame.HwpObject")
        hwp.XHwpWindows.Item(0).Visible = True
        hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
        print("HWP Launched via script. Check if user prompt appears.")
        
        # 3초 대기
        import time
        time.sleep(3)
        hwp.Quit()
        
    except Exception as e:
        print(f"HWP Launch Failed: {e}")

if __name__ == "__main__":
    register_hwp_security()
