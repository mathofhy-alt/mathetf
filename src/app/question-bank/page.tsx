'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import SaveLocationModal from '@/components/storage/SaveLocationModal';
import AutoGenModal from '@/components/question-bank/AutoGenModal';
import FolderExplorer from '@/components/storage/FolderExplorer';
import FilterSidebar from '@/components/question-bank/FilterSidebar';
import QuestionPreview from '@/components/question-bank/QuestionPreview';
import QuestionRenderer from '@/components/QuestionRenderer';
import DuplicateCheckModal from '@/components/storage/DuplicateCheckModal';
import ExamCart from '@/components/question-bank/ExamCart';
import ConfigModal from '@/components/question-bank/ConfigModal';
import SimilarQuestionsModal from '@/components/question-bank/SimilarQuestionsModal';
import SolutionViewerModal from '@/components/question-bank/SolutionViewerModal';
import Header from '@/components/Header';
import UploadModal from '@/components/UploadModal';
import { Folder as FolderIcon, Database, X } from 'lucide-react';
import type { UserItem } from '@/types/storage';

export default function QuestionBankPage() {
    const [questions, setQuestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [cart, setCart] = useState<any[]>([]);

    // Derived State for performance (O(1) lookup)
    const cartIdSet = useMemo(() => new Set((cart || []).filter(item => item && item.id).map(item => item.id)), [cart]);

    // Load Cart from LocalStorage
    useEffect(() => {
        const savedCartIds = localStorage.getItem('exam_cart_ids'); // Use IDs only
        if (savedCartIds && savedCartIds !== 'undefined' && savedCartIds !== 'null') {
            try {
                const parsedIds = JSON.parse(savedCartIds);
                if (Array.isArray(parsedIds)) {
                    // Initialize cart with skeleton objects. 
                    // The Save API and highlight logic only need the .id property.
                    setCart(parsedIds.map(id => ({ id })));
                }
            } catch (e) {
                console.error("Failed to load cart", e);
                setCart([]);
            }
        }
    }, []);

    // Save Cart to LocalStorage (Store ONLY IDs to save space and prevent Quota errors)
    useEffect(() => {
        try {
            const idsOnly = (cart || []).filter(item => item && item.id).map(item => item.id);
            localStorage.setItem('exam_cart_ids', JSON.stringify(idsOnly));
            // Cleanup legacy storage if exists
            localStorage.removeItem('exam_cart');
        } catch (e) {
            console.error("Failed to save cart to localStorage", e);
        }
    }, [cart]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [similarTarget, setSimilarTarget] = useState<any | null>(null);
    const [solutionTarget, setSolutionTarget] = useState<any | null>(null);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showAutoModal, setShowAutoModal] = useState(false);
    const [user, setUser] = useState<any>(null);

    // Personal DB State
    const [purchasedDbs, setPurchasedDbs] = useState<any[]>([]);
    const [selectedDbIds, setSelectedDbIds] = useState<string[]>([]);
    const [filterState, setFilterState] = useState<any>(null); // Store filters locally for manual search
    // Derived for legacy support or convenience if needed, but mainly use IDs

    // Header & Points State
    const [purchasedPoints, setPurchasedPoints] = useState<number>(0);
    const [earnedPoints, setEarnedPoints] = useState<number>(0);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

    // Storage Explorer State
    const [showStorageModal, setShowStorageModal] = useState(false);
    const [storageModalMode, setStorageModalMode] = useState<'all' | 'db' | 'exam'>('all');

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

        if (dbFilter.length > 0) {
            // Find all selected DBs
            const selectedDbs = purchasedDbs.filter(d => dbFilter.includes(d.id));

            if (selectedDbs.length > 0) {
                // FALLBACK: source_db_id in questions table appears to be stale/mismatched for some schools.
                // We will use strict metadata matching (School + Grade + Year + Semester).

                const orConditions = selectedDbs.map(db => {
                    // Map Grade: '1' -> '고1', '고1' -> '고1'
                    let gradeVal = db.grade;
                    if (db.grade && ['1', '2', '3'].includes(String(db.grade).replace('고', ''))) {
                        gradeVal = `고${String(db.grade).replace('고', '')}`;
                    }

                    // Map Year: Check exam_year -> year -> title regex
                    let yearVal = db.exam_year || db.year;
                    if (!yearVal && db.title) {
                        const match = db.title.match(/20[0-9]{2}/);
                        if (match) yearVal = match[0];
                    }

                    let parts = [
                        `school.eq.${db.school}`
                    ];

                    if (gradeVal) parts.push(`grade.eq.${gradeVal}`);
                    if (yearVal) parts.push(`year.eq.${yearVal}`);
                    // Semester mismatch: DB has '2', Questions have '2학기기말'.
                    // Removing strict check to ensure matches.
                    // if (db.semester) parts.push(`semester.eq.${db.semester}`);

                    // Also attempt to match legacy ID if it happens to be correct
                    // parts.push(`source_db_id.eq.${db.id}`); // Can't mix with AND easily here without making it restrictive.

                    return `and(${parts.join(',')})`;
                });

                if (orConditions.length > 0) {
                    query = query.or(orConditions.join(','));
                }
            } else {
                // Prevent leak
                query = query.eq('id', '00000000-0000-0000-0000-000000000000');
            }
        }

        // Apply Advanced Filters
        if (advancedFilters) {
            if (advancedFilters.units && advancedFilters.units.length > 0) {
                query = query.in('unit', advancedFilters.units);
            }
            if (advancedFilters.difficulty && advancedFilters.difficulty.length > 0) {
                query = query.in('difficulty', advancedFilters.difficulty);
            }
            if (advancedFilters.subjects && advancedFilters.subjects.length > 0) {
                query = query.in('subject', advancedFilters.subjects);
            }
            if (advancedFilters.keywords && advancedFilters.keywords.length > 0) {
                // Apply AND logic for each keyword
                // We search in 'plain_text' which should contain extracted text from HML
                advancedFilters.keywords.forEach((keyword: string) => {
                    const term = keyword.trim();
                    if (term) {
                        // Use ilike for case-insensitive partial match
                        // Since Supabase .ilike() adds AND clauses by default when chained, this works perfectly.
                        query = query.ilike('plain_text', `%${term}%`);
                    }
                });
            }
        }

        const { data } = await query;
        if (data) setQuestions(data);
        setLoading(false);
    };

    const handleSearch = () => {
        if (selectedDbIds.length === 0) {
            alert('DB를 먼저 선택해주세요.');
            return;
        }
        fetchQuestions(selectedDbIds, filterState);
    };

    const handleDbToggle = (dbId: string) => {
        let newIds = [...selectedDbIds];
        if (newIds.includes(dbId)) {
            newIds = newIds.filter(id => id !== dbId);
        } else {
            newIds.push(dbId);
        }
        setSelectedDbIds(newIds);

        if (newIds.length === 0) {
            setQuestions([]);
        }
        // No auto fetch
    };

    const handleDbSelectAll = (items: UserItem[]) => {
        const itemIds = items.map(i => i.reference_id || i.id);

        // Check if all are currently selected
        const allSelected = itemIds.every(id => selectedDbIds.includes(id));

        let newIds = [...selectedDbIds];
        if (allSelected) {
            // Deselect all
            newIds = newIds.filter(id => !itemIds.includes(id));
        } else {
            // Select all (add missing)
            itemIds.forEach(id => {
                if (!newIds.includes(id)) newIds.push(id);
            });
        }

        setSelectedDbIds(newIds);
        if (newIds.length === 0) {
            setQuestions([]);
        }
        // No auto fetch
    };

    const handleStorageItemSelect = (item: UserItem) => {
        if (item.type === 'personal_db') {
            handleDbToggle(item.reference_id);
        } else if (item.type === 'saved_exam') {
            // Toggle selection for Bulk Actions
            handleDbToggle(item.id);
        } else {
            alert('알 수 없는 파일 형식입니다.');
        }
    };

    const toggleCart = (question: any) => {
        if (cart.find(q => q.id === question.id)) {
            setCart(cart.filter(q => q.id !== question.id));
        } else {
            setCart([...cart, question]);
        }
    };

    const handleSelectAllToggle = () => {
        if (!questions || questions.length === 0) return;

        const allInSearchInCart = questions.every(q => q && cartIdSet.has(q.id));

        if (allInSearchInCart) {
            // Remove all current search results from cart
            const searchIds = new Set(questions.filter(q => q && q.id).map(q => q.id));
            setCart(prev => (Array.isArray(prev) ? prev : []).filter(c => c && !searchIds.has(c.id)));
        } else {
            // Add all current search results to cart (avoiding duplicates)
            const toAdd = questions.filter(q => q && q.id && !cartIdSet.has(q.id));
            setCart(prev => [...(Array.isArray(prev) ? prev : []), ...toAdd]);
        }
    };

    // Open Config Modal
    const handleGenerate = () => {
        if (cart.length === 0) return;
        setShowConfigModal(true);
    };

    const [examTitle, setExamTitle] = useState('');

    // Config Confirmed -> Open Save Modal
    const handleConfigConfirm = (title: string) => {
        setExamTitle(title);
        setShowConfigModal(false);
        setShowSaveModal(true);
    };

    // Save Location Confirmed -> Execute Save
    const handleSaveConfirm = async (folderId: string | null) => {
        setIsGenerating(true);

        try {
            const response = await fetch('/api/pro/exam/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: cart.map(q => q.id),
                    title: examTitle,
                    folderId: folderId || 'root'
                }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Save failed');
            }

            alert('보관함에 저장되었습니다! "내 보관함"에서 확인 및 다운로드 가능합니다.');
            setCart([]);
            localStorage.removeItem('exam_cart');
            setShowSaveModal(false);

            // Optional: Open Storage Modal to show the result?
            // setShowStorageModal(true);

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            alert('저장 실패: ' + errorMessage);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUploadClick = () => {
        if (!user) return alert('로그인이 필요합니다.');
        setIsUploadModalOpen(true);
    };

    const [showDuplicateModal, setShowDuplicateModal] = useState(false);

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
                                    {storageModalMode === 'db' ? (
                                        <><Database className="text-blue-600" /> DB 문제 선택</>
                                    ) : storageModalMode === 'exam' ? (
                                        <><FolderIcon className="text-purple-600" /> 만든 시험지 선택</>
                                    ) : (
                                        <><FolderIcon className="text-gray-600" /> 내 보관함</>
                                    )}
                                </h3>
                                <button onClick={() => setShowStorageModal(false)} className="p-2 hover:bg-slate-200 rounded-full">
                                    <X />
                                </button>
                            </div>
                            <div className="flex-1 overflow-hidden p-4 bg-slate-100">
                                <FolderExplorer
                                    onItemSelect={handleStorageItemSelect}
                                    onSelectAll={handleDbSelectAll}
                                    selectedIds={selectedDbIds}
                                    filterType={storageModalMode}
                                />
                            </div>
                            <div className="p-4 border-t bg-slate-50 flex justify-end">
                                <button
                                    onClick={() => setShowDuplicateModal(true)} // Open check instead of closing directly
                                    className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition"
                                >
                                    선택 완료
                                </button>
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

                        {/* Personal DB Selector & Exam Selector */}
                        <div className="flex gap-2 mb-2">
                            <button
                                onClick={() => {
                                    setStorageModalMode('db');
                                    setShowStorageModal(true);
                                }}
                                className="flex-1 py-3 px-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl hover:bg-indigo-100 flex items-center justify-center gap-2 font-bold text-sm transition-colors whitespace-nowrap"
                            >
                                <Database size={16} />
                                DB 문제
                            </button>
                            <button
                                onClick={() => {
                                    setStorageModalMode('exam');
                                    setShowStorageModal(true);
                                }}
                                className="flex-1 py-3 px-3 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl hover:bg-purple-100 flex items-center justify-center gap-2 font-bold text-sm transition-colors whitespace-nowrap"
                            >
                                <FolderIcon size={16} />
                                만든 시험지
                            </button>
                        </div>

                        {selectedDbIds.length > 0 ? (
                            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
                                <p className="text-indigo-900 font-bold text-lg mb-1">{selectedDbIds.length}개 선택됨</p>
                                <button
                                    onClick={() => setSelectedDbIds([])}
                                    className="text-xs text-indigo-500 hover:text-indigo-700 underline"
                                >
                                    전체 해제
                                </button>
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400 text-center py-4 border border-dashed rounded-lg bg-slate-50">
                                선택된 DB가 없습니다.
                            </div>
                        )}
                    </div>

                    {/* Advanced Filters */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="flex-1 overflow-y-auto">
                            <FilterSidebar
                                dbFilter={null}
                                selectedDbIds={selectedDbIds}
                                purchasedDbs={purchasedDbs}
                                onFilterChange={(filters) => {
                                    setFilterState(filters);
                                    // No auto fetch
                                }}
                            />
                        </div>
                        <div className="p-4 border-t bg-slate-50">
                            <button
                                onClick={handleSearch}
                                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                            >
                                <span>🔍 조건 검색하기</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main List */}
                <div className="flex-1 p-6 overflow-y-auto">
                    <header className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-gray-800">
                            {selectedDbIds.length > 0 ? 'DB 문제 목록' : '전체 문제 검색'}
                        </h1>
                        <div className="flex gap-2">
                            {questions.length > 0 && (
                                <button
                                    onClick={handleSelectAllToggle}
                                    className="border border-slate-300 text-slate-600 px-4 py-2 rounded-lg hover:bg-white hover:text-indigo-600 hover:border-indigo-600 shadow-sm transition font-bold"
                                >
                                    {questions.every(q => q && cartIdSet.has(q.id)) ? '전체 해제' : '전체 선택'}
                                </button>
                            )}
                            <button
                                onClick={handleGenerate}
                                disabled={cart.length === 0 || isGenerating}
                                className="bg-indigo-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-sm transition font-bold flex items-center gap-2"
                            >
                                <span>📝 시험지 생성 ({cart.length})</span>
                            </button>
                            <button
                                onClick={() => setShowAutoModal(true)}
                                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 shadow-sm transition font-bold"
                            >
                                ⚡ 자동 생성
                            </button>
                        </div>
                    </header>



                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                            {questions.length > 0 ? questions.map((q) => {
                                const inCart = q && cartIdSet.has(q.id);
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
                                                    {q.unit || '단원 미정'}
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
                                                        <span>{cart.findIndex(c => c.id === q.id) + 1}번</span>
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
                                        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 z-10">
                                            <button
                                                className="bg-white text-slate-700 hover:text-green-600 hover:border-green-200 border border-slate-200 shadow-sm hover:shadow-md px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSolutionTarget(q);
                                                }}
                                            >
                                                <span>📒</span> 해설
                                            </button>
                                            <div className="w-px h-3 bg-slate-300 mx-0.5"></div>
                                            <button
                                                className="bg-white text-slate-700 hover:text-indigo-600 hover:border-indigo-200 border border-slate-200 shadow-sm hover:shadow-md px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSimilarTarget(q);
                                                }}
                                            >
                                                <span>🔍</span> 유사문항
                                            </button>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="col-span-full text-center py-20 text-slate-400 bg-white rounded-2xl border border-dashed flex flex-col items-center justify-center gap-4">
                                    <Database size={48} className="text-slate-200" />
                                    <p className="text-lg font-medium text-slate-500">
                                        {selectedDbIds.length > 0 ? '조건 설정 후 "검색하기" 버튼을 눌러주세요.' : 'DB를 먼저 선택해주세요 (좌측 "내 보관함" 버튼).'}
                                    </p>
                                    {selectedDbIds.length > 0 && <p className="text-sm text-slate-400">좌측 하단의 검색 버튼으로 문제를 불러올 수 있습니다.</p>}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Sidebar: Cart */}
                {/* Right Sidebar: Cart (REMOVED) */}
                {/* <ExamCart ... /> */}

                {showConfigModal && (
                    <ConfigModal
                        onClose={() => setShowConfigModal(false)}
                        onConfirm={handleConfigConfirm}
                        isGenerating={isGenerating}
                    />
                )}

                {showSaveModal && (
                    <SaveLocationModal
                        title={examTitle}
                        isSaving={isGenerating}
                        onClose={() => setShowSaveModal(false)}
                        onConfirm={handleSaveConfirm}
                    />
                )}

                {showAutoModal && (
                    <AutoGenModal
                        onClose={() => setShowAutoModal(false)}
                        onGenerate={(newQuestions) => {
                            const newIds = new Set(newQuestions.map((q: any) => q.id));
                            const existing = cart.filter(c => !newIds.has(c.id));
                            setCart([...existing, ...newQuestions]);
                            setShowConfigModal(true);
                        }}
                    />
                )}

                {similarTarget && (
                    <SimilarQuestionsModal
                        baseQuestion={similarTarget}
                        cart={cart}
                        onToggleCart={toggleCart}
                        onClose={() => setSimilarTarget(null)}
                    />
                )}

                {solutionTarget && (
                    <SolutionViewerModal
                        question={solutionTarget}
                        onClose={() => setSolutionTarget(null)}
                    />
                )}

            </div>

            <UploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                user={user}
                regions={[]}
                districtsMap={{}}
                schoolsMap={{}}
            />

            {showDuplicateModal && (
                <DuplicateCheckModal
                    isOpen={showDuplicateModal}
                    onClose={() => {
                        setShowDuplicateModal(false);
                        setShowStorageModal(false);
                    }}
                    onCheck={(blockedIds: string[], examName: string) => {
                        const initialCount = selectedDbIds.length;
                        const filteredIds = selectedDbIds.filter(id => !blockedIds.includes(id));
                        const removedCount = initialCount - filteredIds.length;

                        setSelectedDbIds(filteredIds);
                        setShowDuplicateModal(false);
                        setShowStorageModal(false);

                        if (removedCount > 0) {
                            alert(`"${examName}"에 사용된 소스 ${removedCount}개를 제외했습니다.`);
                        } else {
                            alert('중복된 소스가 없습니다.');
                        }
                    }}
                />
            )}
        </div >
    );
}
