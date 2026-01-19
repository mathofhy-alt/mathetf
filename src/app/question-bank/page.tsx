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
    const [user, setUser] = useState<any>(null); // Placeholder for user auth

    const supabase = createClient();

    useEffect(() => {
        // Check auth
        supabase.auth.getUser().then(({ data }) => {
            setUser(data.user);
        });

        const fetchQuestions = async () => {
            const { data } = await supabase.from('questions').select('*').limit(20);
            if (data) setQuestions(data);
            setLoading(false);
        };
        fetchQuestions();
    }, []);

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
            // Updated to use the new HML Generator (Pure TypeScript, No Python)
            const response = await fetch('/api/pro/download/hml', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questions: cart }),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || 'Download failed');
            }

            // Trigger download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Use .hml extension for the new format
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
            {/* Main List */}
            <div className="flex-1 p-6 overflow-y-auto">
                <header className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-800">문제 검색</h1>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowAutoModal(true)}
                            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 shadow-sm transition font-bold"
                        >
                            ⚡ 자동 생성
                        </button>
                    </div>
                </header>

                {/* Search Bar */}
                <div className="mb-6">
                    <input
                        type="text"
                        placeholder="단원명, 문제 내용 검색..."
                        className="w-full p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>

                {loading ? (
                    <div>Loading...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                        {questions.map((q) => {
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
                                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-medium">
                                            {q.subject || '수학'}
                                        </span>
                                        <span className={`text-xs px-2 py-1 rounded font-medium ${q.difficulty === 'Hard' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                            }`}>
                                            {q.difficulty || '중'}
                                        </span>
                                    </div>

                                    <div className="h-24 bg-gray-50 rounded mb-2 overflow-hidden p-2 text-xs text-gray-500 border">
                                        {q.plain_text ? q.plain_text.slice(0, 100) + '...' : '(내용 없음)'}
                                    </div>

                                    <div className="flex justify-between items-center mt-2">
                                        <div className="text-xs text-gray-400">
                                            {q.source_db_id?.split('_')[0] || 'Unknown Source'}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                className="text-xs text-gray-500 hover:text-black underline"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    alert('유사 문항 검색 (Prototype): 같은 단원/난이도 문제를 찾아옵니다.');
                                                }}
                                            >
                                                유사문항
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
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
                                {q.subject} - {q.difficulty}
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
