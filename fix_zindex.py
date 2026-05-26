path = r'c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\src\app\question-bank\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# DB 문제 버튼: 바텀시트 닫기 추가
content = content.replace(
    '                                    setStorageModalMode(\'db\');\n                                    setShowStorageModal(true);',
    '                                    setStorageModalMode(\'db\');\n                                    setShowStorageModal(true);\n                                    setShowMobileSidebar(false);',
    1
)

# 만든 시험지 버튼: 바텀시트 닫기 추가
content = content.replace(
    '                                    setStorageModalMode(\'exam\');\n                                    setShowStorageModal(true);',
    '                                    setStorageModalMode(\'exam\');\n                                    setShowStorageModal(true);\n                                    setShowMobileSidebar(false);',
    1
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

# Verify
if 'setShowMobileSidebar(false)' in content:
    count = content.count('setShowMobileSidebar(false)')
    print(f'OK: setShowMobileSidebar(false) found {count} times')
else:
    print('ERROR: not found')
