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
import { Folder as FolderIcon, Database, X, Trash2, FileText, Search, CheckSquare } from 'lucide-react';
import type { UserItem } from '@/types/storage';

export default function QuestionBankPage() {
    const [questions, setQuestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [cart, setCart] = useState<any[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalQuestions, setTotalQuestions] = useState(0);
    const itemsPerPage = 50;

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
    const [isAutoAdding, setIsAutoAdding] = useState(false);
    const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set());
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [similarTarget, setSimilarTarget] = useState<any | null>(null);
    const [solutionTarget, setSolutionTarget] = useState<any | null>(null);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [viewMode, setViewMode] = useState<'search' | 'review'>('search');
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [showAutoModal, setShowAutoModal] = useState(false);
    const [user, setUser] = useState<any>(null);
    const isAdmin = user?.email === 'mathofhy@naver.com';

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
    const [currentExamItems, setCurrentExamItems] = useState<any[]>([]); // tracks viewItems from FolderExplorer

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
                // 어드민: 전체 DB를 user_items에 자동 동기화
                if (data.user.email === 'mathofhy@naver.com') {
                    fetch('/api/storage/sync', { method: 'POST' })
                        .then(() => setStorageRefreshKey(prev => prev + 1));
                }
                fetchPurchasedDbs(data.user.id, data.user.email ?? undefined);
                fetchMyPoints(data.user.id);
            }
        });

        // Do NOT fetch questions initially. Require DB selection.
        setLoading(false);
    }, []);

    const fetchPurchasedDbs = async (userId: string, userEmail?: string) => {
        const isAdmin = userEmail === 'mathofhy@naver.com';

        // Admin: 구매 여부 무관하게 전체 DB 조회
        if (isAdmin) {
            const { data: allData } = await supabase
                .from('exam_materials')
                .select('id, title, school, grade, semester, exam_type, subject, file_type, exam_year')
                .eq('file_type', 'DB');
            if (allData) setPurchasedDbs(allData);
            return;
        }

        // [V105.1] Modification for Free Mock Exams
        // 1. Get user's purchased DBs
        const { data: purchasedData, error: purchaseError } = await supabase
            .from('purchases')
            .select(`
                *,
                exam_materials!inner (
                    id, title, school, grade, semester, exam_type, subject, file_type, exam_year
                )
            `)
            .eq('user_id', userId)
            .eq('exam_materials.file_type', 'DB');

        // 2. Get all Mock Exams (Free for everyone)
        const { data: mockData, error: mockError } = await supabase
            .from('exam_materials')
            .select('id, title, school, grade, semester, exam_type, subject, file_type, exam_year')
            .eq('exam_type', '모의고사')
            .eq('file_type', 'DB');

        // 3. Get all Police Academy & Military Academy DBs (Free for everyone)
        const FREE_SCHOOLS = ['경찰대학교', '육군사관학교', '해군사관학교', '공군사관학교', '국군간호사관학교'];
        const { data: freeSpecialData } = await supabase
            .from('exam_materials')
            .select('id, title, school, grade, semester, exam_type, subject, file_type, exam_year')
            .in('school', FREE_SCHOOLS)
            .eq('file_type', 'DB');

        let dbs: any[] = [];
        
        if (purchasedData) {
            dbs = [...dbs, ...purchasedData.map((p: any) => p.exam_materials)];
        }
        if (mockData) {
            dbs = [...dbs, ...mockData];
        }
        if (freeSpecialData) {
            dbs = [...dbs, ...freeSpecialData];
        }

        // Remove duplicates just in case (e.g., if someone actually bought a mock exam)
        const uniqueDbs = Array.from(new Map(dbs.map(item => [item.id, item])).values());
        setPurchasedDbs(uniqueDbs);

    };

    const fetchQuestions = async (dbFilter?: any, advancedFilters?: any, targetPage: number = 1) => {
        // Security: Do not fetch ANY questions if no specific DB filter is provided
        // This prevents leaking 'sorted' questions that the user hasn't purchased.
        if (!dbFilter) {
            setQuestions([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        if (targetPage === 1) setCurrentPage(1);

        const from = (targetPage - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        let query = supabase
            .from('questions')
            .select('id, question_number, content_xml, plain_text, equation_scripts, subject, grade, school, year, semester, difficulty, key_concepts, unit, work_status, source_db_id', { count: 'exact' })
            .eq('work_status', 'sorted')
            .order('question_number', { ascending: true })
            .range(from, to);

        if (dbFilter.length > 0) {
            const selectedDbs = purchasedDbs.filter(d => dbFilter.includes(d.id));

            if (selectedDbs.length > 0) {
                // 전체 DB가 선택된 경우 DB 필터 생략 (단원/과목 필터만으로 검색)
                const isAllSelected = selectedDbs.length >= purchasedDbs.length;

                if (!isAllSelected) {
                    if (selectedDbs.length > 20) {
                        // 20개 초과 시 school IN(...)으로 단순화 (쿼리 성능)
                        const schools = [...new Set(selectedDbs.map(db => db.school))];
                        query = query.in('school', schools);
                    } else {
                        // 20개 이하: 정확한 메타데이터 매칭
                        const orConditions = selectedDbs.map(db => {
                            let gradeVal = db.grade;
                            if (db.grade && ['1', '2', '3'].includes(String(db.grade).replace('고', ''))) {
                                gradeVal = `고${String(db.grade).replace('고', '')}`;
                            }
                            const titleYear = db.title?.match(/20\d{2}/)?.[0];
                            const yearVal = titleYear ? titleYear : (db.exam_year || db.year);

                            let parts = [`school.eq.${db.school}`];
                            if (gradeVal) parts.push(`grade.eq.${gradeVal}`);
                            if (yearVal) parts.push(`year.eq.${yearVal}`);

                            if (db.exam_type === '모의고사' || db.exam_type === '수능') {
                                parts.push(`semester.in.("${db.semester}월","${db.semester}월 모의고사")`);
                            } else if (db.semester && db.exam_type) {
                                const semNum = String(db.semester).replace('학기', '');
                                const typeShort = db.exam_type.includes('중간') ? '중간' : (db.exam_type.includes('기말') ? '기말' : '');
                                if (typeShort) parts.push(`semester.eq.${semNum}학기${typeShort}`);
                            } else if (db.semester) {
                                const semNum = String(db.semester).replace('학기', '');
                                parts.push(`semester.ilike.${semNum}학기%`);
                            }
                            if (db.subject && db.subject !== '전과정') {
                                // 모의고사/수능 선택과목 DB: 공통(1~22번, 대수+미적분I) + 선택과목(23~30번) 함께 조회
                                const MOCK_SELECT_SUBJECTS = ['기하와벡터', '미적분II', '확률과통계', '확률과 통계'];
                                const isMockSelect = (db.exam_type === '모의고사' || db.exam_type === '수능')
                                    && MOCK_SELECT_SUBJECTS.includes(db.subject);
                                if (isMockSelect) {
                                    parts.push(`subject.in.("대수","미적분I","${db.subject}")`);
                                } else {
                                    parts.push(`subject.eq.${db.subject}`);
                                }
                            }
                            return `and(${parts.join(',')})`;
                        });
                        if (orConditions.length > 0) query = query.or(orConditions.join(','));
                    }
                }
                // isAllSelected이면 DB 필터 생략 → 단원/과목 필터만 적용
            } else {
                // 매칭 DB 없으면 결과 0건 보장
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

        try {
            const { data, error, count } = await query;
            if (error) {
                console.error("Query Error:", error);
                throw new Error("데이터베이스 검색 중 오류가 발생했습니다. (검색 조건이 너무 많을 수 있습니다)");
            }
            if (data) {
                // 이미지 별도 조회 (병렬) - JOIN 제거로 메인 쿼리 속도 향상
                const questionIds = data.map((q: any) => q.id);
                let questionsWithImages = data.map((q: any) => ({ ...q, question_images: [] }));
                if (questionIds.length > 0) {
                    const { data: imgData } = await supabase
                        .from('question_images')
                        .select('question_id, data, id, original_bin_id, format')
                        .in('question_id', questionIds);
                    if (imgData && imgData.length > 0) {
                        const imgMap: Record<string, any[]> = {};
                        imgData.forEach((img: any) => {
                            if (!imgMap[img.question_id]) imgMap[img.question_id] = [];
                            imgMap[img.question_id].push(img);
                        });
                        questionsWithImages = questionsWithImages.map((q: any) => ({
                            ...q,
                            question_images: imgMap[q.id] || []
                        }));
                    }
                }
                setQuestions(questionsWithImages);
                if (count !== null) setTotalQuestions(count);
                if (targetPage === 1) setHasSearched(true);
                if (data.length === 0 && targetPage === 1) {
                    alert('해당 조건에 일치하는 문항이 없습니다. (0건)');
                }
            }
        } catch (err: any) {
            console.error("fetchQuestions error:", err);
            alert(`검색 실패: ${err.message || '오류가 발생했습니다.'}`);
            setQuestions([]);
        } finally {
            setLoading(false);
        }

    };

    const handleSearch = () => {
        if (selectedDbIds.length === 0) {
            alert('DB를 먼저 선택해주세요.');
            return;
        }
        setHasSearched(false);
        fetchQuestions(selectedDbIds, filterState, 1);
    };

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        fetchQuestions(selectedDbIds, filterState, newPage);
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
            // 개인디비 선택 시 창이 닫히지 않음 - 조건검색하기 버튼에서 닫힘
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

    // [유사문제 삽입] baseQuestion 바로 뒤에 삽입 (이미 추가된 유사문제들 뒤로)
    const handleAddSimilarAfter = (baseQ: any, newQ: any) => {
        setCart(prev => {
            const alreadyIn = prev.find(q => q.id === newQ.id);
            if (alreadyIn) {
                // 이미 담긴 경우 → 제거
                return prev.filter(q => q.id !== newQ.id);
            }
            // 50개 제한 체크
            if (prev.length >= MAX_CART_SIZE) {
                alert(`한 시험지에 최대 ${MAX_CART_SIZE}문제까지만 담을 수 있습니다.`);
                return prev;
            }
            const baseIdx = prev.findIndex(q => q.id === baseQ.id);
            if (baseIdx === -1) return [...prev, { ...newQ, _similarOf: baseQ.id }];
            // baseQ 뒤에 이미 있는 유사문제들을 건너뛰고 삽입
            let insertAt = baseIdx + 1;
            while (insertAt < prev.length && prev[insertAt]._similarOf === baseQ.id) {
                insertAt++;
            }
            const newCart = [...prev];
            newCart.splice(insertAt, 0, { ...newQ, _similarOf: baseQ.id });
            return newCart;
        });
    };

    // [유사문항 자동추가] 선택된 카드만 (없으면 전체) 유사도 1위 자동 삽입
    const handleAutoAddSimilar = async () => {
        if (cart.length === 0) return;
        setIsAutoAdding(true);

        // 선택된 카드가 있으면 그것만, 없으면 원본 문제 전체
        const targetQuestions = selectedReviewIds.size > 0
            ? cart.filter(q => !q._similarOf && selectedReviewIds.has(q.id))
            : cart.filter(q => !q._similarOf);

        let updatedCart = [...cart];
        let addedCount = 0;
        let skippedCount = 0;

        for (const baseQ of targetQuestions) {
            // 50개 제한 체크 (루프 중에도 매번 확인)
            if (updatedCart.length >= MAX_CART_SIZE) {
                skippedCount++;
                continue;
            }
            try {
                const res = await fetch(`/api/pro/similar-questions?id=${baseQ.id}&limit=1`);
                if (!res.ok) continue;
                const data = await res.json();
                if (!data.success || !data.data || data.data.length === 0) continue;

                const topSimilar = data.data[0];
                if (updatedCart.find(q => q.id === topSimilar.id)) continue;

                const baseIdx = updatedCart.findIndex(q => q.id === baseQ.id);
                if (baseIdx === -1) continue;

                let insertAt = baseIdx + 1;
                while (insertAt < updatedCart.length && updatedCart[insertAt]._similarOf === baseQ.id) {
                    insertAt++;
                }
                updatedCart = [
                    ...updatedCart.slice(0, insertAt),
                    { ...topSimilar, _similarOf: baseQ.id },
                    ...updatedCart.slice(insertAt)
                ];
                addedCount++;
            } catch (e) {
                console.error(`유사문제 조회 실패 (Q: ${baseQ.id})`, e);
            }
        }

        setCart(updatedCart);
        setSelectedReviewIds(new Set()); // 선택 해제
        setIsAutoAdding(false);
        if (skippedCount > 0) {
            alert(`유사문항 자동추가 완료! ${addedCount}개 추가됨. (최대 ${MAX_CART_SIZE}문제 제한으로 ${skippedCount}개 생략)`);
        } else {
            alert(`유사문항 자동추가 완료! ${addedCount}개 추가됨`);
        }
    };

    const MAX_CART_SIZE = 50;

    const toggleCart = (question: any) => {
        if (cart.find(q => q.id === question.id)) {
            setCart(cart.filter(q => q.id !== question.id));
        } else {
            if (cart.length >= MAX_CART_SIZE) {
                alert(`한 시험지에 최대 ${MAX_CART_SIZE}문제까지만 담을 수 있습니다.`);
                return;
            }
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
            const currentCart = Array.isArray(cart) ? cart : [];
            const remaining = MAX_CART_SIZE - currentCart.length;
            if (remaining <= 0) {
                alert(`한 시험지에 최대 ${MAX_CART_SIZE}문제까지만 담을 수 있습니다.`);
                return;
            }
            if (toAdd.length > remaining) {
                alert(`최대 ${MAX_CART_SIZE}문제 제한으로 인해 ${remaining}개만 추가됩니다. (요청: ${toAdd.length}개)`);
            }
            setCart(prev => [...(Array.isArray(prev) ? prev : []), ...toAdd.slice(0, remaining)]);
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
    const [showMobileSidebar, setShowMobileSidebar] = useState(false);

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
                                key={storageModalMode}
                                onItemSelect={handleStorageItemSelect}
                                onSelectAll={(items) => {
                                    const ids = items
                                        .filter(i => i.type === 'saved_exam' || i.type === 'personal_db')
                                        .map(i => i.reference_id || i.id);
                                    if (storageModalMode === 'exam') setSelectedExamIds(ids);
                                    else setSelectedDbIds(ids);
                                }}
                                selectedIds={storageModalMode === 'exam' ? selectedExamIds : selectedDbIds}
                                filterType={storageModalMode}
                                refreshKey={storageRefreshKey}
                                onGetViewItems={(items) => setCurrentExamItems(items)}
                            />
                        </div>
                        <div className="p-4 border-t bg-slate-50 flex justify-between items-center">
                            <div className="flex gap-2">
                                {/* Actions for DBs - 전체 선택 */}
                                {storageModalMode === 'db' && (
                                    <button
                                        onClick={() => {
                                            const ids = currentExamItems
                                                .filter(i => i.type === 'personal_db')
                                                .map(i => i.reference_id || i.id);
                                            setSelectedDbIds(prev => {
                                                const allSelected = ids.every(id => prev.includes(id));
                                                return allSelected ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])];
                                            });
                                        }}
                                        className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200 transition flex items-center gap-2 border border-slate-200"
                                    >
                                        <CheckSquare size={16} /> 전체 선택
                                    </button>
                                )}
                                {/* Actions for Exams */}
                                {storageModalMode === 'exam' && (
                                    <button
                                        onClick={() => {
                                            const ids = currentExamItems
                                                .filter(i => i.type === 'saved_exam')
                                                .map(i => i.reference_id || i.id);
                                            setSelectedExamIds(ids);
                                        }}
                                        className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200 transition flex items-center gap-2 border border-slate-200"
                                    >
                                        <CheckSquare size={16} /> 전체 선택
                                    </button>
                                )}
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

                            </div>
                            <button
                                onClick={() => {
                                    if (storageModalMode === 'db') {
                                        setShowStorageModal(false); // StorageModal 먼저 닫기 (필터 버튼 정상 작동)
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

                {/* Mobile overlay */}
                {showMobileSidebar && viewMode !== 'review' && (
                    <div
                        className="fixed inset-0 z-40 bg-black/40 md:hidden"
                        onClick={() => setShowMobileSidebar(false)}
                    />
                )}
                {/* Sidebar for Filters - Hidden in Review Mode */}
                <div className={`${
                    viewMode === 'review'
                        ? 'hidden'
                        : showMobileSidebar
                            ? 'fixed bottom-0 left-0 right-0 z-50 bg-white border-t rounded-t-2xl shadow-2xl flex flex-col w-full max-h-[85vh] md:relative md:bottom-auto md:z-20 md:border-t-0 md:border-r md:rounded-none md:shadow-none md:w-64 md:max-h-full'
                            : 'hidden md:flex md:flex-col md:w-64 md:bg-white md:border-r md:z-20'
                }`}>
                    {/* Mobile bottom-sheet handle */}
                    <div className="flex items-center justify-between px-4 pt-3 pb-0 md:hidden">
                        <div className="w-8 h-1 rounded-full bg-slate-300 mx-auto" />
                        <button
                            onClick={() => setShowMobileSidebar(false)}
                            className="absolute right-4 top-3 text-slate-400 hover:text-slate-600 text-xl font-bold"
                        >×</button>
                    </div>
                    <div className="p-4 border-b space-y-2">
                        <h2 className="font-bold text-lg text-slate-800">문제 풀(Pool)</h2>
                        {/* ... existing DB selectors ... */}
                        <div className="flex gap-2 mb-2">
                            <button
                                onClick={() => {
                                    setStorageModalMode('db');
                                    setShowStorageModal(true);
                                    setShowMobileSidebar(false);
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
                                    setShowMobileSidebar(false);
                                }}
                                className="flex-1 py-3 px-3 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl hover:bg-purple-100 flex items-center justify-center gap-2 font-bold text-sm transition-colors whitespace-nowrap"
                            >
                                <FolderIcon size={16} />
                                만든 시험지
                            </button>
                        </div>
                        {/* 관리자 전체 DB 선택 버튼 */}
                        {isAdmin && purchasedDbs.length > 0 && (
                            <button
                                onClick={() => {
                                    const allIds = purchasedDbs.map((d: any) => d.id);
                                    setSelectedDbIds(allIds);
                                }}
                                className="w-full py-2 px-3 bg-amber-50 text-amber-700 border border-amber-300 rounded-xl hover:bg-amber-100 flex items-center justify-center gap-2 font-bold text-xs transition-colors"
                            >
                                ⚡ 관리자: 전체 DB 선택 ({purchasedDbs.length}개)
                            </button>
                        )}

                        {/* Selected DB count block removed per user request */}
                    </div>

                    {/* Advanced Filters */}
                    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                        {/* 모바일에서만 보이는 필터 섹션 타이틀 */}
                        <div className="md:hidden px-4 pt-3 pb-1 border-b">
                            <h3 className="font-bold text-sm text-slate-700 flex items-center gap-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                                상세 필터
                            </h3>
                        </div>
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
                                onClick={() => {
                                    handleSearch();
                                    setShowMobileSidebar(false);
                                    setShowStorageModal(false);
                                }}
                                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                            >
                                <span>조건 검색하기</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main List Area */}
                <div className="flex-1 overflow-y-auto relative">
                    {viewMode === 'search' ? (
                        <header className="sticky top-0 z-10 flex justify-between items-center px-3 sm:px-6 py-2 sm:py-4 bg-gray-100/90 backdrop-blur-sm border-b border-slate-200/60 shadow-sm">
                            <div className="flex items-center gap-2 min-w-0">
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
                            </div>
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
                                    <span>시험지 생성 ({cart.length}/{MAX_CART_SIZE})</span>
                                </button>
                                <button
                                    onClick={() => setShowAutoModal(true)}
                                    className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 shadow-sm transition font-bold whitespace-nowrap text-sm"
                                >
                                    자동생성
                                </button>
                            </div>
                        </header>
                    ) : (
                        <header className="sticky top-0 z-10 flex flex-col gap-4 px-3 sm:px-6 py-2 sm:py-4 bg-gray-100/90 backdrop-blur-sm border-b border-slate-200/60 shadow-sm">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h1 className="text-2xl font-black text-slate-800">시험지 문항 검토</h1>
                                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                        <p className="text-sm text-slate-500">출제할 문항들의 순서와 난이도를 최종적으로 확인하세요.</p>
                                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
                                            카드를 드래그해서 순서 변경
                                        </span>
                                    </div>
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
                                        <span>최종 생성하기 ({cart.length}/{MAX_CART_SIZE})</span>
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white border rounded-2xl p-4 flex items-center gap-4 shadow-sm justify-between">
                                <div className="flex items-center gap-4">
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
                                {/* 유사문항 자동추가 영역 */}
                                <div className="flex flex-col items-end gap-1">
                                    <div className="flex items-center gap-2">
                                        {/* 선택 상태 안내 */}
                                        {selectedReviewIds.size > 0 ? (
                                            <span className="text-[11px] font-bold text-violet-700 bg-violet-100 px-2 py-1 rounded-full">
                                                ✓ {selectedReviewIds.size}개 선택됨
                                            </span>
                                        ) : (
                                            <span className="text-[11px] text-slate-400 hidden sm:block">
                                                번호 클릭 → 선택
                                            </span>
                                        )}
                                        <button
                                            onClick={handleAutoAddSimilar}
                                            disabled={isAutoAdding || cart.length === 0}
                                            className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm whitespace-nowrap"
                                        >
                                            {isAutoAdding ? (
                                                <>
                                                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                                    </svg>
                                                    분석 중...
                                                </>
                                            ) : selectedReviewIds.size > 0 ? (
                                                <>🔗 선택 {selectedReviewIds.size}개 유사추가</>
                                            ) : (
                                                <>🔗 유사문항 자동추가</>
                                            )}
                                        </button>
                                    </div>
                                    {/* 사용법 힌트 */}
                                    <p className="text-[10px] text-slate-400 pr-1">
                                        {selectedReviewIds.size > 0
                                            ? '선택한 문제에만 유사문항이 추가됩니다'
                                            : '문제 번호를 클릭하면 선택, 선택 후 누르면 선택 문제만 추가'}
                                    </p>
                                </div>
                            </div>
                        </header>
                    )}

                    {loading && viewMode === 'search' ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : (
                        <>
                            <div className={`grid grid-cols-1 md:grid-cols-2 ${viewMode === 'review' ? 'lg:grid-cols-3 xl:grid-cols-4' : 'lg:grid-cols-3'} gap-6 px-6 pt-6 pb-10 animate-in fade-in duration-500`}>
                                {(viewMode === 'search' ? questions : cart).length > 0 ? (viewMode === 'search' ? questions : cart).map((q, idx) => {
                                    const inCart = q && cartIdSet.has(q.id);
                                return (
                                    <div
                                        key={`${viewMode}-${q.id}`}
                                        onClick={() => viewMode === 'search' && toggleCart(q)}
                                        draggable={viewMode === 'review'}
                                        onDragStart={(e) => {
                                            if (viewMode !== 'review') return;
                                            // data-no-drag 요소에서 시작된 드래그는 차단 (번호 뱃지 클릭)
                                            const t = e.target as HTMLElement;
                                            if (t.closest('[data-no-drag]')) {
                                                e.preventDefault();
                                                return;
                                            }
                                            handleDragStart(idx);
                                        }}
                                        onDragOver={(e) => viewMode === 'review' && handleDragOver(e, idx)}
                                        onDragEnd={() => viewMode === 'review' && handleDragEnd()}
                                        className={`relative rounded-2xl shadow-sm border transition flex flex-col overflow-hidden group min-h-[500px] sm:h-[630px]
                                            ${viewMode === 'review'
                                                ? draggingIndex === idx
                                                    ? 'opacity-40 scale-95 border-brand-500 border-dashed'
                                                    : selectedReviewIds.has(q.id)
                                                        ? 'bg-violet-50 border-violet-500 ring-2 ring-violet-400 cursor-move hover:shadow-md'
                                                        : 'bg-white border-slate-200 cursor-move hover:border-brand-300 hover:shadow-md'
                                                : inCart ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500 shadow-md cursor-pointer' : 'bg-white hover:shadow-lg border-gray-200 cursor-pointer'}
                                        `}
                                    >
                                        {/* Header */}
                                        <div className="flex justify-between items-center p-4 border-b bg-gray-50/50">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {/* 번호 뱃지 클릭 시 선택/해제 토글 */}
                                                <span
                                                    data-no-drag="true"
                                                    onMouseDown={(e) => {
                                                        if (viewMode === 'review' && !q._similarOf) e.stopPropagation();
                                                    }}
                                                    onClick={(e) => {
                                                        if (viewMode !== 'review' || q._similarOf) return;
                                                        e.stopPropagation();
                                                        e.preventDefault();
                                                        setSelectedReviewIds(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(q.id)) next.delete(q.id);
                                                            else next.add(q.id);
                                                            return next;
                                                        });
                                                    }}
                                                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-sm transition-colors select-none
                                                        ${viewMode === 'review' && !q._similarOf ? 'cursor-pointer' : ''}
                                                        ${selectedReviewIds.has(q.id)
                                                            ? 'bg-violet-600 text-white ring-2 ring-violet-400'
                                                            : viewMode === 'review' ? 'bg-brand-600 text-white hover:bg-violet-500' : 'bg-slate-200 text-slate-500'
                                                        }`}
                                                    title={viewMode === 'review' && !q._similarOf ? '클릭하여 선택' : ''}
                                                >
                                                    {selectedReviewIds.has(q.id) ? '✓' : idx + 1}
                                                </span>
                                                {/* [유사문제 뱃지] _similarOf가 있으면 원본 문제 번호 표시 */}
                                                {viewMode === 'review' && q._similarOf && (() => {
                                                    const parentIdx = cart.findIndex(c => c.id === q._similarOf);
                                                    return parentIdx !== -1 ? (
                                                        <span className="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded-md font-bold border border-orange-200">
                                                            🔗 {parentIdx + 1}번 유사
                                                        </span>
                                                    ) : null;
                                                })()}
                                                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-md font-bold">
                                                    {q.unit || '단원 미정'}
                                                </span>
                                                <span className="text-[11px] font-bold text-gray-500">
                                                    {q.year && `${q.year}년 `}{q.grade && `${q.grade} `}{q.semester && `${q.semester} `}원본 {q.question_number}번
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {viewMode === 'review' && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setSimilarTarget(q); }}
                                                        className="p-1 hover:bg-brand-50 text-slate-300 hover:text-brand-600 rounded-md transition-all flex items-center gap-1 whitespace-nowrap"
                                                        title="유사문항 찾기"
                                                    >
                                                        <Search size={14} />
                                                        <span className="text-[10px] font-bold">유사</span>
                                                    </button>
                                                )}
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                                                    !q.difficulty ? 'bg-slate-100 text-slate-500' :
                                                    Number(q.difficulty) >= 7 ? 'bg-red-100 text-red-600' :
                                                    Number(q.difficulty) >= 4 ? 'bg-orange-100 text-orange-600' :
                                                    'bg-emerald-100 text-emerald-600'
                                                }`}>
                                                    {q.difficulty ? `Lv.${q.difficulty}` : '미정'}
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
                                        <div className="p-5 bg-white flex-1 min-h-[160px] overflow-y-auto scrollbar-thin">
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
                                                        className="text-[10px] font-bold text-slate-500 hover:text-brand-600 bg-white border border-slate-200 hover:border-brand-300 hover:bg-brand-50 px-2 py-1 rounded-md transition-all flex items-center gap-1 shadow-sm"
                                                        onClick={(e) => { e.stopPropagation(); setSolutionTarget(q); }}
                                                    >
                                                        <FileText size={12} />
                                                        해설보기
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="col-span-full">
                                    {viewMode === 'review' ? (
                                        /* 검토 모드에서 문항이 없을 때 */
                                        <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-dashed flex flex-col items-center justify-center gap-3">
                                            <Database size={48} className="text-slate-200" />
                                            <p className="text-lg font-medium text-slate-500">출제할 문항이 없습니다.</p>
                                            <p className="text-sm text-slate-400">검색으로 돌아가서 문제를 담아주세요.</p>
                                        </div>
                                    ) : hasSearched ? (
                                        /* 검색했지만 결과 없음 */
                                        <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-dashed flex flex-col items-center justify-center gap-3">
                                            <Search size={48} className="text-slate-200" />
                                            <p className="text-lg font-medium text-slate-500">조건에 맞는 문제가 없습니다 (0건)</p>
                                            <p className="text-sm text-slate-400">필터 조건을 조정하거나 다른 DB를 선택해보세요.</p>
                                        </div>
                                    ) : selectedDbIds.length > 0 ? (
                                        /* DB 선택됨, 아직 검색 안 함 */
                                        <div className="text-center py-20 bg-white rounded-2xl border border-dashed flex flex-col items-center justify-center gap-3">
                                            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                                                <Search size={24} className="text-indigo-500" />
                                            </div>
                                            <p className="text-base font-semibold text-slate-600">왼쪽 필터 조건 설정 후 <span className="text-indigo-600">「조건 검색하기」</span>를 눌러주세요.</p>
                                            <p className="text-sm text-slate-400">단원, 난이도, 키워드를 조합해 원하는 문제를 찾을 수 있어요.</p>
                                        </div>
                                    ) : (
                                        /* 초기 상태 — 전체 사용법 안내 */
                                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                            {/* 헤더 */}
                                            <div className="px-8 pt-8 pb-6 text-center border-b border-slate-100 bg-gradient-to-b from-indigo-50/60 to-white">
                                                <div className="inline-flex items-center gap-2 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full mb-3">
                                                    <span>📋</span> 시험지 출제 사용 가이드
                                                </div>
                                                <h2 className="text-xl font-black text-slate-800">4단계로 나만의 시험지를 만들어보세요</h2>
                                                <p className="text-sm text-slate-500 mt-1">구매한 내신 기출 DB에서 문제를 골라 원하는 구성으로 출제할 수 있어요.</p>
                                            </div>

                                            {/* 스텝 */}
                                            <div className="block sm:hidden px-4 py-4 space-y-3">
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
                                            </div>
                                            <div className="hidden sm:grid grid-cols-4 divide-x divide-slate-100 px-2 py-6">
                                                {/* STEP 1 */}
                                                <div className="flex flex-col items-center gap-3 px-6 text-center">
                                                    <div className="relative">
                                                        <div className="w-14 h-14 rounded-2xl bg-blue-50 border-2 border-blue-200 flex items-center justify-center shadow-sm">
                                                            <Database size={26} className="text-blue-500" />
                                                        </div>
                                                        <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center">1</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-slate-700">DB 선택</p>
                                                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">왼쪽 상단<br/><span className="font-bold text-blue-500">「DB 문제」</span> 버튼을 눌러<br/>사용할 기출 DB를 선택하세요.</p>
                                                    </div>
                                                </div>

                                                {/* STEP 2 */}
                                                <div className="flex flex-col items-center gap-3 px-6 text-center">
                                                    <div className="relative">
                                                        <div className="w-14 h-14 rounded-2xl bg-violet-50 border-2 border-violet-200 flex items-center justify-center shadow-sm">
                                                            <Search size={26} className="text-violet-500" />
                                                        </div>
                                                        <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-violet-500 text-white text-[10px] font-black flex items-center justify-center">2</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-slate-700">조건 검색</p>
                                                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">단원·난이도·키워드 등<br/>필터를 설정하고<br/><span className="font-bold text-violet-500">「조건 검색하기」</span>를 누르세요.</p>
                                                    </div>
                                                </div>

                                                {/* STEP 3 */}
                                                <div className="flex flex-col items-center gap-3 px-6 text-center">
                                                    <div className="relative">
                                                        <div className="w-14 h-14 rounded-2xl bg-green-50 border-2 border-green-200 flex items-center justify-center shadow-sm">
                                                            <span className="text-2xl">✅</span>
                                                        </div>
                                                        <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-green-500 text-white text-[10px] font-black flex items-center justify-center">3</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-slate-700">문제 담기</p>
                                                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">검색된 문제 카드를<br/>클릭해서 담으세요.<br/>담은 수가 상단에 표시돼요.</p>
                                                    </div>
                                                </div>

                                                {/* STEP 4 */}
                                                <div className="flex flex-col items-center gap-3 px-6 text-center">
                                                    <div className="relative">
                                                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border-2 border-indigo-200 flex items-center justify-center shadow-sm">
                                                            <FileText size={26} className="text-indigo-500" />
                                                        </div>
                                                        <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-black flex items-center justify-center">4</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-slate-700">시험지 생성</p>
                                                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">상단 <span className="font-bold text-indigo-500">「시험지 생성」</span>을 눌러<br/>순서·난이도를 검토하고<br/>HML 파일로 저장하세요.</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 하단 팁 */}
                                            <div className="mx-6 mb-6 px-5 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                                                <div className="w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center shrink-0 mt-0.5">
                                                    <span className="text-[10px] font-black">!</span>
                                                </div>
                                                <div className="text-xs text-amber-800 leading-relaxed">
                                                    <span className="font-bold">TIP.</span> 왼쪽 <span className="font-bold text-purple-600">「만든 시험지」</span> 버튼으로 이전에 저장한 시험지를 불러와 편집하거나,
                                                    상단 <span className="font-bold text-purple-600">「자동 생성」</span>으로 조건만 입력하면 AI가 문제를 자동으로 골라드려요.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Pagination (Only in search mode) */}
                        {viewMode === 'search' && totalQuestions > itemsPerPage && !loading && (
                            <div className="py-8 flex justify-center gap-1">
                                <button
                                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                                    disabled={currentPage === 1}
                                    className="w-8 h-8 border border-slate-300 rounded hover:bg-slate-50 flex items-center justify-center text-slate-500 disabled:opacity-30"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="rotate-180"><path d="m9 18 6-6-6-6"/></svg>
                                </button>
                                {Array.from({ length: Math.ceil(totalQuestions / itemsPerPage) }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        onClick={() => handlePageChange(page)}
                                        className={`w-8 h-8 rounded flex items-center justify-center font-bold transition-colors ${currentPage === page ? 'bg-brand-600 text-white' : 'border border-slate-300 hover:bg-slate-50 text-slate-600'}`}
                                    >
                                        {page}
                                    </button>
                                ))}
                                <button
                                    onClick={() => handlePageChange(Math.min(Math.ceil(totalQuestions / itemsPerPage), currentPage + 1))}
                                    disabled={currentPage === Math.ceil(totalQuestions / itemsPerPage)}
                                    className="w-8 h-8 border border-slate-300 rounded hover:bg-slate-50 flex items-center justify-center text-slate-500 disabled:opacity-30"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                </button>
                            </div>
                        )}
                        </>
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
                        onToggleCart={
                            // review 모드: baseQuestion 바로 뒤에 삽입
                            // search 모드: 그냥 맨 뒤에 추가
                            viewMode === 'review'
                                ? (q: any) => handleAddSimilarAfter(similarTarget, q)
                                : toggleCart
                        }
                        onReplace={viewMode === 'review' ? handleSimilarReplace : undefined}
                        onViewSolution={(q: any) => setSolutionTarget(q)}
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
                        // 건너뛰기 → DuplicateModal 닫고 필터 사이드바 자동 열기
                        setShowDuplicateModal(false);
                        setShowStorageModal(false);
                        setShowMobileSidebar(true);
                    }}
                    onCheck={(blockedIds: string[], examName: string) => {
                        const initialCount = selectedDbIds.length;
                        const filteredIds = selectedDbIds.filter(id => !blockedIds.includes(id));
                        const removedCount = initialCount - filteredIds.length;

                        setSelectedDbIds(filteredIds);
                        setShowDuplicateModal(false);
                        setShowStorageModal(false);
                        setShowMobileSidebar(true); // 확인 및 제외 후에도 필터 창 열기

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
