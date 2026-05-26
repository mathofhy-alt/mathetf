path = r'c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\src\app\question-bank\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: 카드 고정 높이 제거
content = content.replace(
    'overflow-hidden group h-[630px]',
    'overflow-hidden group min-h-[500px] sm:h-[630px]'
)

# Fix 2: 검색 헤더 padding 줄이기
content = content.replace(
    'px-6 py-4 bg-gray-100/90 backdrop-blur-sm border-b border-slate-200/60 shadow-sm">',
    'px-3 sm:px-6 py-2 sm:py-4 bg-gray-100/90 backdrop-blur-sm border-b border-slate-200/60 shadow-sm">'
)

# Fix 3: 가이드 섹션 grid - 데스크탑만 보이게
content = content.replace(
    '<div className="grid grid-cols-4 divide-x divide-slate-100 px-2 py-6">',
    '<div className="hidden sm:grid grid-cols-4 divide-x divide-slate-100 px-2 py-6">'
)

# Fix 4: 단원 뱃지 텍스트 크기 키우기 (text-[10px] -> text-xs)
content = content.replace(
    'bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-md font-bold">',
    'bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-md font-bold">'
)

# Fix 5: 가이드 섹션 헤더에 모바일 세로 리스트 삽입
# 가이드 grid 앞에 모바일 전용 세로 리스트 추가
mobile_list = '''<div className="block sm:hidden px-4 py-4 space-y-3">
                                                <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                    <div className="relative flex-shrink-0">
                                                        <div className="w-11 h-11 rounded-xl bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
                                                            <Database size={20} className="text-blue-500" />
                                                        </div>
                                                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-black flex items-center justify-center">1</span>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-black text-slate-700">DB 선택</p>
                                                        <p className="text-xs text-slate-400 leading-relaxed mt-0.5">하단 「DB 문제」 버튼 → 사용할 기출 DB 선택</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                    <div className="relative flex-shrink-0">
                                                        <div className="w-11 h-11 rounded-xl bg-violet-50 border-2 border-violet-200 flex items-center justify-center">
                                                            <Search size={20} className="text-violet-500" />
                                                        </div>
                                                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-violet-500 text-white text-[9px] font-black flex items-center justify-center">2</span>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-black text-slate-700">조건 검색</p>
                                                        <p className="text-xs text-slate-400 leading-relaxed mt-0.5">단원·난이도 필터 설정 → 「조건 검색하기」 클릭</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                    <div className="relative flex-shrink-0">
                                                        <div className="w-11 h-11 rounded-xl bg-green-50 border-2 border-green-200 flex items-center justify-center">
                                                            <span className="text-xl">✅</span>
                                                        </div>
                                                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-green-500 text-white text-[9px] font-black flex items-center justify-center">3</span>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-black text-slate-700">문제 담기</p>
                                                        <p className="text-xs text-slate-400 leading-relaxed mt-0.5">검색된 문제 카드 클릭 → 담은 수가 상단에 표시</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                    <div className="relative flex-shrink-0">
                                                        <div className="w-11 h-11 rounded-xl bg-indigo-50 border-2 border-indigo-200 flex items-center justify-center">
                                                            <FileText size={20} className="text-indigo-500" />
                                                        </div>
                                                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-black flex items-center justify-center">4</span>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-black text-slate-700">시험지 생성</p>
                                                        <p className="text-xs text-slate-400 leading-relaxed mt-0.5">「시험지 생성」 클릭 → 순서·난이도 검토 후 HML 저장</p>
                                                    </div>
                                                </div>
                                            </div>\n                                            '''

content = content.replace(
    '<div className="hidden sm:grid grid-cols-4 divide-x divide-slate-100 px-2 py-6">',
    mobile_list + '<div className="hidden sm:grid grid-cols-4 divide-x divide-slate-100 px-2 py-6">'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('All fixes applied successfully')
