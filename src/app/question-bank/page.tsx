'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import SaveExamModal from '@/components/folder-system/SaveExamModal';
import AutoGenModal from '@/components/question-bank/AutoGenModal';
import FolderExplorer from '@/components/storage/FolderExplorer';
import FilterSidebar from '@/components/question-bank/FilterSidebar';
import QuestionPreview from '@/components/question-bank/QuestionPreview';
import QuestionRenderer from '@/components/QuestionRenderer';
import ExamCart from '@/components/question-bank/ExamCart';
import ConfigModal from '@/components/question-bank/ConfigModal';
import Header from '@/components/Header';
import UploadModal from '@/components/UploadModal';
import { Folder as FolderIcon, Database, X } from 'lucide-react';
import type { UserItem } from '@/types/storage';

export default function QuestionBankPage() {
    const [questions, setQuestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [cart, setCart] = useState<any[]>([]);

    // Load Cart from LocalStorage
    useEffect(() => {
        const savedCart = localStorage.getItem('exam_cart');
        if (savedCart) {
            try {
                setCart(JSON.parse(savedCart));
            } catch (e) {
                console.error("Failed to load cart", e);
            }
        }
    }, []);

    // Save Cart to LocalStorage
    useEffect(() => {
        if (cart.length > 0) { // Only save if not empty to avoid overwriting with initial empty state on load (race condition usually invalid in simple hooks but good practice)
            // Actually, if we load empty, we shouldn't save empty immediately.
            // But the load effect runs once.
            localStorage.setItem('exam_cart', JSON.stringify(cart));
        } else {
            // If cart is empty, should we clear storage?
            // If initial load was empty, fine. 
            // If user cleared cart, we should clear storage.
            // To distinguish initial load vs user clear, we can skip saving on first render.
            // But simpler: just save.
            localStorage.setItem('exam_cart', JSON.stringify(cart));
        }
    }, [cart]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showAutoModal, setShowAutoModal] = useState(false);
    const [user, setUser] = useState<any>(null);

    // Personal DB State
    const [purchasedDbs, setPurchasedDbs] = useState<any[]>([]);
    const [selectedDb, setSelectedDb] = useState<string>('');

    // Header & Points State
    const [purchasedPoints, setPurchasedPoints] = useState<number>(0);
    const [earnedPoints, setEarnedPoints] = useState<number>(0);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

    // Storage Explorer State
    const [showStorageModal, setShowStorageModal] = useState(false);

    // Question Preview State
    const [previewQuestion, setPreviewQuestion] = useState<any>(null);
    const [previewPos, setPreviewPos] = useState<{ x: number, y: number } | null>(null);

    const supabase = createClient();

    const fetchMyPoints = async (userId: string) => {
        const { data, error } = await supabase.from('profiles').select('purchased_points, earned_points').eq('id', userId).single();
        if (data) {
            setPurchasedPoints(data.purchased_points || 0);
            setEarnedPoints(data.earned_points || 0);
        }
    };

    useEffect(() => {
        // Check auth
        supabase.auth.getUser().then(({ data }) => {
            setUser(data.user);
            if (data.user) {
                fetchPurchasedDbs(data.user.id);
                fetchMyPoints(data.user.id);
            }
        });

        // Do NOT fetch questions initially. Require DB selection.
        setLoading(false);
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

    const fetchQuestions = async (dbFilter?: any, advancedFilters?: any) => {
        // Security: Do not fetch ANY questions if no specific DB filter is provided
        // This prevents leaking 'sorted' questions that the user hasn't purchased.
        if (!dbFilter) {
            setQuestions([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        let query = supabase
            .from('questions')
            .select('*, question_images(*)')
            .eq('work_status', 'sorted') // Only fetch sorted questions
            .limit(100); // Increased limit as filters are stricter

        if (dbFilter) {
            // Apply strict filters based on the selected DB
            if (dbFilter.school) query = query.eq('school', dbFilter.school);

            // Year Logic
            let filterYear = dbFilter.year;
            if (!filterYear && dbFilter.title) {
                const yearMatch = dbFilter.title.match(/20[0-9]{2}/);
                if (yearMatch) filterYear = yearMatch[0];
            }
            if (filterYear) query = query.eq('year', filterYear);

            // Grade Mapping (DB uses 1, 2, 3 as int; Questions uses "고1", "고2", "고3" as string)
            if (dbFilter.grade) {
                // If grade is just a number/string like "1" or 1, convert to "고1"
                const gradeStr = String(dbFilter.grade).replace('고', '');
                // Try exact match first, or the mapped "고N" format
                // Actually, questions table seems to strictly use "고1" format based on debug data.
                // But let's be safe.
                query = query.ilike('grade', `%${gradeStr}%`);
                // Better: if it is 1, 2, 3, map to "고1", "고2"
                if (['1', '2', '3'].includes(gradeStr)) {
                    query = query.eq('grade', `고${gradeStr}`);
                } else {
                    query = query.eq('grade', dbFilter.grade);
                }
            }

            // Semester Logic
            if (dbFilter.semester) {
                query = query.ilike('semester', `${dbFilter.semester}%`);
            }

            if (dbFilter.subject) query = query.ilike('subject', `%${dbFilter.subject}%`);
        }

        // Apply Advanced Filters
        if (advancedFilters) {
            if (advancedFilters.units && advancedFilters.units.length > 0) {
                query = query.in('unit', advancedFilters.units);
            }
            if (advancedFilters.difficulty && advancedFilters.difficulty.length > 0) {
                query = query.in('difficulty', advancedFilters.difficulty);
            }
            // Add type filtering logic later if column exists
        }

        const { data } = await query;
        if (data) setQuestions(data);
        setLoading(false);
    };

    const handleDbSelect = (dbId: string) => {
        setSelectedDb(dbId);
        if (dbId === '') {
            setQuestions([]); // Clear list if no DB selected
        } else {
            const db = purchasedDbs.find(d => d.id === dbId);
            if (db) fetchQuestions(db);
        }
    };

    const handleStorageItemSelect = (item: UserItem) => {
        if (item.type === 'personal_db') {
            handleDbSelect(item.reference_id);
            setShowStorageModal(false);
        } else {
            alert('시험지는 아직 불러올 수 없습니다.');
        }
    };

    const toggleCart = (question: any) => {
        if (cart.find(q => q.id === question.id)) {
            setCart(cart.filter(q => q.id !== question.id));
        } else {
            setCart([...cart, question]);
        }
    };

    // Open Config Modal
    const handleGenerate = () => {
        if (cart.length === 0) return;
        setShowConfigModal(true);
    };

    // Actual Generation Logic
    const confirmGenerate = async (title: string) => {
        setIsGenerating(true);

        try {
            const response = await fetch('/api/pro/download/hml', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    questions: cart,
                    title: title
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || 'Download failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            // Filename is set by Content-Disposition, but fallback here
            const safeTitle = title.replace(/[^a-zA-Z0-9가-힣_\- ]/g, "").trim();
            a.download = `${safeTitle}.hml`;

            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            setShowConfigModal(false); // Close modal on success
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            alert('다운로드 실패: ' + errorMessage);
            console.error(e);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUploadClick = () => {
        if (!user) return alert('로그인이 필요합니다.');
        setIsUploadModalOpen(true);
    };

    return (
        <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
            <Header
                user={user}
                purchasedPoints={purchasedPoints}
                earnedPoints={earnedPoints}
                onUploadClick={handleUploadClick}
            />

            <div className="flex flex-1 overflow-hidden relative">
                {/* Storage Modal */}
                {showStorageModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-8">
                        <div className="bg-white w-full max-w-5xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                                <h3 className="font-bold text-lg flex items-center gap-2">
                                    <FolderIcon className="text-blue-600" /> 내 보관함
                                </h3>
                                <button onClick={() => setShowStorageModal(false)} className="p-2 hover:bg-slate-200 rounded-full">
                                    <X />
                                </button>
                            </div>
                            <div className="flex-1 overflow-hidden p-4 bg-slate-100">
                                <FolderExplorer onItemSelect={handleStorageItemSelect} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Question Preview Overlay */}
                <QuestionPreview
                    question={previewQuestion}
                    position={previewPos}
                    onClose={() => setPreviewQuestion(null)}
                />

                {/* Sidebar for Filters */}
                <div className="w-64 bg-white border-r flex flex-col z-20">
                    <div className="p-4 border-b space-y-2">
                        <h2 className="font-bold text-lg text-slate-800">문제 풀(Pool)</h2>

                        {/* Personal DB Selector */}
                        <button
                            onClick={() => setShowStorageModal(true)}
                            className="w-full py-2 px-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center justify-center gap-2 font-bold text-sm transition-colors"
                        >
                            <Database size={16} />
                            내 보관함에서 선택
                        </button>

                        {selectedDb ? (
                            <div className="p-3 border rounded-lg bg-white shadow-sm border-indigo-200 relative group">
                                <button
                                    onClick={() => handleDbSelect('')}
                                    className="absolute top-2 right-2 text-slate-400 hover:text-red-500 p-1"
                                    title="선택 해제"
                                >
                                    <X size={14} />
                                </button>
                                {(() => {
                                    const db = purchasedDbs.find(d => d.id === selectedDb);
                                    if (!db) return <span className="text-xs text-red-500">DB 정보 없음</span>;
                                    return (
                                        <div className="text-xs space-y-1">
                                            <div className="flex items-center gap-1 mb-1">
                                                <span className="bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded text-[10px]">선택됨</span>
                                            </div>
                                            <p className="font-bold text-slate-800 text-sm">{db.school}</p>
                                            <p className="text-slate-600">{db.exam_year} {db.grade}학년 {db.semester}</p>
                                            <p className="text-slate-500">{db.subject}</p>
                                        </div>
                                    );
                                })()}
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400 text-center py-4 border border-dashed rounded-lg bg-slate-50">
                                선택된 DB가 없습니다.
                            </div>
                        )}
                    </div>

                    {/* Advanced Filters */}
                    <div className="flex-1 overflow-hidden">
                        <FilterSidebar
                            dbFilter={purchasedDbs.find(d => d.id === selectedDb)}
                            onFilterChange={(filters) => {
                                // Trigger refetch with combined filters
                                const db = purchasedDbs.find(d => d.id === selectedDb);
                                if (db) fetchQuestions(db, filters);
                            }}
                        />
                    </div>
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

                    {/* Search Bar */}
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                            {questions.length > 0 ? questions.map((q) => {
                                const inCart = !!cart.find(c => c.id === q.id);
                                return (
                                    <div
                                        key={q.id}
                                        onClick={() => toggleCart(q)}
                                        className={`relative rounded-2xl shadow-sm border transition cursor-pointer select-none overflow-hidden group
                                            ${inCart ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500 shadow-md' : 'bg-white hover:shadow-lg border-gray-200'}
                                        `}
                                    >
                                        {/* Header */}
                                        <div className="flex justify-between items-center p-4 border-b bg-gray-50/50">
                                            <div className="flex items-center gap-2">
                                                <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-lg font-bold">
                                                    {q.subject || '수학'}
                                                </span>
                                                <span className="text-sm font-bold text-gray-700">
                                                    {q.school} {q.exam_year}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    {q.grade}학년 {q.semester} | {q.exam_type}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs px-2 py-1 rounded-full font-bold ${String(q.difficulty) === 'Hard' || String(q.difficulty) === '상' ? 'bg-red-100 text-red-700' :
                                                    String(q.difficulty) === 'Easy' || String(q.difficulty) === '하' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                    {q.difficulty || '중'}
                                                </span>
                                                {inCart && (
                                                    <span className="bg-indigo-600 text-white text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1">
                                                        <span>✓ 담김</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Content - Vertical Renderer */}
                                        <div className="p-4 bg-white min-h-[120px]">
                                            <QuestionRenderer
                                                xmlContent={q.content_xml}
                                                externalImages={q.question_images}
                                                displayMode="question"
                                                showDownloadAction={false}
                                                className="border-none shadow-none p-0 !text-base"
                                            />
                                        </div>

                                        {/* Footer / Overlay Actions */}
                                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                className="bg-white text-gray-700 hover:text-indigo-600 border border-gray-200 shadow-lg px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    alert('유사문항 검색 (준비중)');
                                                }}
                                            >
                                                🔍 유사문항
                                            </button>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="col-span-full text-center py-20 text-slate-400 bg-white rounded-2xl border border-dashed flex flex-col items-center justify-center gap-4">
                                    <Database size={48} className="text-slate-200" />
                                    <p className="text-lg font-medium text-slate-500">
                                        {selectedDb ? '이 DB에 해당하는 문제가 없습니다.' : 'DB를 먼저 선택해주세요 (좌측 "내 보관함" 버튼).'}
                                    </p>
                                    {selectedDb && <p className="text-sm text-slate-400">필터 조건을 변경하거나 다른 DB를 확인해보세요.</p>}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Sidebar: Cart */}
                <ExamCart
                    cart={cart}
                    onRemove={(id) => setCart(cart.filter(q => q.id !== id))}
                    onReorder={setCart}
                    onSaveConfig={() => {
                        if (!user) return alert('로그인이 필요합니다.');
                        setShowSaveModal(true);
                    }}
                    onGenerate={handleGenerate}
                    isGenerating={isGenerating}
                    user={user}
                />

                {showConfigModal && (
                    <ConfigModal
                        onClose={() => setShowConfigModal(false)}
                        onConfirm={confirmGenerate}
                        isGenerating={isGenerating}
                    />
                )}

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

            <UploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                user={user}
                regions={[]} // Not needed as we are in exam creation
                districtsMap={{}}
                schoolsMap={{}}
            />
        </div>
    );
}
