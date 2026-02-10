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
import { Folder as FolderIcon, Database, X, Trash2, FileText, Search } from 'lucide-react';
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
    const [viewMode, setViewMode] = useState<'search' | 'review'>('search');
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
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
    const [storageInitialData, setStorageInitialData] = useState<any>(null);
    const [storageRefreshKey, setStorageRefreshKey] = useState(0);
    const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);

    // Pre-fetch Storage Data for Instant Feel
    useEffect(() => {
        if (user) {
            // Fetch root level for 'all' mode to prime the cache
            fetch('/api/storage/folders?mode=all')
                .then(res => res.json())
                .then(data => {
                    if (data && !data.error) setStorageInitialData(data);
                })
                .catch(err => console.error("Storage Pre-fetch Error:", err));
        }
    }, [user]);

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

                    // Map Semester & Exam Type (e.g. "1" + "중간고사" -> "1학기중간")
                    if (db.semester && db.exam_type) {
                        const semNum = String(db.semester).replace('학기', '');
                        const typeShort = db.exam_type.includes('중간') ? '중간' : (db.exam_type.includes('기말') ? '기말' : '');
                        if (typeShort) {
                            parts.push(`semester.eq.${semNum}학기${typeShort}`);
                        }
                    } else if (db.semester) {
                        // Fallback for semester only
                        const semNum = String(db.semester).replace('학기', '');
                        parts.push(`semester.ilike.${semNum}학기%`);
                    }

                    if (db.subject) {
                        parts.push(`subject.eq.${db.subject}`);
                    }

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
            if (advancedFilters.concepts && advancedFilters.concepts.length > 0) {
                // Use PostgREST array 'overlaps' operator for text[] column to implement OR logic
                query = query.overlaps('key_concepts', advancedFilters.concepts);
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

    const handleStorageItemSelect = async (item: UserItem) => {
        if (item.type === 'personal_db') {
            handleDbToggle(item.reference_id);
        } else if (item.type === 'saved_exam') {
            // [V73] Toggle Selection instead of instant load
            setSelectedExamIds(prev => {
                if (prev.includes(item.id)) return prev.filter(id => id !== item.id);
                return [...prev, item.id];
            });
        } else {
            alert('알 수 없는 파일 형식입니다.');
        }
    };

    // [V73] Dedicated Load function for editing
    const handleEditSelectedExam = async () => {
        if (selectedExamIds.length === 0) return alert('수정할 시험지를 선택해주세요.');
        if (selectedExamIds.length > 1) return alert('한 번에 하나의 시험지만 수정할 수 있습니다.');

        const examId = selectedExamIds[0];
        setLoading(true);
        try {
            // Fetch the item to get details (question_ids)
            const { data: item, error: itemError } = await supabase
                .from('user_items')
                .select('*')
                .eq('id', examId)
                .single();

            if (itemError || !item) throw new Error("시험지 정보를 불러올 수 없습니다.");

            const qIds = item.details?.question_ids;
            if (!qIds || !Array.isArray(qIds) || qIds.length === 0) {
                return alert('이 시험지는 재편집 기능을 지원하지 않는 이전 버전입니다. \n방금 업데이트 이후로 새롭게 생성한 시험지부터 재편집이 가능합니다.');
            }

            const { data, error } = await supabase
                .from('questions')
                .select('*, question_images(*)')
                .in('id', qIds);

            if (error) throw error;
            if (!data || data.length === 0) throw new Error('문항 데이터를 불러올 수 없습니다.');

            const sortedData = qIds.map(id => data.find(q => q.id === id)).filter(Boolean);
            setCart(sortedData);
            setViewMode('review');
            setShowStorageModal(false);
            setSelectedExamIds([]); // Reset selection
            alert(`"${item.name}" 시험지 구성을 불러왔습니다. 수정 후 새로운 이름으로 저장할 수 있습니다.`);
        } catch (err: any) {
            console.error("Failed to load exam questions:", err);
            alert("시험지 데이터를 불러오는데 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    // [V73] Bulk Delete for Exams
    const handleBulkDeleteExams = async () => {
        if (selectedExamIds.length === 0) return alert('삭제할 시험지를 선택해주세요.');
        if (!confirm(`${selectedExamIds.length}개의 시험지를 영구 삭제하시겠습니까?`)) return;

        setLoading(true);
        try {
            for (const id of selectedExamIds) {
                await fetch(`/api/storage/items?id=${id}`, { method: 'DELETE' });
            }
            setSelectedExamIds([]);
            setStorageRefreshKey(prev => prev + 1);
            alert('삭제되었습니다.');
        } catch (e) {
            console.error(e);
            alert('삭제 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // [V73] Bulk Download for Exams
    const handleBulkDownloadExams = async () => {
        if (selectedExamIds.length === 0) return alert('다운로드할 시험지를 선택해주세요.');

        setLoading(true);
        try {
            selectedExamIds.forEach((id, idx) => {
                setTimeout(() => {
                    const link = document.createElement('a');
                    link.href = `/api/storage/download?id=${id}`;
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }, idx * 1000); // 1s delay
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSimilarReplace = (oldQ: any, newQ: any) => {
        setCart(prev => {
            const idx = prev.findIndex(item => item.id === oldQ.id);
            if (idx === -1) return prev;
            const newCart = [...prev];
            newCart[idx] = newQ;
            return newCart;
        });
        setSimilarTarget(null);
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

    // 1. Initial Review Block (Switch to Review Mode)
    const handleGenerate = () => {
        if (cart.length === 0) return;
        setViewMode('review');
    };

    // Sorting Logic for Review Mode
    const getDifficultyValue = (diff: any) => {
        if (!diff) return 5; // Default middle
        // If numeric (1-10)
        const num = parseInt(String(diff));
        if (!isNaN(num)) return num;

        // If categorical
        const map: { [key: string]: number } = {
            '하': 2, 'Easy': 2,
            '중': 5, 'Medium': 5,
            '상': 8, 'Hard': 8
        };
        return map[String(diff)] || 5;
    };

    const sortCart = (option: 'original' | 'diff-asc' | 'diff-desc' | 'selection') => {
        let sorted = [...cart];
        if (option === 'diff-asc') sorted.sort((a, b) => getDifficultyValue(a.difficulty) - getDifficultyValue(b.difficulty));
        else if (option === 'diff-desc') sorted.sort((a, b) => getDifficultyValue(b.difficulty) - getDifficultyValue(a.difficulty));
        else if (option === 'original') sorted.sort((a, b) => (a.question_number || 0) - (b.question_number || 0));
        setCart(sorted);
    };

    // Drag and Drop Handlers
    const handleDragStart = (idx: number) => {
        setDraggingIndex(idx);
    };

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        if (draggingIndex === null || draggingIndex === idx) return;

        const newCart = [...cart];
        const draggedItem = newCart[draggingIndex];
        newCart.splice(draggingIndex, 1);
        newCart.splice(idx, 0, draggedItem);

        setDraggingIndex(idx);
        setCart(newCart);
    };

    const handleDragEnd = () => {
        setDraggingIndex(null);
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
            setViewMode('search');

            // [V72] Refresh storage data & Invalidate cache
            setStorageRefreshKey(prev => prev + 1);
            fetch('/api/storage/folders?mode=all')
                .then(res => res.json())
                .then(data => {
                    if (data && !data.error) setStorageInitialData(data);
                });

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
                {/* Storage Modal - Persistent Rendering for 0s Loading */}
                <div className={`fixed inset-0 z-50 items-center justify-center bg-black/50 backdrop-blur-sm p-8 ${showStorageModal ? 'flex' : 'hidden'}`}>
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
                                selectedIds={storageModalMode === 'exam' ? selectedExamIds : selectedDbIds}
                                filterType={storageModalMode}
                                initialData={storageInitialData}
                                refreshKey={storageRefreshKey}
                            />
                        </div>
                        <div className="p-4 border-t bg-slate-50 flex justify-between items-center">
                            <div className="flex gap-2">
                                {/* Actions for Exams */}
                                {storageModalMode === 'exam' && selectedExamIds.length > 0 && (
                                    <>
                                        <button
                                            onClick={handleBulkDownloadExams}
                                            className="px-4 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-lg hover:bg-indigo-100 transition flex items-center gap-2 border border-indigo-200"
                                        >
                                            <FileText size={16} /> 선택 다운로드 ({selectedExamIds.length})
                                        </button>
                                        <button
                                            onClick={handleEditSelectedExam}
                                            className="px-4 py-2 bg-purple-50 text-purple-700 font-bold rounded-lg hover:bg-purple-100 transition flex items-center gap-2 border border-purple-200"
                                        >
                                            <Search size={16} /> 수정/재편집
                                        </button>
                                        <button
                                            onClick={handleBulkDeleteExams}
                                            className="px-4 py-2 bg-red-50 text-red-700 font-bold rounded-lg hover:bg-red-100 transition flex items-center gap-2 border border-red-200"
                                        >
                                            <Trash2 size={16} /> 선택 삭제
                                        </button>
                                    </>
                                )}
                                {/* Actions for DBs (Legacy Support) */}
                                {storageModalMode === 'db' && selectedDbIds.length > 0 && (
                                    <>
                                        <button
                                            onClick={() => {
                                                selectedDbIds.forEach((id, idx) => {
                                                    setTimeout(() => {
                                                        window.location.href = `/api/storage/download?id=${id}`;
                                                    }, idx * 1000);
                                                });
                                            }}
                                            className="px-4 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-lg hover:bg-indigo-100 transition flex items-center gap-2 border border-indigo-200"
                                        >
                                            <FileText size={16} /> 선택 다운로드
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!confirm('선택한 DB 항목을 보관함에서 제거하시겠습니까? (실제 데이터는 보존됩니다)')) return;
                                                for (const id of selectedDbIds) {
                                                    await fetch(`/api/storage/items?id=${id}`, { method: 'DELETE' });
                                                }
                                                setSelectedDbIds([]);
                                                setStorageRefreshKey(prev => prev + 1);
                                            }}
                                            className="px-4 py-2 bg-red-50 text-red-700 font-bold rounded-lg hover:bg-red-100 transition flex items-center gap-2 border border-red-200"
                                        >
                                            <Trash2 size={16} /> 선택 삭제
                                        </button>
                                    </>
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    if (storageModalMode === 'db') {
                                        setShowDuplicateModal(true);
                                    } else {
                                        setShowStorageModal(false);
                                        setSelectedExamIds([]); // Reset selection on close
                                    }
                                }}
                                className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900 transition"
                            >
                                {storageModalMode === 'db' ? '선택 완료' : '창 닫기'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Question Preview Overlay */}
                <QuestionPreview
                    question={previewQuestion}
                    position={previewPos}
                    onClose={() => setPreviewQuestion(null)}
                />

                {/* Sidebar for Filters - Hidden in Review Mode */}
                <div className={`w-64 bg-white border-r flex flex-col z-20 transition-all duration-300 ${viewMode === 'review' ? 'opacity-0 -ml-64 invisible' : 'opacity-100 ml-0 visible'}`}>
                    <div className="p-4 border-b space-y-2">
                        <h2 className="font-bold text-lg text-slate-800">문제 풀(Pool)</h2>
                        {/* ... existing DB selectors ... */}
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

                        {/* Selected DB count block removed per user request */}
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

                {/* Main List Area */}
                <div className="flex-1 p-6 overflow-y-auto">
                    {viewMode === 'search' ? (
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
                    ) : (
                        <header className="flex flex-col gap-4 mb-8">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h1 className="text-2xl font-black text-slate-800">시험지 문항 검토</h1>
                                    <p className="text-sm text-slate-500 mt-1">출제할 문항들의 순서와 난이도를 최종적으로 확인하세요.</p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setViewMode('search')}
                                        className="px-5 py-2.5 border border-slate-300 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                                    >
                                        <span>← 검색으로 돌아가기</span>
                                    </button>
                                    <button
                                        onClick={() => setShowConfigModal(true)}
                                        className="px-8 py-2.5 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 shadow-lg shadow-brand-600/20 transition-all flex items-center gap-2"
                                    >
                                        <span>최종 생성하기 ({cart.length})</span>
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white border rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest pl-2">Quick Sort</span>
                                <div className="h-6 w-px bg-slate-200 mx-1"></div>
                                <button onClick={() => sortCart('original')} className="px-4 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 transition-all">
                                    원본 번호순
                                </button>
                                <button onClick={() => sortCart('diff-asc')} className="px-4 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 transition-all">
                                    난이도 낮은순
                                </button>
                                <button onClick={() => sortCart('diff-desc')} className="px-4 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 transition-all">
                                    난이도 높은순
                                </button>
                            </div>
                        </header>
                    )}

                    {loading && viewMode === 'search' ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : (
                        <div className={`grid grid-cols-1 md:grid-cols-2 ${viewMode === 'review' ? 'lg:grid-cols-3 xl:grid-cols-4' : 'lg:grid-cols-3'} gap-6 pb-20 animate-in fade-in duration-500`}>
                            {(viewMode === 'search' ? questions : cart).length > 0 ? (viewMode === 'search' ? questions : cart).map((q, idx) => {
                                const inCart = q && cartIdSet.has(q.id);
                                return (
                                    <div
                                        key={`${viewMode}-${q.id}`}
                                        onClick={() => viewMode === 'search' && toggleCart(q)}
                                        draggable={viewMode === 'review'}
                                        onDragStart={() => viewMode === 'review' && handleDragStart(idx)}
                                        onDragOver={(e) => viewMode === 'review' && handleDragOver(e, idx)}
                                        onDragEnd={() => viewMode === 'review' && handleDragEnd()}
                                        className={`relative rounded-2xl shadow-sm border transition flex flex-col overflow-hidden group
                                            ${viewMode === 'review' ? (draggingIndex === idx ? 'opacity-40 scale-95 border-brand-500 border-dashed' : 'bg-white border-slate-200 cursor-move hover:border-brand-300 hover:shadow-md') :
                                                inCart ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500 shadow-md cursor-pointer' : 'bg-white hover:shadow-lg border-gray-200 cursor-pointer'}
                                        `}
                                    >
                                        {/* Header */}
                                        <div className="flex justify-between items-center p-4 border-b bg-gray-50/50">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-sm ${viewMode === 'review' ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                                    {idx + 1}
                                                </span>
                                                <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-md font-bold">
                                                    {q.unit || '단원 미정'}
                                                </span>
                                                <span className="text-[11px] font-bold text-gray-500">
                                                    원본 {q.question_number}번
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {viewMode === 'review' && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setSimilarTarget(q); }}
                                                        className="p-1 hover:bg-brand-50 text-slate-300 hover:text-brand-600 rounded-md transition-all flex items-center gap-1"
                                                        title="유사문항 찾기"
                                                    >
                                                        <Search size={14} />
                                                        <span className="text-[10px] font-bold">유사</span>
                                                    </button>
                                                )}
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${String(q.difficulty) === 'Hard' || String(q.difficulty) === '상' ? 'bg-red-100 text-red-700' :
                                                    String(q.difficulty) === 'Easy' || String(q.difficulty) === '하' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                    {q.difficulty || '중'}
                                                </span>
                                                {viewMode === 'review' && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); toggleCart(q); }}
                                                        className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-md transition-all"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="p-5 bg-white flex-1 min-h-[160px]">
                                            <QuestionRenderer
                                                xmlContent={q.content_xml}
                                                externalImages={q.question_images}
                                                displayMode="question"
                                                showDownloadAction={false}
                                                className="border-none shadow-none p-0 !text-base"
                                            />
                                        </div>

                                        {/* Meta/Actions Footer */}
                                        <div className="px-4 py-3 bg-slate-50 border-t flex items-center justify-between">
                                            <div className="text-[10px] text-slate-400 font-medium truncate flex-1 pr-2">
                                                {q.school} {q.exam_year}
                                            </div>
                                            {viewMode === 'search' && (
                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        className="text-slate-400 hover:text-brand-600 transition-colors"
                                                        onClick={(e) => { e.stopPropagation(); setSolutionTarget(q); }}
                                                    >
                                                        <FileText size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="col-span-full text-center py-20 text-slate-400 bg-white rounded-2xl border border-dashed flex flex-col items-center justify-center gap-4">
                                    <Database size={48} className="text-slate-200" />
                                    <p className="text-lg font-medium text-slate-500">
                                        {viewMode === 'review' ? '출제할 문항이 없습니다.' :
                                            selectedDbIds.length > 0 ? '조건 설정 후 "검색하기" 버튼을 눌러주세요.' : 'DB를 먼저 선택해주세요.'}
                                    </p>
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
                        onClose={() => setSimilarTarget(null)}
                        baseQuestion={similarTarget}
                        cart={cart}
                        onToggleCart={toggleCart}
                        onReplace={viewMode === 'review' ? handleSimilarReplace : undefined}
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
