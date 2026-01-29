'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import SaveExamModal from '@/components/folder-system/SaveExamModal';
import AutoGenModal from '@/components/question-bank/AutoGenModal';

export default function QuestionBankPage() {
    const [questions, setQuestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [cart, setCart] = useState<any[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showAutoModal, setShowAutoModal] = useState(false);
    const [user, setUser] = useState<any>(null);

    // Personal DB State
    const [purchasedDbs, setPurchasedDbs] = useState<any[]>([]);
    const [selectedDb, setSelectedDb] = useState<string>('');

    const supabase = createClient();

    useEffect(() => {
        // Check auth
        supabase.auth.getUser().then(({ data }) => {
            setUser(data.user);
            if (data.user) fetchPurchasedDbs(data.user.id);
        });

        fetchQuestions();
    }, []);

    const fetchPurchasedDbs = async (userId: string) => {
        // Join purchases with exam_materials to get DB details
        const { data, error } = await supabase
            .from('purchases')
            .select(`
                *,
                exam_materials!inner (
                    id, title, school, grade, semester, exam_type, subject, file_type
                )
            `)
            .eq('user_id', userId)
            .eq('exam_materials.file_type', 'DB');

        if (data) {
            setPurchasedDbs(data.map((p: any) => p.exam_materials));
        }
    };

    const fetchQuestions = async (dbFilter?: any) => {
        setLoading(true);
        let query = supabase
            .from('questions')
            .select('*')
            .eq('work_status', 'sorted') // Only fetch sorted questions
            .limit(50);

        if (dbFilter) {
            // Apply strict filters based on the selected DB
            if (dbFilter.school) query = query.eq('school', dbFilter.school);

            // Year Logic: exam_materials might lack year column, parse from title if needed
            let filterYear = dbFilter.year;
            if (!filterYear && dbFilter.title) {
                const yearMatch = dbFilter.title.match(/20[0-9]{2}/);
                if (yearMatch) filterYear = yearMatch[0];
            }
            if (filterYear) query = query.eq('year', filterYear);

            if (dbFilter.grade) query = query.eq('grade', dbFilter.grade);

            // Semester Logic: Map integer (1, 2) to string pattern if needed
            // DB has '1', '2'. Questions table has '1학기중간', etc.
            // If dbFilter.semester represents just 1 or 2, we should filter loosely or map?
            // Actually, questions table semester is text. 
            // Let's assume for now we filter by starting string "1" or "2"
            if (dbFilter.semester) {
                query = query.ilike('semester', `${dbFilter.semester}%`);
            }

            if (dbFilter.subject) query = query.ilike('subject', `%${dbFilter.subject}%`);
        }

        const { data } = await query;
        if (data) setQuestions(data);
        setLoading(false);
    };

    const handleDbSelect = (dbId: string) => {
        setSelectedDb(dbId);
        if (dbId === '') {
            fetchQuestions(); // Reset
        } else {
            const db = purchasedDbs.find(d => d.id === dbId);
            if (db) fetchQuestions(db);
        }
    };

    const toggleCart = (question: any) => {
        if (cart.find(q => q.id === question.id)) {
            setCart(cart.filter(q => q.id !== question.id));
        } else {
            setCart([...cart, question]);
        }
    };

    const handleGenerate = async () => {
        if (cart.length === 0) return;
        setIsGenerating(true);

        try {
            const response = await fetch('/api/pro/download/hml', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questions: cart }),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || 'Download failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Exam_Paper_${new Date().toISOString().slice(0, 10)}.hml`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            alert('다운로드 실패: ' + errorMessage);
            console.error(e);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex bg-gray-100 h-full">
            {/* Sidebar for Filters */}
            <div className="w-64 bg-white border-r p-4 flex flex-col gap-4">
                <h2 className="font-bold text-lg text-slate-800">필터 설정</h2>

                {/* Personal DB Filter */}
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">
                        내 보유 DB (학교별)
                    </label>
                    <select
                        value={selectedDb}
                        onChange={(e) => handleDbSelect(e.target.value)}
                        className="w-full text-sm border-slate-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                        <option value="">전체 문제 보기</option>
                        {purchasedDbs.map(db => (
                            <option key={db.id} value={db.id}>
                                {db.school} {db.exam_year} ({db.grade}학년)
                            </option>
                        ))}
                    </select>
                    {purchasedDbs.length === 0 && user && (
                        <p className="text-[10px] text-slate-400 mt-1">
                            * 보유한 개인 DB가 없습니다.<br />메인 페이지에서 개인 DB를 구매해보세요.
                        </p>
                    )}
                </div>

                {selectedDb && (
                    <div className="bg-indigo-50 p-3 rounded text-xs text-indigo-700 space-y-1">
                        <p className="font-bold">선택된 DB 정보:</p>
                        {(() => {
                            const db = purchasedDbs.find(d => d.id === selectedDb);
                            if (!db) return null;
                            return (
                                <>
                                    <p>학교: {db.school}</p>
                                    <p>년도: {db.exam_year}</p>
                                    <p>학년: {db.grade}학년 {db.semester}학기</p>
                                    <p>범위: {db.exam_type}</p>
                                    <p>과목: {db.subject}</p>
                                </>
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* Main List */}
            <div className="flex-1 p-6 overflow-y-auto">
                <header className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">
                        {selectedDb ? 'DB 문제 목록' : '전체 문제 검색'}
                    </h1>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowAutoModal(true)}
                            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 shadow-sm transition font-bold"
                        >
                            ⚡ 자동 생성
                        </button>
                    </div>
                </header>

                {/* Search Bar - Optional, keep valid even with DB selected */}
                <div className="mb-6">
                    <input
                        type="text"
                        placeholder="문제 내용 검색..."
                        className="w-full p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                        {questions.length > 0 ? questions.map((q) => {
                            const inCart = !!cart.find(c => c.id === q.id);
                            return (
                                <div
                                    key={q.id}
                                    onClick={() => toggleCart(q)}
                                    className={`relative rounded-xl shadow-sm border p-4 transition cursor-pointer select-none
                                        ${inCart ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500' : 'bg-white hover:shadow-md'}
                                    `}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex gap-1">
                                            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-medium">
                                                {q.subject || '수학'}
                                            </span>
                                            <span className="bg-slate-100 text-slate-800 text-xs px-2 py-1 rounded font-medium">
                                                {q.school}
                                            </span>
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded font-medium ${q.difficulty === 'Hard' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                            {q.difficulty || '중'}
                                        </span>
                                    </div>

                                    <div className="h-24 bg-gray-50 rounded mb-2 overflow-hidden p-2 text-xs text-gray-500 border relative">
                                        {q.plain_text ? q.plain_text.slice(0, 100) + '...' : '(내용 없음)'}
                                    </div>

                                    <div className="flex justify-between items-center mt-2">
                                        <div className="text-xs text-gray-400">
                                            {// Show source better
                                                `${q.exam_year} | ${q.grade}학년 | ${q.exam_type}`
                                            }
                                        </div>
                                        <button
                                            className="text-xs text-gray-500 hover:text-black underline"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                alert('유사 문항 검색 (Prototype)');
                                            }}
                                        >
                                            유사문항
                                        </button>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="col-span-2 text-center py-10 text-slate-400">
                                {selectedDb ? '이 DB에 해당하는 문제가 아직 등록되지 않았습니다.' : '검색 결과가 없습니다.'}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Right Sidebar: Cart */}
            <div className="w-80 bg-white border-l shadow-xl flex flex-col z-10">
                <div className="p-4 border-b bg-gray-50">
                    <h2 className="font-bold text-lg">선택한 문제 ({cart.length})</h2>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {cart.length === 0 && (
                        <div className="text-gray-400 text-sm text-center mt-10">
                            문제를 선택하면 여기에 담깁니다.
                        </div>
                    )}
                    {cart.map((q, idx) => (
                        <div key={q.id} className="border rounded p-3 text-sm flex justify-between group">
                            <div>
                                <span className="font-bold mr-2 text-indigo-600">{idx + 1}.</span>
                                {q.school} - {q.difficulty}
                            </div>
                            <button
                                onClick={() => toggleCart(q)}
                                className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t bg-gray-50 space-y-2">
                    <button
                        onClick={() => {
                            if (!user) return alert('로그인이 필요합니다.');
                            setShowSaveModal(true);
                        }}
                        disabled={cart.length === 0}
                        className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-50 transition"
                    >
                        내 시험지함에 저장
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={cart.length === 0 || isGenerating}
                        className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition flex justify-center items-center"
                    >
                        {isGenerating ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                시험지 생성중...
                            </>
                        ) : (
                            'HML 다운로드'
                        )}
                    </button>
                </div>
            </div>

            {showSaveModal && user && (
                <SaveExamModal
                    user={user}
                    cart={cart}
                    onClose={() => setShowSaveModal(false)}
                    onSave={() => setCart([])}
                />
            )}

            {showAutoModal && (
                <AutoGenModal
                    onClose={() => setShowAutoModal(false)}
                    onGenerate={(newQuestions) => {
                        const newIds = new Set(newQuestions.map((q: any) => q.id));
                        const existing = cart.filter(c => !newIds.has(c.id));
                        setCart([...existing, ...newQuestions]);
                    }}
                />
            )}
        </div>
    );
}
