'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { PERSONAL_DB_FREE_MODE } from '@/lib/config';
import SaveLocationModal from '@/components/storage/SaveLocationModal';
import AutoGenModal from '@/components/question-bank/AutoGenModal';
import FolderExplorer from '@/components/storage/FolderExplorer';
import FilterSidebar from '@/components/question-bank/FilterSidebar';
import GuidedTour, { TourStep } from '@/components/GuidedTour';

import QuestionRenderer from '@/components/QuestionRenderer';

// 선생님·강사 시험지 만들기 투어
const TEACHER_TOUR_STEPS: TourStep[] = [
    {
        target: '[data-tour="qb-filter"]',
        title: '① 문제 범위 선택',
        body: PERSONAL_DB_FREE_MODE
            ? '원래는 시험지에 쓸 DB(학교 기출)를 직접 골라야 하지만, 런칭 기념 무료라 전체 DB가 이미 선택돼 있어요. 여기서 과목·단원·난이도로 원하는 문제만 좁히면 돼요.'
            : '시험지에 쓸 DB(학교 기출)를 고르고, 과목·단원·난이도로 원하는 문제만 좁혀요.',
        placement: 'right',
    },
    { target: '[data-tour="qb-search"]', title: '② 조건 검색', body: '고른 조건에 맞는 기출 문제를 불러와요. 결과에서 원하는 문제를 담으면 돼요.', placement: 'right' },
    { target: '[data-tour="qb-auto"]', title: '③ 유사문제 자동생성', body: '단원·난이도만 정하면 유사 유형 문제를 자동으로 골라 시험지를 채워줘요.', placement: 'bottom' },
    { target: '[data-tour="qb-generate"]', title: '④ 시험지 만들기', body: '담은 문제로 나만의 시험지를 만들어요. 완성본은 HWP·개인DB로 받아 편집·인쇄할 수 있어요.', placement: 'bottom' },
];
import DuplicateCheckModal from '@/components/storage/DuplicateCheckModal';

import ConfigModal from '@/components/question-bank/ConfigModal';
import SimilarQuestionsModal from '@/components/question-bank/SimilarQuestionsModal';
import SolutionViewerModal from '@/components/question-bank/SolutionViewerModal';
import Header from '@/components/Header';
import UploadModal from '@/components/UploadModal';
import { Folder as FolderIcon, Database, X, Trash2, FileText, Search, CheckSquare } from 'lucide-react';
import type { UserItem } from '@/types/storage';


const MAX_CART_SIZE = 50;

export default function QuestionBankPage() {
    const [questions, setQuestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [runTeacherTour, setRunTeacherTour] = useState(false);

    // 역할 모달에서 '선생님·강사' 선택 시 ?tour=1 로 진입 → 투어 시작
    useEffect(() => {
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tour') === '1') {
            // DOM/요소 준비 후 시작
            const t = setTimeout(() => setRunTeacherTour(true), 600);
            return () => clearTimeout(t);
        }
    }, []);
    const [cart, setCart] = useState<any[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalQuestions, setTotalQuestions] = useState(0);
    const itemsPerPage = 50;

    // Toast 알림 시스템
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');
    const toastTimerRef = useRef<any>(null);
    const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToastMessage(msg);
        setToastType(type);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToastMessage(''), 3500);
    }, []);

    // Derived State for performance (O(1) lookup)
    const cartIdSet = useMemo(() => new Set((cart || []).filter(item => item && item.id).map(item => item.id)), [cart]);

    // Load Cart from LocalStorage + DB에서 실제 데이터 복원
    useEffect(() => {
        const savedCartIds = localStorage.getItem('exam_cart_ids');
        if (savedCartIds && savedCartIds !== 'undefined' && savedCartIds !== 'null') {
            try {
                const parsedIds = JSON.parse(savedCartIds);
                if (Array.isArray(parsedIds) && parsedIds.length > 0) {
                    // 먼저 스켈레톤으로 빠르게 표시
                    setCart(parsedIds.map(id => ({ id })));
                    // 서버 경유로 실제 데이터 복원 (RLS 잠금으로 클라이언트 직접 조회 불가)
                    fetch('/api/questions/by-ids', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: parsedIds }),
                    })
                        .then(res => res.json())
                        .then(({ data }) => {
                            if (data && data.length > 0) {
                                const qMap = new Map(data.map((q: any) => [q.id, q]));
                                // 원래 순서 유지
                                const restored = parsedIds
                                    .map((id: string) => qMap.get(id))
                                    .filter(Boolean);
                                setCart(restored);
                            }
                        })
                        .catch(e => console.error('cart restore failed', e));
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
    const dragOrderRef = useRef<any[]>([]); // 드래그 중 순서를 ref에만 저장 (re-render 최소화)
    const [showAutoModal, setShowAutoModal] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [isDbInitialized, setIsDbInitialized] = useState(false);
    const isAdmin = user?.email === 'mathofhy@naver.com';
    const mainScrollRef = useRef<HTMLDivElement>(null);
    const [heroStats, setHeroStats] = useState({ questionCount: 0, schoolCount: 0 });


    // 해설/유사문항 모달 열릴 때 배경 스크롤 전체 차단
    useEffect(() => {
        if (!solutionTarget && !similarTarget) return;

        const handleWheel = (e: WheelEvent) => {
            const isInsideModal = (e.target as Element)?.closest('[data-modal-scroll]');
            if (!isInsideModal) e.preventDefault();
        };

        document.addEventListener('wheel', handleWheel, { passive: false });
        return () => document.removeEventListener('wheel', handleWheel);
    }, [solutionTarget, similarTarget]);

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
    const [excludedQuestionIds, setExcludedQuestionIds] = useState<string[]>([]); // 중복출제 방지용 제외 문제 ID

    // ESC로 모달 닫기
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (solutionTarget) setSolutionTarget(null);
                else if (similarTarget) setSimilarTarget(null);
                else if (showConfigModal) setShowConfigModal(false);
                else if (showSaveModal) setShowSaveModal(false);
                else if (showAutoModal) setShowAutoModal(false);
                else if (showStorageModal) setShowStorageModal(false);
            }
        };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [solutionTarget, similarTarget, showConfigModal, showSaveModal, showAutoModal, showStorageModal]);

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



    const supabase = createClient();

    // 전역 레이아웃의 Footer 때문에 생기는 브라우저 스크롤 제거
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    // Hero Stats: DB에서 실제 문제 수 / 학교 수 조회
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/questions/facets');
                const data = await res.json();
                if (data.success) {
                    setHeroStats({
                        questionCount: data.count ?? 0,
                        schoolCount: data.schoolCount ?? 0,
                    });
                }
            } catch (e) {
                console.error('Hero stats fetch error:', e);
            }
        })();
    }, []);

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
                // 어드민 또는 무료 모드: 전체 DB를 user_items에 자동 동기화
                if (data.user.email === 'mathofhy@naver.com' || PERSONAL_DB_FREE_MODE) {
                    fetch('/api/storage/sync', { method: 'POST' })
                        .then(() => setStorageRefreshKey(prev => prev + 1));
                }
                fetchPurchasedDbs(data.user.id, data.user.email ?? undefined).finally(() => setIsDbInitialized(true));
                fetchMyPoints(data.user.id);
            } else if (PERSONAL_DB_FREE_MODE) {
                // 비로그인이어도 무료 모드라면 DB 목록 자동 로드
                fetchPurchasedDbs('', '').finally(() => setIsDbInitialized(true));
            } else {
                setIsDbInitialized(true);
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

        // [FREE MODE] 무료 기간 중에는 구매 여부 무관하게 전체 개인DB 허용
        if (PERSONAL_DB_FREE_MODE) {
            const { data: allData } = await supabase
                .from('exam_materials')
                .select('id, title, school, grade, semester, exam_type, subject, file_type, exam_year')
                .eq('file_type', 'DB');
            if (allData) {
                setPurchasedDbs(allData);
                // 비로그인 유저에게는 전체 DB 자동 선택으로 바로 검색 가능하게
                if (!userId) {
                    setSelectedDbIds(allData.map((d: any) => d.id));
                }
            }
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

    // [2단계 로딩 대응] 이미지 도착 전에 담긴 장바구니 항목의 이미지 보충
    // (검색/유사문제 카드를 스켈레톤 상태에서 담으면 question_images 가 null 인 채 들어옴)
    useEffect(() => {
        const missing = (cart || []).filter(c => c && c.id && c.question_images == null).map(c => c.id);
        if (missing.length === 0) return;
        const ids = missing.slice(0, 20);
        fetch('/api/questions/images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
        })
            .then(r => r.json())
            .then(j => {
                if (!j?.success) return;
                setCart(prev => prev.map(c =>
                    c && ids.includes(c.id) && c.question_images == null
                        ? { ...c, question_images: j.images?.[c.id] || [] }
                        : c
                ));
            })
            .catch(() => { });
    }, [cart]);

    // [성능] 이미지 지연 로딩: 검색 직후 카드는 스켈레톤으로 즉시 뜨고,
    // 이미지는 20개씩 청크로 받아 도착하는 대로 채운다. (보이는 위쪽 카드부터 자연히 먼저 채워짐)
    // 토큰: 새 검색/페이지 이동 시 이전 검색의 늦은 응답이 화면을 덮어쓰지 않게 차단.
    const imageLoadToken = useRef(0);
    const loadImagesProgressively = async (ids: string[]) => {
        const token = ++imageLoadToken.current;
        const CHUNK = 20;
        for (let i = 0; i < ids.length; i += CHUNK) {
            if (imageLoadToken.current !== token) return; // 새 검색 시작됨 → 중단
            const chunk = ids.slice(i, i + CHUNK);
            let imagesMap: Record<string, any[]> | null = null;
            try {
                const res = await fetch('/api/questions/images', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: chunk }),
                });
                const json = await res.json();
                if (res.ok && json.success) imagesMap = json.images || {};
            } catch { /* 아래에서 빈 배열 처리 */ }
            if (imageLoadToken.current !== token) return;
            // 실패한 청크는 빈 배열로 채워 스켈레톤이 영원히 남지 않게 함
            setQuestions(prev => prev.map(q =>
                chunk.includes(q.id)
                    ? { ...q, question_images: (imagesMap && imagesMap[q.id]) || [] }
                    : q
            ));
        }
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

        // [보안] 문제 콘텐츠는 더 이상 클라이언트가 DB를 직접 조회하지 않는다.
        // RLS를 잠그고, 오직 서버 라우트(/api/questions/search)를 통해서만 콘텐츠가 나간다.
        // (서버에서 페이지 상한 + IP 속도제한으로 대량 스크래핑 방지)
        const selectedDbs = dbFilter.length > 0 ? purchasedDbs.filter(d => dbFilter.includes(d.id)) : [];

        try {
            const res = await fetch('/api/questions/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selectedDbs,
                    purchasedDbsCount: purchasedDbs.length,
                    excludedQuestionIds,
                    advancedFilters,
                    page: targetPage,
                }),
            });
            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || '데이터베이스 검색 중 오류가 발생했습니다.');
            }
            const data = result.data || [];
            // [성능] 검색 응답엔 이미지가 없음 → 카드 골격(스켈레톤)을 즉시 띄우고,
            // 이미지는 /api/questions/images 에서 청크 단위로 뒤따라 채운다.
            setQuestions(data.map((q: any) => ({ ...q, question_images: null })));
            loadImagesProgressively(data.map((q: any) => q.id));
            if (result.count !== null && result.count !== undefined) setTotalQuestions(result.count);
            if (targetPage === 1) setHasSearched(true);
            if (data.length === 0 && targetPage === 1) {
                showToast('해당 조건에 일치하는 문항이 없습니다. (0건)', 'info');
            }
        } catch (err: any) {
            console.error("fetchQuestions error:", err);
            showToast(`검색 실패: ${err.message || '오류가 발생했습니다.'}`, 'error');
            setQuestions([]);
        } finally {
            setLoading(false);
        }

    };

    const handleSearch = () => {
        if (selectedDbIds.length === 0) {
            showToast('DB를 먼저 선택해주세요.', 'info');
            return;
        }
        setHasSearched(false);
        fetchQuestions(selectedDbIds, filterState, 1);
    };

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        fetchQuestions(selectedDbIds, filterState, newPage);
        // Scroll to top of the actual scrollable container
        if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
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
            showToast('알 수 없는 파일 형식입니다.', 'error');
        }
    };

    // [V73] Dedicated Load function for editing
    const handleEditSelectedExam = async () => {
        if (selectedExamIds.length === 0) return showToast('수정할 시험지를 선택해주세요.', 'info');
        if (selectedExamIds.length > 1) return showToast('한 번에 하나의 시험지만 수정할 수 있습니다.', 'info');

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
                return showToast('이 시험지는 재편집 기능을 지원하지 않는 이전 버전입니다. 새록게 생성한 시험지부터 재편집이 가능합니다.', 'info');
            }

            const res = await fetch('/api/questions/by-ids', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: qIds }),
            });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.error || '문항 데이터를 불러올 수 없습니다.');
            const data = result.data;
            if (!data || data.length === 0) throw new Error('문항 데이터를 불러올 수 없습니다.');

            const sortedData = qIds.map((id: string) => data.find((q: any) => q.id === id)).filter(Boolean);
            setCart(sortedData);
            setViewMode('review');
            setShowStorageModal(false);
            setSelectedExamIds([]); // Reset selection
            showToast(`"${item.name}" 시험지 구성을 불러왔습니다.`, 'success');
        } catch (err: any) {
            console.error("Failed to load exam questions:", err);
            showToast('시험지 데이터를 불러오는데 실패했습니다.', 'error');
        } finally {
            setLoading(false);
        }
    };

    // [V73] Bulk Delete for Exams
    const handleBulkDeleteExams = async () => {
        if (selectedExamIds.length === 0) return showToast('삭제할 시험지를 선택해주세요.', 'info');
        if (!confirm(`${selectedExamIds.length}개의 시험지를 영구 삭제하시겠습니까?`)) return;

        setLoading(true);
        let successCount = 0;
        let failCount = 0;
        try {
            // [성능] 순차 N회 요청 → 병렬 처리 (20개 삭제 시 20번 대기 → 동시)
            const results = await Promise.allSettled(
                selectedExamIds.map(id =>
                    fetch(`/api/storage/items?id=${id}`, { method: 'DELETE' }).then(async (res) => {
                        if (!res.ok) {
                            const errData = await res.json().catch(() => ({}));
                            console.error(`[DeleteExam] Failed to delete id=${id}, status=${res.status}`, errData);
                            throw new Error(`status ${res.status}`);
                        }
                        return true;
                    })
                )
            );
            for (const r of results) {
                if (r.status === 'fulfilled') successCount++;
                else failCount++;
            }
            setSelectedExamIds([]);
            setStorageRefreshKey(prev => prev + 1);
            if (failCount > 0) {
                showToast(`${successCount}개 삭제 완료, ${failCount}개 삭제 실패. 실패한 항목은 새로고침 후 다시 시도해주세요.`, 'error');
            } else {
                showToast(`${successCount}개 시험지가 삭제되었습니다.`, 'success');
            }
        } catch (e) {
            console.error(e);
            showToast('삭제 중 오류가 발생했습니다.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleBulkDownloadExams = async () => {
        if (selectedExamIds.length === 0) return showToast('다운로드할 시험지를 선택해주세요.', 'info');
        selectedExamIds.forEach((id, idx) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = `/api/storage/download?id=${id}`;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, idx * 1000);
        });
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
                showToast(`한 시험지에 최대 ${MAX_CART_SIZE}문제까지만 담을 수 있습니다.`, 'info');
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

    // [유사문항 자동추가] Promise.allSettled로 병렬 호출 (기존 직렬: 최대 100초 → 병렬: 1~2초)
    const handleAutoAddSimilar = async () => {
        if (cart.length === 0) return;
        if (!user) { setShowLoginGate(true); return; } // 유사문항 자동추가는 로그인 필요
        setIsAutoAdding(true);

        const targetQuestions = selectedReviewIds.size > 0
            ? cart.filter(q => !q._similarOf && selectedReviewIds.has(q.id))
            : cart.filter(q => !q._similarOf);

        const existingIds = new Set(cart.map(q => q.id));
        const availableSlots = MAX_CART_SIZE - cart.length;
        const eligible = targetQuestions.slice(0, Math.max(0, availableSlots));
        const skippedCount = targetQuestions.length - eligible.length;

        // 병렬 API 호출 (기존 for-await 직렬 → Promise.allSettled 병렬)
        const apiResults = await Promise.allSettled(
            eligible.map(baseQ =>
                fetch(`/api/pro/similar-questions?id=${baseQ.id}&limit=1`)
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null)
                    .then(data => ({
                        baseId: baseQ.id,
                        similar: data?.success && data?.data?.[0] ? data.data[0] : null
                    }))
            )
        );

        // baseId → similar 맵 구성 (중복/기존 제외)
        // [버그수정] 이전엔 insertMap(키=baseId)에 대해 insertMap.has(similar.id)로 검사해
        // 중복 가드가 전혀 작동하지 않아 같은 유사문항이 두 번 삽입될 수 있었음.
        // → 삽입된 similar.id 를 별도 Set 으로 추적해 검사.
        const insertMap = new Map<string, any>();
        const usedSimilarIds = new Set<string>();
        for (const result of apiResults) {
            if (result.status === 'fulfilled' && result.value?.similar) {
                const { baseId, similar } = result.value;
                if (!existingIds.has(similar.id) && !usedSimilarIds.has(similar.id)) {
                    insertMap.set(baseId, similar);
                    usedSimilarIds.add(similar.id);
                }
            }
        }

        // 원본 cart 순서대로 올바른 위치에 삽입
        let updatedCart = [...cart];
        let addedCount = 0;
        let offset = 0;

        for (let i = 0; i < cart.length; i++) {
            const baseQ = cart[i];
            const similar = insertMap.get(baseQ.id);
            if (!similar) continue;

            const baseIdxInUpdated = i + offset;
            let insertAt = baseIdxInUpdated + 1;
            // 이미 있는 유사문항 이후에 삽입
            while (insertAt < updatedCart.length && updatedCart[insertAt]._similarOf === baseQ.id) {
                insertAt++;
            }
            updatedCart = [
                ...updatedCart.slice(0, insertAt),
                { ...similar, _similarOf: baseQ.id },
                ...updatedCart.slice(insertAt)
            ];
            addedCount++;
            offset++;
        }

        setCart(updatedCart);
        setSelectedReviewIds(new Set());
        setIsAutoAdding(false);
        if (skippedCount > 0) {
            showToast(`유사문항 자동추가 완료! ${addedCount}개 추가됨. (최대 ${MAX_CART_SIZE}문제 제한으로 ${skippedCount}개 생략)`, 'success');
        } else {
            showToast(`유사문항 자동추가 완료! ${addedCount}개 추가됨`, 'success');
        }
    };



    const toggleCart = (question: any) => {
        if (cart.find(q => q.id === question.id)) {
            setCart(cart.filter(q => q.id !== question.id));
        } else {
            if (cart.length >= MAX_CART_SIZE) {
                showToast(`한 시험지에 최대 ${MAX_CART_SIZE}문제까지만 담을 수 있습니다.`, 'info');
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
                showToast(`한 시험지에 최대 ${MAX_CART_SIZE}문제까지만 담을 수 있습니다.`, 'info');
                return;
            }
            if (toAdd.length > remaining) {
                showToast(`최대 ${MAX_CART_SIZE}문제 제한으로 인해 ${remaining}개만 추가됩니다.`, 'info');
            }
            setCart(prev => [...(Array.isArray(prev) ? prev : []), ...toAdd.slice(0, remaining)]);
        }
    };

    // 1. Initial Review Block (Switch to Review Mode)
    const [showLoginGate, setShowLoginGate] = useState(false);

    const handleGenerate = () => {
        if (cart.length === 0) return;
        // 비로그인 유저도 조립된 시험지(검토 화면)를 '맛보기'로 볼 수 있게 허용.
        // 로그인 벽은 저장/다운로드 시점으로 이동 (아래 '최종 생성' 버튼).
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

    const SORT_OPTIONS: Record<string, { label: string; compareFn: (a: any, b: any) => number }> = {
        'type-mc': { label: '객관식→단답형', compareFn: (a, b) => { const o = (t: string) => t === 'multiple_choice' ? 0 : 1; return o(a.question_type) - o(b.question_type); } },
        'type-sa': { label: '단답형→객관식', compareFn: (a, b) => { const o = (t: string) => t === 'short_answer' ? 0 : 1; return o(a.question_type) - o(b.question_type); } },
        'diff-asc': { label: '쉬운순', compareFn: (a, b) => getDifficultyValue(a.difficulty) - getDifficultyValue(b.difficulty) },
        'diff-desc': { label: '어려운순', compareFn: (a, b) => getDifficultyValue(b.difficulty) - getDifficultyValue(a.difficulty) },
        'unit': { label: '단원순', compareFn: (a, b) => (a.unit || '').localeCompare(b.unit || '', 'ko') },
        'original': { label: '원본순', compareFn: (a, b) => (a.question_number || 0) - (b.question_number || 0) },
    };

    // 상충되는 기준 그룹: 같은 그룹 내 기준은 동시 선택 불가
    const SORT_CONFLICTS: Record<string, string[]> = {
        'type-mc': ['type-sa'],
        'type-sa': ['type-mc'],
        'diff-asc': ['diff-desc'],
        'diff-desc': ['diff-asc'],
    };

    const [sortKeys, setSortKeys] = useState<string[]>([]);

    const applySortKeys = (keys: string[]) => {
        setSortKeys(keys);
        if (keys.length === 0) return;
        let sorted = [...cart];
        sorted.sort((a, b) => {
            for (const key of keys) {
                const opt = SORT_OPTIONS[key];
                if (!opt) continue;
                const result = opt.compareFn(a, b);
                if (result !== 0) return result;
            }
            return 0;
        });
        setCart(sorted);
    };

    // Drag and Drop Handlers
    // dragOrderRef: 드래그 중 순서를 ref에 저장 → dragEnd 시에만 setCart 1회 호출
    // (기존: onDragOver마다 setCart → 50카드 수백 번 re-render → 극심한 성능 저하)
    const handleDragStart = (idx: number) => {
        dragOrderRef.current = [...cart]; // 현재 cart 스냅샷
        setDraggingIndex(idx);
    };

    const handleDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        if (draggingIndex === null || draggingIndex === idx) return;

        // ref만 업데이트 (state 변경 없음 → re-render 없음)
        const newOrder = [...dragOrderRef.current];
        const draggedItem = newOrder[draggingIndex];
        newOrder.splice(draggingIndex, 1);
        newOrder.splice(idx, 0, draggedItem);
        dragOrderRef.current = newOrder;
        setDraggingIndex(idx); // 인덱스 표시만 state (숫자 1개, 경량)
    };

    const handleDragEnd = () => {
        if (dragOrderRef.current.length > 0) {
            setCart(dragOrderRef.current); // 드래그 완료 시 딱 1번만 setCart
        }
        dragOrderRef.current = [];
        setDraggingIndex(null);
    };

    const [examTitle, setExamTitle] = useState('');
    const [questionsPerColumn, setQuestionsPerColumn] = useState(2);

    // Config Confirmed -> Open Save Modal
    const handleConfigConfirm = (title: string, qpc: number) => {
        setExamTitle(title);
        setQuestionsPerColumn(qpc);
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
                    folderId: folderId || 'root',
                    dbIds: selectedDbIds,  // 현재 선택된 DB UUID들 전달
                    questionsPerColumn: questionsPerColumn,
                }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Save failed');
            }

            showToast('보관함에 저장되었습니다! "내 보관함"에서 확인 및 다운로드 가능합니다.', 'success');
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
            showToast('저장 실패: ' + errorMessage, 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUploadClick = () => {
        if (!user) return showToast('로그인이 필요합니다.', 'info');
        setIsUploadModalOpen(true);
    };

    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [showMobileSidebar, setShowMobileSidebar] = useState(false);

    // Mouse Parallax for Hero Section
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const heroRef = useRef<HTMLDivElement>(null);
    const handleHeroMouse = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!heroRef.current) return;
        const rect = heroRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2; // -1 to 1
        const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        setMousePos({ x, y });
    }, []);

    return (
        <>
        <GuidedTour steps={TEACHER_TOUR_STEPS} run={runTeacherTour} onClose={() => setRunTeacherTour(false)} />
        <div className="flex flex-col h-screen bg-[#F2F3F0] overflow-hidden">
            <Header
                user={user}
                purchasedPoints={purchasedPoints}
                earnedPoints={earnedPoints}
                onUploadClick={handleUploadClick}
            />

            <div className="flex flex-1 overflow-hidden relative">

                {/* 로그인 게이트 모달 - 비로그인 유저가 시험지 생성 클릭 시 */}
                {showLoginGate && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => setShowLoginGate(false)}>
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                            {/* 상단 그라데이션 배너 */}
                            <div className="bg-gradient-to-br from-[#497AB7] to-[#5CC6C3] px-6 py-8 text-center">
                                <div className="text-4xl mb-3">📄</div>
                                <h2 className="text-xl font-black text-white">방금 만든 시험지,</h2>
                                <h2 className="text-xl font-black text-white">저장하려면 회원가입!</h2>
                                <p className="text-white/80 text-sm mt-2">가입은 무료이며 30초면 충분해요!</p>
                            </div>
                            <div className="px-6 py-5 space-y-3">
                                <div className="flex items-center gap-3 bg-blue-50 rounded-xl p-3">
                                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Database size={16} className="text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-700">런칭 기념 전체 무료</p>
                                        <p className="text-xs text-slate-400">전국 기출 DB를 지금 바로 무료 이용</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 bg-teal-50 rounded-xl p-3">
                                    <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText size={16} className="text-teal-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-700">시험지 저장 &amp; 다운로드</p>
                                        <p className="text-xs text-slate-400">선택한 문제로 나만의 시험지 생성</p>
                                    </div>
                                </div>
                            </div>
                            {/* 버튼 */}
                            <div className="px-6 pb-6 flex flex-col gap-2">
                                <a
                                    href="/login"
                                    className="w-full py-3.5 bg-[#497AB7] text-white rounded-2xl font-black text-base text-center hover:bg-[#3A6599] transition-colors shadow-lg shadow-[#497AB7]/30"
                                >
                                    무료 회원가입 / 로그인 →
                                </a>
                                <button
                                    onClick={() => setShowLoginGate(false)}
                                    className="w-full py-2.5 text-slate-400 text-sm font-medium hover:text-slate-600 transition-colors"
                                >
                                    계속 둘러보기
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Storage Modal - Persistent Rendering for 0s Loading */}
                <div className={`fixed inset-0 z-50 items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm ${showStorageModal ? 'flex' : 'hidden'}`}>
                    <div className="bg-white w-full sm:max-w-5xl sm:mx-4 max-h-[90dvh] sm:h-[80vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
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
                                    if (storageModalMode === 'exam') {
                                        // DELETE/download API는 user_items.id(기본키)를 사용
                                        const ids = items
                                            .filter(i => i.type === 'saved_exam')
                                            .map(i => i.id);
                                        setSelectedExamIds(ids);
                                    } else {
                                        const ids = items
                                            .filter(i => i.type === 'personal_db')
                                            .map(i => i.reference_id || i.id);
                                        setSelectedDbIds(ids);
                                    }
                                }}
                                onGroupSelect={(items, select) => {
                                    if (storageModalMode === 'db') {
                                        const ids = items.map(i => i.reference_id || i.id);
                                        setSelectedDbIds(prev =>
                                            select
                                                ? [...new Set([...prev, ...ids])]
                                                : prev.filter(id => !ids.includes(id))
                                        );
                                    } else {
                                        // exam 모드: user_items.id(기본키) 사용
                                        const ids = items.map(i => i.id);
                                        setSelectedExamIds(prev =>
                                            select
                                                ? [...new Set([...prev, ...ids])]
                                                : prev.filter(id => !ids.includes(id))
                                        );
                                    }
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
                                {storageModalMode === 'db' && (() => {
                                        const allDbIds = currentExamItems
                                            .filter(i => i.type === 'personal_db')
                                            .map(i => i.reference_id || i.id);
                                        const allSelected = allDbIds.length > 0 && allDbIds.every(id => selectedDbIds.includes(id));
                                        return (
                                            <button
                                                onClick={() => {
                                                    setSelectedDbIds(prev => allSelected
                                                        ? prev.filter(id => !allDbIds.includes(id))
                                                        : [...new Set([...prev, ...allDbIds])]);
                                                }}
                                                className={`px-4 py-2 font-bold rounded-lg transition flex items-center gap-2 border ${
                                                    allSelected
                                                        ? 'bg-[#497AB7] text-white border-[#3A6BA0] hover:bg-[#3A6BA0]'
                                                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                                }`}
                                            >
                                                <CheckSquare size={16} />
                                                {allSelected ? '전체 해제' : '전체 선택'}
                                                {selectedDbIds.length > 0 && (
                                                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${allSelected ? 'bg-white/30 text-white' : 'bg-[#497AB7] text-white'}`}>
                                                        {selectedDbIds.length}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })()
                                }
                                {/* Actions for Exams */}
                                {storageModalMode === 'exam' && (
                                    <button
                                        onClick={() => {
                                            // user_items.id(기본키)를 사용해야 DELETE API가 정상 동작함
                                            const ids = currentExamItems
                                                .filter(i => i.type === 'saved_exam')
                                                .map(i => i.id);
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
                            {/* 비로그인에게도 버튼 노출 (기능 발견용) — 클릭 시 로그인 안내 */}
                            <button
                                onClick={() => {
                                    if (!user) { setShowLoginGate(true); return; }
                                    setStorageModalMode('db');
                                    setShowStorageModal(true);
                                    setShowMobileSidebar(false);
                                }}
                                className="flex-1 py-3 px-3 bg-[#E8F0FB] text-[#497AB7] border border-[#B7D1EA] rounded-xl hover:bg-[#D4E4F7] flex items-center justify-center gap-2 font-bold text-sm transition-colors whitespace-nowrap"
                            >
                                <Database size={16} />
                                DB 문제
                            </button>
                            <button
                                onClick={() => {
                                    if (!user) { setShowLoginGate(true); return; }
                                    setStorageModalMode('exam');
                                    setShowStorageModal(true);
                                    setShowMobileSidebar(false);
                                }}
                                className="flex-1 py-3 px-3 bg-[#E0F7F6] text-[#3AADA9] border border-[#5CC6C3]/40 rounded-xl hover:bg-[#C8F0EE] flex items-center justify-center gap-2 font-bold text-sm transition-colors whitespace-nowrap"
                            >
                                <FolderIcon size={16} />
                                만든 시험지
                            </button>
                        </div>
                        {!user && (
                            /* 비로그인: 전체 DB 자동 선택 안내 (한 줄) */
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                전체 DB 자동 선택됨 ({purchasedDbs.length}개)
                            </div>
                        )}
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
                        <div data-tour="qb-filter" className="flex-1 overflow-y-auto">
                            <FilterSidebar
                                dbFilter={null}
                                selectedDbIds={selectedDbIds}
                                purchasedDbs={purchasedDbs}
                                onFilterChange={(filters) => {
                                    setFilterState(filters);
                                }}
                            />
                        </div>
                        <div className="p-4 border-t bg-[#F2F3F0]">
                            <button
                                data-tour="qb-search"
                                onClick={() => {
                                    handleSearch();
                                    setShowMobileSidebar(false);
                                    setShowStorageModal(false);
                                }}
                                className="w-full py-3 bg-[#497AB7] text-white font-bold rounded-xl shadow-md hover:bg-[#3A6599] transition flex items-center justify-center gap-2"
                            >
                                <span>조건 검색하기</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main List Area */}
                <div ref={mainScrollRef} id="main-scroll" className="flex-1 overflow-y-auto overflow-x-hidden relative">
                    {viewMode === 'search' ? (
                        <header className="sticky top-0 z-10 flex justify-between items-center px-3 sm:px-6 py-2 sm:py-4 bg-white/90 backdrop-blur-sm border-b border-[#B7D1EA]/60 shadow-sm">
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
                            <div className="flex gap-1.5 sm:gap-2 items-center">
                                {questions.length > 0 && (
                                    <button
                                        onClick={handleSelectAllToggle}
                                        className="border border-[#B7D1EA] text-[#497AB7] px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-[#EEF4FB] shadow-sm transition font-bold text-xs sm:text-sm whitespace-nowrap"
                                    >
                                        {questions.every(q => q && cartIdSet.has(q.id)) ? '전체 해제' : '전체 선택'}
                                    </button>
                                )}
                                <button
                                    data-tour="qb-generate"
                                    onClick={handleGenerate}
                                    disabled={cart.length === 0 || isGenerating}
                                    className="bg-[#497AB7] disabled:bg-slate-300 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-[#3A6599] shadow-sm transition font-bold flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                                >
                                    <span className="hidden sm:inline">시험지 생성 ({cart.length}/{MAX_CART_SIZE})</span>
                                    <span className="sm:hidden">생성 ({cart.length})</span>
                                </button>
                                <button
                                    data-tour="qb-auto"
                                    onClick={() => setShowAutoModal(true)}
                                    className="bg-[#5CC6C3] text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-[#3AADA9] shadow-sm transition font-bold whitespace-nowrap text-xs sm:text-sm"
                                >
                                    자동생성
                                </button>
                            </div>
                        </header>
                    ) : (
                        <header className="sticky top-0 z-10 flex flex-col gap-2 sm:gap-4 px-3 sm:px-6 py-2 sm:py-4 bg-white/90 backdrop-blur-sm border-b border-[#B7D1EA]/60 shadow-sm">
                            {/* 모바일: 컴팩트 단일 행 / 데스크탑: 2행 */}
                            <div className="flex justify-between items-center gap-2">
                                <div className="min-w-0">
                                    <h1 className="text-base sm:text-2xl font-black text-slate-800 whitespace-nowrap">시험지 문항 검토</h1>
                                    <p className="hidden sm:block text-sm text-slate-500 mt-1">출제할 문항들의 순서와 난이도를 최종적으로 확인하세요.</p>
                                </div>
                                <div className="flex gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => setViewMode('search')}
                                        className="px-3 sm:px-5 py-2 sm:py-2.5 border border-slate-300 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all text-xs sm:text-sm whitespace-nowrap"
                                    >
                                        ← <span className="hidden sm:inline">검색으로 </span>돌아가기
                                    </button>
                                    <button
                                        onClick={() => { if (!user) { setShowLoginGate(true); return; } setShowConfigModal(true); }}
                                        className="px-3 sm:px-8 py-2 sm:py-2.5 bg-[#497AB7] text-white rounded-xl font-bold hover:bg-[#3A6599] shadow-lg shadow-[#497AB7]/20 transition-all text-xs sm:text-sm whitespace-nowrap"
                                    >
                                        최종 생성 ({cart.length})
                                    </button>
                                    <button
                                        onClick={() => { if (confirm('장바구니를 비우시겠습니까?')) { setCart([]); showToast('장바구니를 비웠습니다.', 'info'); } }}
                                        className="px-3 py-2 border border-red-200 text-red-500 rounded-xl font-bold hover:bg-red-50 transition-all text-xs whitespace-nowrap"
                                    >
                                        비우기
                                    </button>
                                </div>
                            </div>

                            {/* 정렬 + 유사문항 */}
                            <div className="bg-white border rounded-xl sm:rounded-2xl px-3 py-2.5 sm:p-4 shadow-sm">
                                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest flex-shrink-0">정렬</span>
                                    {sortKeys.map((key, idx) => (
                                        <div key={idx} className="flex items-center gap-0.5">
                                            {idx > 0 && <span className="text-slate-300 text-xs mr-1">→</span>}
                                            <select
                                                value={key}
                                                onChange={(e) => {
                                                    const next = [...sortKeys];
                                                    next[idx] = e.target.value;
                                                    // 중복 제거: 이후 레벨에서 같은 기준 있으면 잘라냄
                                                    const deduped = next.slice(0, idx + 1);
                                                    applySortKeys(deduped);
                                                }}
                                                className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg px-2 py-1.5 outline-none cursor-pointer hover:bg-indigo-100 transition-colors"
                                            >
                                                {Object.entries(SORT_OPTIONS).map(([k, v]) => (
                                                    <option key={k} value={k} disabled={
                                                        (sortKeys.includes(k) && sortKeys[idx] !== k) ||
                                                        (sortKeys[idx] !== k && sortKeys.some(sk => (SORT_CONFLICTS[sk] || []).includes(k)))
                                                    }>{v.label}</option>
                                                ))}
                                            </select>
                                            <button onClick={() => { const next = sortKeys.slice(0, idx); applySortKeys(next); }} className="text-slate-300 hover:text-red-400 transition-colors text-sm px-0.5">✕</button>
                                        </div>
                                    ))}
                                    {sortKeys.length < Object.keys(SORT_OPTIONS).length && (
                                        <button
                                            onClick={() => {
                                                const used = new Set(sortKeys);
                                                const conflicted = new Set(sortKeys.flatMap(sk => SORT_CONFLICTS[sk] || []));
                                                const nextKey = Object.keys(SORT_OPTIONS).find(k => !used.has(k) && !conflicted.has(k));
                                                if (nextKey) applySortKeys([...sortKeys, nextKey]);
                                            }}
                                            className="px-2 py-1 rounded-lg text-xs font-bold text-slate-400 border border-dashed border-slate-200 hover:border-indigo-300 hover:text-indigo-500 transition-all"
                                        >
                                            + 기준 추가
                                        </button>
                                    )}
                                    {sortKeys.length > 0 && (
                                        <button onClick={() => applySortKeys([])} className="text-[10px] text-slate-400 hover:text-red-500 transition-colors font-bold">
                                            초기화
                                        </button>
                                    )}
                                    <div className="flex-1"></div>
                                    {selectedReviewIds.size > 0 && (
                                        <span className="text-[11px] font-bold text-violet-700 bg-violet-100 px-2 py-1 rounded-full flex-shrink-0">
                                            ✓ {selectedReviewIds.size}개 선택
                                        </span>
                                    )}
                                    <button
                                        onClick={handleAutoAddSimilar}
                                        disabled={isAutoAdding || cart.length === 0}
                                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#5CC6C3] text-white hover:bg-[#3AADA9] disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap flex-shrink-0"
                                    >
                                        {isAutoAdding ? (
                                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                            </svg>
                                        ) : '🔗'}
                                        <span>{isAutoAdding ? '분석중' : selectedReviewIds.size > 0 ? `${selectedReviewIds.size}개 유사추가` : '유사문항'}</span>
                                    </button>
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
                            <div className={`grid grid-cols-1 md:grid-cols-2 ${viewMode === 'review' ? 'lg:grid-cols-3 xl:grid-cols-4' : 'lg:grid-cols-4'} gap-6 px-6 pt-6 pb-10 animate-in fade-in duration-500`}>
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
                                                    ? 'opacity-40 scale-95 border-[#497AB7] border-dashed'
                                                    : selectedReviewIds.has(q.id)
                                                        ? 'bg-[#E0F7F6] border-[#5CC6C3] ring-2 ring-[#5CC6C3] cursor-move hover:shadow-md'
                                                        : 'bg-white border-slate-200 cursor-move hover:border-[#B7D1EA] hover:shadow-md'
                                                : inCart ? 'bg-[#EEF4FB] border-[#497AB7] ring-2 ring-[#497AB7] shadow-md cursor-pointer' : 'bg-white hover:shadow-lg border-gray-200 cursor-pointer'}
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
                                                            ? 'bg-[#5CC6C3] text-white ring-2 ring-[#5CC6C3]/50'
                                                            : viewMode === 'review' ? 'bg-[#497AB7] text-white hover:bg-[#5CC6C3]' : 'bg-slate-200 text-slate-500'
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
                                                <span className="bg-[#E8F0FB] text-[#497AB7] text-xs px-2 py-0.5 rounded-md font-bold">
                                                    {q.unit || '단원 미정'}
                                                </span>
                                                <span className="text-[11px] font-bold text-gray-500">
                                                    {q.year && `${q.year}년 `}{q.grade && `${q.grade} `}{q.semester && `${q.semester} `}원본 {q.question_number}번
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {viewMode === 'review' && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); if (!user) { setShowLoginGate(true); return; } setSimilarTarget(q); }}
                                                        className="px-2 py-1 bg-[#A47864] hover:bg-[#8A6553] text-white rounded-md shadow-sm transition-all flex items-center gap-1 whitespace-nowrap"
                                                        title="유사문항 찾기"
                                                    >
                                                        <Search size={13} />
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
                                            {q.question_images === null ? (
                                                // 이미지 로딩 중 스켈레톤
                                                <div className="space-y-2 animate-pulse">
                                                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                                                    <div className="h-4 bg-gray-200 rounded w-full" />
                                                    <div className="h-20 bg-gray-200 rounded w-full mt-3" />
                                                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                                                </div>
                                            ) : (
                                                <QuestionRenderer
                                                    xmlContent={q.content_xml}
                                                    externalImages={q.question_images}
                                                    displayMode="question"
                                                    showDownloadAction={false}
                                                    className="border-none shadow-none p-0 !text-base"
                                                />
                                            )}
                                        </div>

                                        {/* Meta/Actions Footer */}
                                        <div className="px-4 py-3 bg-slate-50 border-t flex items-center justify-between">
                                            <div className="text-[10px] text-slate-400 font-medium truncate flex-1 pr-2">
                                                {q.school} {q.exam_year}
                                            </div>
                                            {viewMode === 'search' && (
                                                <div className="flex items-center gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        className="text-[10px] font-bold text-slate-500 hover:text-[#497AB7] bg-white border border-slate-200 hover:border-[#B7D1EA] hover:bg-[#EEF4FB] px-2 py-1 rounded-md transition-all flex items-center gap-1 shadow-sm"
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
                                    ) : !isDbInitialized ? (
                                        /* DB 초기 로딩 중 - 가이드 깜빡임 방지 */
                                        <div className="flex justify-center py-20">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                        </div>
                                    ) : (
                                        /* 초기 상태 — 전체 사용법 안내 */
                                        <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-100/80">
                                            {/* 비로그인 유저 전용 CTA — 강화 */}
                                            {!user && (
                                                <div className="relative mx-4 mt-4 rounded-2xl p-4 flex items-center justify-between gap-3 overflow-hidden animate-border-glow border-2 border-transparent">
                                                    {/* Animated gradient BG */}
                                                    <div className="absolute inset-0 bg-gradient-to-r from-[#497AB7] via-[#5CC6C3] to-[#818cf8] animate-gradient-shift rounded-2xl" style={{ backgroundSize: '200% 200%' }}></div>
                                                    <div className="relative min-w-0">
                                                        <p className="font-black text-white text-sm flex items-center gap-1.5">
                                                            <span className="inline-flex w-5 h-5 items-center justify-center bg-white/20 rounded-full text-[10px]">🎉</span>
                                                            런칭 기념 전체 무료 개방 중!
                                                        </p>
                                                        <p className="text-xs text-white/80 mt-0.5">회원가입 후 전국 기출 DB 바로 이용하세요</p>
                                                    </div>
                                                    <a
                                                        href="/login"
                                                        className="relative flex-shrink-0 px-5 py-2.5 bg-white text-[#497AB7] rounded-xl font-black text-sm whitespace-nowrap shadow-lg shadow-black/10 hover:shadow-xl hover:scale-[1.03] transition-all duration-300"
                                                    >
                                                        무료 시작 →
                                                    </a>
                                                </div>
                                            )}

                                            {/* ══════════════════════════════════════
                                                 히어로 섹션 — Premium Parallax
                                               ══════════════════════════════════════ */}
                                            <div
                                                ref={heroRef}
                                                onMouseMove={handleHeroMouse}
                                                className="relative overflow-hidden"
                                            >
                                                {/* Deep dark base */}
                                                <div className="absolute inset-0 bg-[#0a0a1a]"></div>

                                                {/* Animated mesh gradient overlay */}
                                                <div className="absolute inset-0 mesh-gradient-bg opacity-90"></div>

                                                {/* 3D Parallax Orbs */}
                                                <div
                                                    className="absolute top-4 right-8 w-80 h-80 rounded-full animate-float-3d"
                                                    style={{
                                                        background: 'radial-gradient(circle, rgba(6, 182, 212, 0.25) 0%, rgba(99, 102, 241, 0.08) 60%, transparent 80%)',
                                                        filter: 'blur(40px)',
                                                        transform: `translate3d(${mousePos.x * 20}px, ${mousePos.y * 15}px, 0)`,
                                                        transition: 'transform 0.3s ease-out',
                                                    }}
                                                ></div>
                                                <div
                                                    className="absolute -bottom-12 left-8 w-64 h-64 rounded-full"
                                                    style={{
                                                        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, rgba(6, 182, 212, 0.08) 60%, transparent 80%)',
                                                        filter: 'blur(35px)',
                                                        transform: `translate3d(${mousePos.x * -15}px, ${mousePos.y * -12}px, 0)`,
                                                        transition: 'transform 0.4s ease-out',
                                                        animation: 'float-3d 10s ease-in-out 2s infinite',
                                                    }}
                                                ></div>
                                                <div
                                                    className="absolute top-1/3 left-1/4 w-48 h-48 rounded-full"
                                                    style={{
                                                        background: 'radial-gradient(circle, rgba(236, 72, 153, 0.12) 0%, transparent 70%)',
                                                        filter: 'blur(30px)',
                                                        transform: `translate3d(${mousePos.x * 10}px, ${mousePos.y * -8}px, 0)`,
                                                        transition: 'transform 0.5s ease-out',
                                                        animation: 'float-3d 12s ease-in-out 4s infinite',
                                                    }}
                                                ></div>

                                                {/* Dot grid pattern */}
                                                <div className="absolute inset-0 opacity-[0.04]" style={{
                                                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
                                                    backgroundSize: '24px 24px',
                                                }}></div>

                                                {/* Subtle noise */}
                                                <div className="absolute inset-0 opacity-[0.02]" style={{
                                                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
                                                }}></div>

                                                {/* Content */}
                                                <div className="relative px-6 sm:px-10 pt-8 sm:pt-10 pb-6 sm:pb-8">
                                                    <div className="max-w-2xl">
                                                        {/* Badge */}
                                                        <div className="animate-entrance delay-100">
                                                            <div className="inline-flex items-center gap-2 glass-card text-white/90 text-[11px] font-bold px-3 py-1.5 rounded-full mb-4">
                                                                <span className="relative flex h-2 w-2">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                                                                </span>
                                                                시험지 출제 시스템
                                                            </div>
                                                        </div>

                                                        {/* Headline */}
                                                        <div className="animate-entrance delay-200">
                                                            <h2 className="text-2xl sm:text-4xl font-black text-white leading-[1.15] tracking-tight" style={{wordBreak:'keep-all'}}>
                                                                기출 문제를 골라담으면,<br/>
                                                                <span className="bg-gradient-to-r from-cyan-300 via-blue-300 to-violet-300 bg-clip-text text-transparent">
                                                                    유사문항까지 자동으로
                                                                </span>{' '}
                                                                <span className="relative inline-block">
                                                                    채워드려요
                                                                    <svg className="absolute -bottom-1.5 left-0 w-full" height="8" viewBox="0 0 200 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                        <path d="M0 4 Q40 1 80 4 T160 4 T200 4" stroke="url(#ug2)" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" className="line-draw"/>
                                                                        <defs><linearGradient id="ug2" x1="0" y1="0" x2="200" y2="0"><stop offset="0%" stopColor="#67e8f9"/><stop offset="50%" stopColor="#818cf8"/><stop offset="100%" stopColor="#a78bfa"/></linearGradient></defs>
                                                                    </svg>
                                                                </span>
                                                            </h2>
                                                        </div>

                                                        {/* Subtext */}
                                                        <div className="animate-entrance delay-300">
                                                            <p className="text-xs sm:text-sm text-white/40 mt-3 leading-relaxed max-w-lg" style={{wordBreak:'keep-all'}}>
                                                                전국 기출 문제를 단원·난이도로 검색하고, 원하는 문제를 골라 시험지를 만드세요. 비슷한 유형의 문제를 자동으로 추천받을 수 있습니다.
                                                            </p>
                                                        </div>

                                                        {/* Stats Counter Row */}
                                                        <div className="animate-entrance delay-400">
                                                            <div className="flex items-center gap-5 sm:gap-8 mt-5 sm:mt-6">
                                                                {[
                                                                    { label: '기출문제 보유', value: heroStats.questionCount > 0 ? heroStats.questionCount.toLocaleString() : '—', suffix: heroStats.questionCount > 0 ? '+' : '', color: 'from-cyan-400 to-cyan-300' },
                                                                    { label: '학교 기출', value: heroStats.schoolCount > 0 ? heroStats.schoolCount.toLocaleString() : '—', suffix: heroStats.schoolCount > 0 ? '+' : '', color: 'from-indigo-400 to-blue-300' },
                                                                    { label: 'HML 시험지 생성', value: '무제한', suffix: '', color: 'from-violet-400 to-purple-300' },
                                                                ].map((stat, i) => (
                                                                    <div key={i} className="group">
                                                                        <div className={`text-lg sm:text-xl font-black bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                                                                            {stat.value}<span className="text-sm">{stat.suffix}</span>
                                                                        </div>
                                                                        <div className="text-[10px] sm:text-xs text-white/30 font-medium mt-0.5 group-hover:text-white/50 transition-colors">{stat.label}</div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* CTA Glow Button */}
                                                        <div className="animate-entrance delay-500 mt-5 sm:mt-6 flex items-center gap-4">
                                                            <button
                                                                onClick={() => {
                                                                    if (!user) {
                                                                        setStorageModalMode('db');
                                                                        setShowStorageModal(true);
                                                                    } else {
                                                                        setStorageModalMode('db');
                                                                        setShowStorageModal(true);
                                                                    }
                                                                }}
                                                                className="glow-button px-6 py-2.5 rounded-xl font-black text-sm text-white transition-all hover:scale-[1.03] hover:shadow-lg hover:shadow-indigo-500/20"
                                                            >
                                                                <span className="relative z-10 flex items-center gap-2">
                                                                    지금 시작하기
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                                                </span>
                                                            </button>
                                                            <span className="text-xs text-white/20 font-medium hidden sm:inline">가입 없이 바로 검색 가능</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Bottom glow line */}
                                                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent"></div>
                                            </div>

                                            {/* ══════════════════════════════════════
                                                 피처 카드 — Liquid Glass
                                               ══════════════════════════════════════ */}
                                            <div className="relative px-4 sm:px-6 -mt-1 pb-4 pt-4 space-y-2 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-3 bg-gradient-to-b from-slate-50/80 to-white">
                                                {/* Ambient gradient behind cards */}
                                                <div className="absolute inset-0 opacity-40" style={{
                                                    background: 'radial-gradient(ellipse 60% 40% at 20% 30%, rgba(99, 102, 241, 0.08) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 70% 50%, rgba(6, 182, 212, 0.06) 0%, transparent 60%)'
                                                }}></div>

                                                {/* Card 1: 조건 검색 */}
                                                <div className="animate-entrance delay-200 relative group glass-card-light rounded-2xl p-4 sm:p-5 cursor-default" style={{perspective: '800px'}}>
                                                    <div className="relative group-hover:rotate-x-1 group-hover:rotate-y-1 transition-transform duration-500">
                                                        {/* Icon with glow */}
                                                        <div className="relative mb-3">
                                                            <div className="absolute inset-0 w-10 h-10 bg-indigo-500/20 rounded-xl blur-xl group-hover:blur-2xl group-hover:bg-indigo-500/30 transition-all duration-500"></div>
                                                            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200/50 group-hover:scale-110 group-hover:shadow-indigo-300/70 group-hover:rotate-3 transition-all duration-500">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                                            </div>
                                                        </div>
                                                        <p className="text-sm font-black text-slate-800 mb-1">조건 검색</p>
                                                        <p className="text-xs text-slate-400 leading-relaxed" style={{wordBreak:'keep-all'}}>과목·단원·난이도·키워드로 원하는 문제를 정밀하게 찾으세요</p>
                                                        {/* Mini visual */}
                                                        <div className="mt-3 flex gap-1">
                                                            {['과목', '단원', '난이도'].map((tag, i) => (
                                                                <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-500 border border-indigo-100/60 group-hover:bg-indigo-100 group-hover:border-indigo-200 transition-all duration-300" style={{animationDelay: `${0.1*i}s`}}>
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Card 2: 유사문항 추천 (HOT) */}
                                                <div className="animate-entrance delay-300 relative group glass-card-light rounded-2xl p-4 sm:p-5 cursor-default" style={{perspective: '800px'}}>
                                                    {/* HOT badge */}
                                                    <div className="absolute -top-2.5 right-3 z-10">
                                                        <div className="relative">
                                                            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full blur-md opacity-50 animate-pulse-ring"></div>
                                                            <div className="relative bg-gradient-to-r from-cyan-500 to-indigo-500 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg shadow-cyan-500/30">HOT</div>
                                                        </div>
                                                    </div>
                                                    <div className="relative group-hover:rotate-x-1 group-hover:-rotate-y-1 transition-transform duration-500">
                                                        <div className="relative mb-3">
                                                            <div className="absolute inset-0 w-10 h-10 bg-cyan-500/20 rounded-xl blur-xl group-hover:blur-2xl group-hover:bg-cyan-500/30 transition-all duration-500"></div>
                                                            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shadow-lg shadow-cyan-200/50 group-hover:scale-110 group-hover:shadow-cyan-300/70 group-hover:rotate-3 transition-all duration-500">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1"/><rect x="9" y="3" width="13" height="13" rx="2"/></svg>
                                                            </div>
                                                        </div>
                                                        <p className="text-sm font-black text-slate-800 mb-1">유사문항 추천</p>
                                                        <p className="text-xs text-slate-400 leading-relaxed" style={{wordBreak:'keep-all'}}>담은 문제와 비슷한 유형을 자동으로 찾아서 추천해드려요</p>
                                                        {/* Mini animated demo */}
                                                        <div className="mt-3 flex items-center gap-1.5">
                                                            <div className="flex -space-x-1">
                                                                {[0,1,2].map(i => (
                                                                    <div key={i} className="w-6 h-6 rounded bg-gradient-to-br from-cyan-100 to-teal-50 border-2 border-white flex items-center justify-center text-[8px] font-black text-cyan-600 group-hover:scale-110 transition-transform duration-300" style={{transitionDelay: `${i*50}ms`}}>
                                                                        {i+1}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
                                                            <div className="w-6 h-6 rounded bg-gradient-to-br from-emerald-100 to-emerald-50 border-2 border-white flex items-center justify-center group-hover:scale-110 transition-transform duration-300 delay-150">
                                                                <span className="text-[8px] font-black text-emerald-600">AI</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Card 3: HML 시험지 */}
                                                <div className="animate-entrance delay-400 relative group glass-card-light rounded-2xl p-4 sm:p-5 cursor-default" style={{perspective: '800px'}}>
                                                    <div className="relative group-hover:-rotate-x-1 group-hover:rotate-y-1 transition-transform duration-500">
                                                        <div className="relative mb-3">
                                                            <div className="absolute inset-0 w-10 h-10 bg-violet-500/20 rounded-xl blur-xl group-hover:blur-2xl group-hover:bg-violet-500/30 transition-all duration-500"></div>
                                                            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200/50 group-hover:scale-110 group-hover:shadow-violet-300/70 group-hover:rotate-3 transition-all duration-500">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                                                            </div>
                                                        </div>
                                                        <p className="text-sm font-black text-slate-800 mb-1">HML 시험지</p>
                                                        <p className="text-xs text-slate-400 leading-relaxed" style={{wordBreak:'keep-all'}}>한글 호환 HML 파일로 바로 출력 가능한 시험지를 생성해요</p>
                                                        {/* Mini file preview */}
                                                        <div className="mt-3">
                                                            <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-lg p-2 border border-violet-100/60 group-hover:border-violet-200 transition-all duration-300">
                                                                <div className="flex items-center gap-1.5">
                                                                    <div className="w-5 h-6 bg-violet-200 rounded flex items-center justify-center">
                                                                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="3"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/></svg>
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-[9px] font-bold text-violet-700 truncate">수학_중간고사.hml</div>
                                                                        <div className="w-full h-0.5 bg-violet-100 rounded-full mt-0.5 overflow-hidden">
                                                                            <div className="h-full bg-gradient-to-r from-violet-400 to-purple-400 rounded-full" style={{width: '75%'}}></div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ══════════════════════════════════════
                                                 스텝 인디케이터 — Interactive Timeline
                                               ══════════════════════════════════════ */}
                                            <div className="px-4 sm:px-6 pb-4 bg-white">
                                                <div className="relative flex items-stretch gap-0 text-xs overflow-x-auto pb-1 pt-1">
                                                    {/* Background connection line */}
                                                    <div className="absolute top-1/2 left-6 right-6 h-[2px] -translate-y-1/2 hidden sm:block">
                                                        <div className="h-full bg-gradient-to-r from-indigo-200/60 via-cyan-200/60 via-violet-200/60 to-emerald-200/60 rounded-full"></div>
                                                        {/* Animated overlay */}
                                                        <div className="absolute inset-0 h-full bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 rounded-full opacity-30 line-draw" style={{animationDelay: '0.5s', animationDuration: '2s'}}></div>
                                                    </div>

                                                    {[
                                                        { num: '1', label: 'DB 선택', desc: '보유한 기출 DB를 선택', icon: '📦', gradient: 'from-indigo-500 to-indigo-600', bgLight: 'bg-indigo-50', textColor: 'text-indigo-600', borderColor: 'border-indigo-200' },
                                                        { num: '2', label: '조건 검색', desc: '단원·난이도로 필터링', icon: '🔍', gradient: 'from-cyan-500 to-teal-500', bgLight: 'bg-cyan-50', textColor: 'text-cyan-600', borderColor: 'border-cyan-200' },
                                                        { num: '3', label: '문제 담기', desc: '원하는 문제를 장바구니에', icon: '🛒', gradient: 'from-violet-500 to-purple-500', bgLight: 'bg-violet-50', textColor: 'text-violet-600', borderColor: 'border-violet-200' },
                                                        { num: '4', label: '시험지 저장', desc: 'HML로 자동 생성', icon: '✅', gradient: 'from-emerald-500 to-green-500', bgLight: 'bg-emerald-50', textColor: 'text-emerald-600', borderColor: 'border-emerald-200' },
                                                    ].map((step, i) => (
                                                        <div key={step.num} className="flex-1 relative animate-entrance" style={{ animationDelay: `${0.6 + i * 0.12}s` }}>
                                                            <div className="group flex flex-col items-center text-center cursor-default px-1 py-2 rounded-xl hover:bg-slate-50/80 transition-all duration-300">
                                                                {/* Step circle */}
                                                                <div className={`relative w-8 h-8 rounded-lg bg-gradient-to-br ${step.gradient} flex items-center justify-center text-white font-black text-xs shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all duration-300 z-10`}>
                                                                    <span className="group-hover:hidden">{step.num}</span>
                                                                    <span className="hidden group-hover:block text-sm">{step.icon}</span>
                                                                    {/* Pulse ring on hover */}
                                                                    <div className="absolute inset-0 rounded-xl bg-gradient-to-br opacity-0 group-hover:opacity-40 group-hover:animate-pulse-ring transition-opacity duration-300" style={{background: `linear-gradient(135deg, var(--tw-gradient-stops))`}}></div>
                                                                </div>
                                                                {/* Label */}
                                                                <span className={`mt-1.5 font-bold ${step.textColor} text-[11px] group-hover:font-black transition-all duration-300`}>{step.label}</span>
                                                                {/* Expandable description */}
                                                                <span className="text-[10px] text-slate-300 font-medium mt-0.5 max-h-0 overflow-hidden group-hover:max-h-8 transition-all duration-500 ease-out">{step.desc}</span>
                                                            </div>
                                                        </div>
                                                    ))}
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
                                {(() => {
                                    const totalPages = Math.ceil(totalQuestions / itemsPerPage);
                                    const pages: (number | '...')[] = [];
                                    if (totalPages <= 7) {
                                        for (let i = 1; i <= totalPages; i++) pages.push(i);
                                    } else {
                                        pages.push(1);
                                        if (currentPage > 3) pages.push('...');
                                        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
                                        if (currentPage < totalPages - 2) pages.push('...');
                                        pages.push(totalPages);
                                    }
                                    return pages.map((page, idx) => page === '...' ? (
                                        <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-slate-400">…</span>
                                    ) : (
                                        <button
                                            key={page}
                                            onClick={() => handlePageChange(page as number)}
                                            className={`w-8 h-8 rounded flex items-center justify-center font-bold transition-colors ${currentPage === page ? 'bg-brand-600 text-white' : 'border border-slate-300 hover:bg-slate-50 text-slate-600'}`}
                                        >
                                            {page}
                                        </button>
                                    ));
                                })()}
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
                    onCheck={(questionIds: string[], examName: string) => {
                        setExcludedQuestionIds(prev => {
                            const combined = new Set([...prev, ...questionIds]);
                            return Array.from(combined);
                        });
                        setShowDuplicateModal(false);
                        setShowStorageModal(false);
                        setShowMobileSidebar(true);

                        if (questionIds.length > 0) {
                            showToast(`"${examName}"에 사용된 문제 ${questionIds.length}개를 검색에서 제외합니다.`, 'success');
                        } else {
                            showToast('선택한 시험지에 문제 데이터가 없습니다.', 'info');
                        }
                    }}
                />
            )}
        </div >

        {/* Toast 알림 UI */}
        {toastMessage && (
            <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl shadow-2xl font-bold text-sm max-w-[90vw] text-center ${
                toastType === 'success' ? 'bg-emerald-600 text-white' :
                toastType === 'error' ? 'bg-red-600 text-white' :
                'bg-slate-800 text-white'
            }`}>
                {toastMessage}
            </div>
        )}
        </>
    );
}
