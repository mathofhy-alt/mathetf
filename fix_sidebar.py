path = r'c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\src\app\question-bank\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# ────────────────────────────────────────────────────
# 1. showMobileSidebar state 추가 (showDuplicateModal 뒤에)
# ────────────────────────────────────────────────────
OLD_STATE = '    const [showDuplicateModal, setShowDuplicateModal] = useState(false);'
NEW_STATE  = '''    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [showMobileSidebar, setShowMobileSidebar] = useState(false);'''

if OLD_STATE in content:
    content = content.replace(OLD_STATE, NEW_STATE, 1)
    print('OK: showMobileSidebar state added')
else:
    print('WARN: state target not found')

# ────────────────────────────────────────────────────
# 2. 사이드바 div: 모바일에서 바텀시트, 데스크탑에서 사이드바
# ────────────────────────────────────────────────────
OLD_SIDEBAR = '`${viewMode === \'review\' ? \'hidden\' : \'hidden md:flex md:flex-col\'} w-64 bg-white border-r flex-col z-20`'
NEW_SIDEBAR  = '''`${
                    viewMode === \'review\'
                        ? \'hidden\'
                        : showMobileSidebar
                            ? \'fixed bottom-0 left-0 right-0 z-50 bg-white border-t rounded-t-2xl shadow-2xl flex flex-col w-full max-h-[85vh] md:relative md:bottom-auto md:z-20 md:border-t-0 md:border-r md:rounded-none md:shadow-none md:w-64 md:max-h-full\'
                            : \'hidden md:flex md:flex-col md:w-64 md:bg-white md:border-r md:z-20\'
                }`'''

if OLD_SIDEBAR in content:
    content = content.replace(OLD_SIDEBAR, NEW_SIDEBAR, 1)
    print('OK: sidebar class replaced with bottom-sheet')
else:
    print('WARN: sidebar class target not found')

# ────────────────────────────────────────────────────
# 3. 모바일 오버레이 배경 추가 (바텀시트 뒤에 흐린 배경)
# ────────────────────────────────────────────────────
OVERLAY_ANCHOR = '{/* Sidebar for Filters - Hidden in Review Mode */}'
OVERLAY_INSERT = '''{/* Mobile overlay */}
                {showMobileSidebar && viewMode !== 'review' && (
                    <div
                        className="fixed inset-0 z-40 bg-black/40 md:hidden"
                        onClick={() => setShowMobileSidebar(false)}
                    />
                )}
                {/* Sidebar for Filters - Hidden in Review Mode */}'''

if OVERLAY_ANCHOR in content:
    content = content.replace(OVERLAY_ANCHOR, OVERLAY_INSERT, 1)
    print('OK: mobile overlay added')
else:
    print('WARN: overlay anchor not found')

# ────────────────────────────────────────────────────
# 4. 바텀시트 상단 핸들 추가 (사이드바 상단 h2 앞에)
# ────────────────────────────────────────────────────
OLD_HANDLE_AREA = '                    <div className="p-4 border-b space-y-2">\n                        <h2 className="font-bold text-lg text-slate-800">문제 풀(Pool)</h2>'
NEW_HANDLE_AREA = '''                    {/* Mobile bottom-sheet handle */}
                    <div className="flex items-center justify-between px-4 pt-3 pb-0 md:hidden">
                        <div className="w-8 h-1 rounded-full bg-slate-300 mx-auto" />
                        <button
                            onClick={() => setShowMobileSidebar(false)}
                            className="absolute right-4 top-3 text-slate-400 hover:text-slate-600 text-xl font-bold"
                        >×</button>
                    </div>
                    <div className="p-4 border-b space-y-2">
                        <h2 className="font-bold text-lg text-slate-800">문제 풀(Pool)</h2>'''

if OLD_HANDLE_AREA in content:
    content = content.replace(OLD_HANDLE_AREA, NEW_HANDLE_AREA, 1)
    print('OK: bottom-sheet handle added')
else:
    print('WARN: handle area not found')

# ────────────────────────────────────────────────────
# 5. 검색 헤더에 모바일 필터 버튼 추가
# ────────────────────────────────────────────────────
OLD_H1 = '                            <h1 className="text-2xl font-bold text-gray-800">\n                                {selectedDbIds.length > 0 ? \'DB 문제 목록\' : \'전체 문제 검색\'}\n                            </h1>'
NEW_H1 = '''                            <div className="flex items-center gap-2 min-w-0">
                                <button
                                    className="md:hidden flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 flex-shrink-0"
                                    onClick={() => setShowMobileSidebar(true)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="10" y2="18"/></svg>
                                    필터
                                </button>
                                <h1 className="text-sm sm:text-2xl font-bold text-gray-800 truncate">
                                    {selectedDbIds.length > 0 ? 'DB 문제 목록' : '전체 문제 검색'}
                                </h1>
                            </div>'''

if OLD_H1 in content:
    content = content.replace(OLD_H1, NEW_H1, 1)
    print('OK: mobile filter button added to header')
else:
    print('WARN: h1 target not found')
    # Try a simpler search
    idx = content.find('<h1 className="text-2xl font-bold text-gray-800">')
    if idx >= 0:
        print(f'  h1 found at idx {idx}')
        print(repr(content[idx:idx+150]))

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('\nAll sidebar fixes applied!')
