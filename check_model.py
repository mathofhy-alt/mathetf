import sys

def check_model_in_pyc(pyc_path):
    with open(pyc_path, 'rb') as f:
        data = f.read()
    
    # Check what model name is in the pyc
    for model in [b'gemini-1.5-flash', b'gemini-2.0-flash', b'gemini-pro', b'gemini-1.5-pro', b'gemini-3-flash-preview', b'gemini-1.5-flash-8b']:
        if model in data:
            print(f"Model found: {model.decode('utf-8')}")

if __name__ == '__main__':
    pyc_path = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\제미나이요청문제해설v3.exe_extracted\PYZ.pyz_extracted\gemini_client.pyc"
    check_model_in_pyc(pyc_path)
