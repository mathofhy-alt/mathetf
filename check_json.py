import sys

def check_json_in_pyc(pyc_path):
    with open(pyc_path, 'rb') as f:
        data = f.read()
    
    for token in [b'application/json', b'response_mime_type', b'response_schema', b'GenerationConfig']:
        if token in data:
            print(f"Token found: {token.decode('utf-8')}")
        else:
            print(f"Token NOT found: {token.decode('utf-8')}")

if __name__ == '__main__':
    pyc_path = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\제미나이요청문제해설v3.exe_extracted\PYZ.pyz_extracted\gemini_client.pyc"
    check_json_in_pyc(pyc_path)
