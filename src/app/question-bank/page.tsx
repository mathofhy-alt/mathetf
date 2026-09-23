'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { PERSONAL_DB_FREE_MODE, SAVED_EXAM_LIMIT } from '@/lib/config';
import { questionBankLoginUrl } from '@/lib/auth-return';
import { DRAFT_KEY, parseDraft, draftContext, shouldRestoreDraft, shouldSearchRestoredDraft } from '@/lib/questions/draft';
import { logQuestionBankEvent, questionBankSession } from '@/lib/analytics/question-bank';
import SaveLocationModal from '@/components/storage/SaveLocationModal';
import AutoGenModal from '@/components/question-bank/AutoGenModal';
import FolderExplorer from '@/components/storage/FolderExplorer';
import SourceCatalog from '@/components/storage/SourceCatalog';
import FilterSidebar from '@/components/question-bank/FilterSidebar';
import GuidedTour, { TourStep } from '@/components/GuidedTour';

import QuestionRenderer from '@/components/QuestionRenderer';

// 선생님·강사 시험지 만들기 투어
const TEACHER_TOUR_STEPS: TourStep[] = [
    {
        target: '[data-tour="qb-pool"]',
        title: '① 문제 범위 선택',
        body: '출제 자료에서 학교와 시험 회차를 고르세요. 특정 기출에서 들어왔다면 해당 회차가 선택되어 있습니다. 만든 시험지에서는 기존 시험지를 불러올 수 있습니다.',
        placement: 'right',
    },
    { target: '[data-tour="qb-filter"]', title: '② 조건으로 좁히기', body: '과목·단원·난이도·키워드로 원하는 문제만 골라낼 수 있어요.', placement: 'right' },
    { target: '[data-tour="qb-search"]', title: '③ 조건 검색', body: '고른 조건에 맞는 기출 문제를 불러와요. 결과에서 원하는 문제를 담으면 돼요.', placement: 'right' },
    { target: '[data-tour="qb-auto"]', title: '④ 범위에 맞춰 자동 출제', body: '선택 자료의 단원·난이도에 맞는 문항을 자동으로 고릅니다. 이미 담은 문항은 제외하며, 부족하면 범위를 넓히지 않고 안내합니다.', placement: 'bottom' },
    { target: '[data-tour="qb-generate"]', title: '⑤ 시험지 만들기', body: '담은 문제로 나만의 시험지를 만들어요. 완성본은 한글에서 열 수 있는 HML 파일로 받아 편집·인쇄할 수 있어요.', placement: 'bottom' },
];
import DuplicateCheckModal from '@/components/storage/DuplicateCheckModal';

import ConfigModal from '@/components/question-bank/ConfigModal';
import SimilarQuestionsModal from '@/components/question-bank/SimilarQuestionsModal';
import SolutionViewerModal from '@/components/question-bank/SolutionViewerModal';
import Header from '@/components/Header';
import AccessPolicy from '@/components/AccessPolicy';
import RecentExams from '@/components/question-bank/RecentExams';
import { hasEntryContext } from '@/lib/questions/entry';
import { formatFileSize } from '@/lib/discovery';
import UploadModal from '@/components/UploadModal';
import { Folder as FolderIcon, Database, X, Trash2, FileText, Search, CheckSquare, ChevronUp, ChevronDown } from 'lucide-react';
import type { UserItem } from '@/types/storage';


const MAX_CART_SIZE = 50;

// A/B형·가/나형 회차는 같은 학년·월·번호를 공유해서 카드 라벨이 완전히 똑같아진다
// (2010 6월 가형 2번 = 나형 2번). 형은 source_db_id 끝토막에만 있으므로 그걸 꺼내 붙인다.
function examFormLabel(sourceDbId?: string | null): string {
    const m = /_([A-B가나])형$/.exec(sourceDbId || '');
    return m ? ` ${m[1]}형` : '';
}

/**
 * [시험지출제 퍼널 로깅] 2026-08-26.
 * 그전까지는 저장 성공(saved_exam)만 남아, 몇 명이 만들려다 그만뒀는지 알 수 없었다.
 * 행동 횟수와 이용 세션 수를 별도로 집계한다 —
 * 검색·담기는 수십 번 반복되므로 그대로 두면 로그가 행동이 아니라 클릭 수를 세게 된다.
 */
function logQb(step: string, title?: string) { logQuestionBankEvent(step, { detail: title?.slice(0, 200) }); }

export default function QuestionBankPage() {
    const [questions, setQuestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [runTeacherTour, setRunTeacherTour] = useState(false);

    // 로그인 전후의 같은 브라우저 세션을 연결한다.
    useEffect(() => { logQb('qb_enter'); }, []);

    // ?tour=1 강제 진입 또는 이 페이지 첫 방문이면 투어 시작 (1회)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const forced = new URLSearchParams(window.location.search).get('tour') === '1';
        const seen = localStorage.getItem('mathetf_qb_tour_seen');
        // [모바일] 투어가 바텀시트를 자동으로 열고 그 위에 카드를 겹쳐 첫 화면이 이중 오버레이가 됐다(9/7 감사 ③).
        //   폰에서는 자동 시작하지 않는다. ?tour=1 로 직접 부른 경우만 연다.
        if (!forced && window.innerWidth < 768) return;
        if (forced) {
            // DOM/요소 준비 후 시작
            const t = setTimeout(() => setRunTeacherTour(true), 600);
            return () => clearTimeout(t);
        }
    }, []);

    // ?school=○○고등학교 → 그 학교 개인DB만 자동 선택 (학교 페이지 '시험지 만들기'에서 진입)
    const schoolPrefillDone = useRef(false);
    const [savedCount,setSavedCount]=useState(0);
    const [filterVersion,setFilterVersion]=useState(0);
    const [entryLabel,setEntryLabel]=useState('');
    const [entryFailure,setEntryFailure]=useState(false);
    const [zoomQuestion,setZoomQuestion]=useState<any>(null);
    const [cart, setCart] = useState<any[]>([]);
    const [draftReady, setDraftReady] = useState(false);
    const restoredDraftRef=useRef(false);
    const searchedRestoredDraft=useRef(false);
    const resumeSearchRef=useRef(false);
    const [catalogNotice, setCatalogNotice] = useState('');
    const [savedExam, setSavedExam] = useState<{ id: string; name: string; bytes?:number; count?:number } | null>(null);
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

    const [isGenerating, setIsGenerating] = useState(false);
    const saveInFlight=useRef(false);
    const [recentOpen,setRecentOpen]=useState(false);
    const [isAutoAdding, setIsAutoAdding] = useState(false);
    const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set());
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [similarTarget, setSimilarTarget] = useState<any | null>(null);
    const [solutionTarget, setSolutionTarget] = useState<any | null>(null);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [viewMode, setViewMode] = useState<'search' | 'review'>('search');
    // 검색 결과 카드 열 수 (3=크게, 4=많이) — 사용자 선택, localStorage 유지
    const [searchCols, setSearchCols] = useState<3 | 4>(3);
    const [isFilterCollapsed, setIsFilterCollapsed] = useState(false);
    const desktopFilterToggleRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        const v = localStorage.getItem('qb_search_cols');
        if (v === '3' || v === '4') setSearchCols(Number(v) as 3 | 4);
    }, []);
    const changeSearchCols = (n: 3 | 4) => { setSearchCols(n); try { localStorage.setItem('qb_search_cols', String(n)); } catch { } };
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const dragOrderRef = useRef<any[]>([]); // 드래그 중 순서를 ref에만 저장 (re-render 최소화)
    const [showAutoModal, setShowAutoModal] = useState(false);
    const [regenerateItem,setRegenerateItem]=useState<any>(null);
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
    // 마지막 검색이 실제로 쓴 DB 범위. 미선택('전체 문제 검색')일 때 페이징이 범위를 잃지 않게 한다.
    const lastSearchDbIds = useRef<string[]>([]);
    const [filterState, setFilterState] = useState<any>(null); // Store filters locally for manual search
    // Derived for legacy support or convenience if needed, but mainly use IDs

    // [퍼널 2026-08-30] ?src=<source_db_id> 로 들어오면 그 회차 문항을 장바구니에 담은 채로 시작한다.
    // 시험지 상세(/exam/[id])의 '이 문항으로 시험지 만들기' 가 여기로 보낸다.
    // 유입 대부분이 네이버 정확매칭 검색으로 시험지 상세에 떨어지는데, 도구로 오면 빈 화면이라
    // 검색부터 다시 시작해야 했다(도구 완주율 20%, 검색→담기 53% 이탈).
    const srcLoaded = useRef(false);

    /** 회차 하나를 통째로 장바구니에 담는다. ?src= 진입과 '이어서 만들기' 카드가 같이 쓴다. */
    const fillFromSrc = async (src: string, logTitle: string) => {
        const res = await fetch('/api/questions/by-ids', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ src }),
        });
        const r = await res.json();
        const data = (r?.data || []) as any[];
        if (!data.length) return 0;
        setCart(data.slice(0, MAX_CART_SIZE));
        setViewMode('review');
        logQb('qb_cart_add', logTitle.replace('{n}', String(data.length)));
        if (data.length > MAX_CART_SIZE) {
            showToast(`한 시험지 최대 ${MAX_CART_SIZE}문제라 ${MAX_CART_SIZE}개만 담았습니다.`, 'info');
        }
        return data.length;
    };

    useEffect(() => {
        if (srcLoaded.current || new URLSearchParams(window.location.search).has('resume') || hasEntryContext(new URLSearchParams(window.location.search))) return;
        const src = new URLSearchParams(window.location.search).get('src');
        if (!src) return;
        srcLoaded.current = true;
        (async () => {
            try { await fillFromSrc(src, 'from_exam:{n}'); }
            catch { /* 조용히 — 빈 도구로 시작한다 */ }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // [퍼널 2026-09-13] 직접 들어온 사람에게 '직전에 받아간 회차'를 한 번에 담을 카드를 준다.
    //   실측(8/26~9/12): 빈 화면 진입 82명 중 32명이 아무것도 누르지 않고 이탈했고,
    //   그중 21명은 이미 무료PDF 를 받아본 사람이었다. 만들 학교는 있는데 첫 화면에 할 일이 없었다.
    const [resumeItem, setResumeItem] = useState<{ src: string; school: string; count: number; label: string } | null>(null);
    const [resumeBusy, setResumeBusy] = useState(false);
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        if (q.get('src') || q.get('school')) return;   // 이미 채워져 들어온 사람에겐 필요 없다
        let alive = true;
        fetch('/api/questions/resume')
            .then(r => r.json())
            .then(r => { if (alive && r?.item) setResumeItem(r.item); })
            .catch(() => { });
        return () => { alive = false; };
    }, []);

    // [강사 유입] ?school= 로 들어오면 그 학교 DB만 선택된 상태로 시작 (학교 페이지 → 시험지 만들기 동선)
    useEffect(() => {
        if (schoolPrefillDone.current || purchasedDbs.length === 0 || hasEntryContext(new URLSearchParams(window.location.search))) return;
        schoolPrefillDone.current = true;
        if (new URLSearchParams(window.location.search).has('resume')) return;
        const raw = new URLSearchParams(window.location.search).get('school');
        if (!raw) return;
        const target = decodeURIComponent(raw);
        const ids = purchasedDbs.filter((d: any) => d.school === target).map((d: any) => d.id);
        if (ids.length > 0) setSelectedDbIds(ids);
    }, [purchasedDbs]);

    // Header & Points State
    const [purchasedPoints, setPurchasedPoints] = useState<number>(0);
    const [earnedPoints, setEarnedPoints] = useState<number>(0);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

    // Storage Explorer State
    const [showStorageModal, setShowStorageModal] = useState(false);
    const [storageModalMode, setStorageModalMode] = useState<'all' | 'db' | 'exam'>('all');
    // DB/시험지 모달용 프리페치 — 버튼 누르기 전에 미리 받아둬서 열자마자 목록 표시
    const [storagePrefetch, setStoragePrefetch] = useState<{ db?: any; exam?: any }>({});
    const [storageRefreshKey, setStorageRefreshKey] = useState(0);
    const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
    const [currentExamItems, setCurrentExamItems] = useState<any[]>([]); // tracks viewItems from FolderExplorer
    const [excludedQuestionIds, setExcludedQuestionIds] = useState<string[]>([]); // 중복출제 방지용 제외 문제 ID

    // ESC로 모달 닫기
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (zoomQuestion) setZoomQuestion(null);
                else if (solutionTarget) setSolutionTarget(null);
                else if (similarTarget) setSimilarTarget(null);
                else if (showConfigModal) setShowConfigModal(false);
                else if (showSaveModal) {if(!saveInFlight.current)setShowSaveModal(false);}
                else if (showAutoModal) {setShowAutoModal(false);setRegenerateItem(null);}
                else if (showStorageModal) setShowStorageModal(false);
            }
        };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [zoomQuestion, solutionTarget, similarTarget, showConfigModal, showSaveModal, showAutoModal, showStorageModal]);

    // Pre-fetch Storage Data for Instant Feel — DB/시험지 모달 데이터를 미리 받아 열자마자 표시
    // (storageRefreshKey 변경 시 재프리페치 → 저장 직후에도 최신 유지)
    useEffect(() => {
        if (!user) return;
        (['db', 'exam'] as const).forEach((t) => {
            fetch(`/api/storage/folders?mode=all&folderType=${t}`)
                .then(res => res.json())
                .then(data => {
                    if (data && !data.error) setStoragePrefetch(prev => ({ ...prev, [t]: data }));
                })
                .catch(err => console.error(`Storage Pre-fetch Error(${t}):`, err));
        });
    }, [user, storageRefreshKey]);



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
        try {
            const response = await fetch('/api/questions/catalog');
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || '자료 목록을 불러오지 못했습니다.');
            const ready = result.data.filter((db: any) => !db.availability);
            const pending = result.data.filter((db: any) => db.availability);
            setPurchasedDbs(ready);
            setCatalogNotice(pending.length ? `${pending.length}개 자료는 문항 검수 또는 학년 정보 확인 중입니다. 준비된 자료만 선택할 수 있습니다.` : '');
            if (!restoredDraftRef.current && !new URLSearchParams(window.location.search).has('resume') && !hasEntryContext(new URLSearchParams(window.location.search))) setSelectedDbIds(ready.map((db: any) => db.id));
        } catch (error) {
            setCatalogNotice(error instanceof Error ? error.message : '자료 목록을 불러오지 못했습니다.');
        }
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
                    ? { ...q, question_images: (imagesMap && imagesMap[q.id]) || [], imageLoadError: imagesMap === null }
                    : q
            ));
        }
    };

    const retryQuestionImages = async (id: string) => {
        const update = (images: any[] | null, failed: boolean) => {
            const patch = (items: any[]) => items.map(q => q.id === id ? { ...q, question_images: images, imageLoadError: failed } : q);
            setQuestions(patch); setCart(patch);
        };
        update(null, false);
        try {
            const res = await fetch('/api/questions/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error('이미지 요청 실패');
            update(result.images?.[id] || [], false);
        } catch { update([], true); }
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
                setIsFilterCollapsed(false);
                // [퍼널] 검색 15명 → 장바구니 7명(53% 이탈)의 원인이
                // '결과가 0건' 인지 '찾았는데 안 담음' 인지 지금 로그로는 구분이 안 된다.
                logQb('qb_search_empty', `f:${Object.keys(advancedFilters || {}).filter(k => (advancedFilters as any)[k]?.length).join(',') || 'none'}`);
                showToast('해당 조건에 일치하는 문항이 없습니다. (0건)', 'info');
            }
        } catch (err: any) {
            if (targetPage === 1) setIsFilterCollapsed(false);
            console.error("fetchQuestions error:", err);
            showToast(`검색 실패: ${err.message || '오류가 발생했습니다.'}`, 'error');
            setQuestions([]);
        } finally {
            setLoading(false);
        }

    };

    const handleSearch = () => {
        if(entryFailure&&!selectedDbIds.length){showToast('진입한 범위에 출제 자료가 없습니다. 자료를 직접 선택하거나 전체 검색으로 전환해주세요.','error');return;}
        // [퍼널 2026-08-29] 예전엔 DB 미선택이면 토스트만 띄우고 막았다.
        // 로그를 붙여 재보니 도구 진입 29명 중 8명(28%)이 첫 동작에서 여기서 튕겼다.
        // 게다가 화면 제목은 이 상태에서 '전체 문제 검색' 이라고 써 있어 앞뒤가 안 맞았다.
        //
        // 서버(/api/questions/search)는 '전체 선택'(selectedDbs >= purchasedDbsCount)이면
        // 학교·DB 필터를 아예 걸지 않는다. 즉 '아무것도 안 고름' 과 '전체 선택' 의 결과가 같아야 맞다.
        // 그래서 미선택이면 보유 DB 전체를 넘긴다 — 사용자가 '전체 선택' 버튼을 누른 것과 똑같은 요청이라
        // 노출되는 문항이 늘지 않는다. 무료 기간이 끝나 purchasedDbs 가 '구매한 것' 으로 좁혀지면
        // 이 경로도 자동으로 그만큼만 검색한다.
        const effectiveDbIds = selectedDbIds.length > 0
            ? selectedDbIds
            : purchasedDbs.map((d: any) => d.id);

        if (effectiveDbIds.length === 0) {
            // 정말로 쓸 수 있는 DB 가 하나도 없는 경우 — 고르라고 해봐야 고를 게 없다
            logQb('qb_search', 'blocked:empty_catalog');
            showToast('아직 사용할 수 있는 문제 DB가 없습니다. 홈에서 학교 기출을 담아주세요.', 'info');
            return;
        }

        logQb('qb_db_select', `dbs:${effectiveDbIds.length}`);
        logQb('qb_search', selectedDbIds.length > 0 ? `dbs:${effectiveDbIds.length}` : `all:${effectiveDbIds.length}`);
        setHasSearched(false);
        setIsFilterCollapsed(true);
        if (window.innerWidth >= 768) window.requestAnimationFrame(() => desktopFilterToggleRef.current?.focus());
        lastSearchDbIds.current = effectiveDbIds;
        fetchQuestions(effectiveDbIds, filterState, 1);
    };

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        // 미선택 상태로 '전체 문제 검색' 을 했으면 2페이지도 같은 범위여야 한다.
        // selectedDbIds 를 그대로 쓰면 빈 배열이 넘어가 2페이지부터 0건이 된다.
        fetchQuestions(lastSearchDbIds.current.length > 0 ? lastSearchDbIds.current : selectedDbIds,
                       filterState, newPage);
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



    // [비로그인 카탈로그] 전체 DB(purchasedDbs)를 보관함 아이템(UserItem) 모양으로 매핑해
    // 기존 FolderExplorer 디자인 그대로 보여준다. (선택은 reference_id 기반 기존 로직 그대로 작동)
    const guestDbInitialData = useMemo(() => {
        if (user) return undefined;
        const items = [...purchasedDbs]
            .sort((a: any, b: any) =>
                (a.school || '').localeCompare(b.school || '', 'ko')
                || (Number(b.exam_year) || 0) - (Number(a.exam_year) || 0))
            .map((db: any) => {
                // FileGrid 그룹핑 규칙(고N / N학기 중간·기말 / 연도)에 맞춰 이름 구성
                const isMock = db.exam_type === '모의고사' || db.exam_type === '수능';
                const isAdmission = db.exam_type === '입학시험';
                const gradePart = db.grade ? `고${String(db.grade).replace('고', '')}` : '';
                const examPart = isAdmission ? '입학시험' : isMock
                    ? `${db.semester ? db.semester + '월 ' : ''}${db.exam_type}`
                    : `${db.semester ? db.semester + '학기 ' : ''}${db.exam_type?.includes('중간') ? '중간' : db.exam_type?.includes('기말') ? '기말' : (db.exam_type || '')}`;
                return {
                    id: db.id,
                    folder_id: 'root',
                    user_id: 'guest',
                    type: 'personal_db' as const,
                    reference_id: db.id,
                    name: `${db.school} ${gradePart} ${db.exam_year ? db.exam_year + '년' : ''} ${examPart} ${db.subject || ''} [개인DB]`.replace(/\s+/g, ' ').trim(),
                    created_at: '',
                    details: db,
                };
            });
        return { folders: [], items, isUnified: true };
    }, [user, purchasedDbs]);

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



    /**
     * [수업 사다리 2026-08-30] 문항 하나 → 기초·유형·목표 3단으로 장바구니를 채운다.
     * 사용자(현직 강사)가 "쉬운것부터 사다리 하는건 강사가 수업을 구성할때 필요한 단계"라고 했다.
     * 킬러 하나 가르치려고 하위 문제를 검색창에서 뒤지던 것을 없앤다.
     */
    const buildLadder = async (question: any) => {
        try {
            const res = await fetch('/api/pro/ladder', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: question.id }),
            });
            const r = await res.json();
            const steps = (r?.steps || []) as { label: string; id: string }[];
            if (steps.length <= 1) {
                showToast(r?.reason || '이 문항은 아래 단계 문항을 찾지 못했습니다.', 'info');
                return;
            }
            const need = steps.map((x) => x.id).filter((qid) => !cartIdSet.has(qid));
            if (need.length === 0) { showToast('이미 다 담겨 있습니다.', 'info'); return; }
            const byIds = await fetch('/api/questions/by-ids', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: need }),
            });
            const got = await byIds.json();
            const map = new Map((got?.data || []).map((q: any) => [q.id, q]));
            const ordered = steps.map((x) => map.get(x.id)).filter(Boolean) as any[];
            const room = MAX_CART_SIZE - cart.length;
            const add = ordered.slice(0, Math.max(0, room));
            if (add.length === 0) { showToast(`장바구니가 이미 ${MAX_CART_SIZE}문제로 가득 찼습니다.`, 'info'); return; }
            setCart((prev) => [...(Array.isArray(prev) ? prev : []), ...add]);
            logQb('qb_ladder', `steps:${steps.length}`);
            showToast(`${steps.map((x) => x.label).join(' → ')} ${add.length}문항을 담았습니다.`, 'success');
        } catch {
            showToast('사다리를 만들지 못했습니다. 잠시 후 다시 시도해주세요.', 'error');
        }
    };

    const toggleCart = (question: any) => {
        logQb('qb_cart_add');   // [퍼널] 첫 담기 1회만
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

        // [퍼널] 담기 경로가 둘이라 여기도 남긴다. 개별 클릭(toggleCart)만 걸어뒀더니
        // 전체선택으로 50문항을 담아 저장해도 qb_cart_add 가 안 찍혔다(8/26 확인).
        logQb('qb_cart_add', 'select_all');

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

    // [모바일] HTML5 드래그는 터치에서 동작하지 않아 폰에서는 순서를 바꿀 방법이 없었다(9/7 감사 ②).
    //   위/아래 한 칸 이동 버튼용. 데스크톱은 드래그 그대로.
    const moveInCart = (idx: number, dir: -1 | 1) => {
        setCart(prev => {
            const j = idx + dir;
            if (j < 0 || j >= prev.length) return prev;
            const next = [...prev];
            [next[idx], next[j]] = [next[j], next[idx]];
            return next;
        });
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

    useEffect(() => {
        let active = true;
        const restore = async () => {
            try {
                const resuming = new URLSearchParams(window.location.search).has('resume');
                const savedDraft=parseDraft(localStorage.getItem(DRAFT_KEY));
                const draft=shouldRestoreDraft(savedDraft,new URLSearchParams(window.location.search))?savedDraft:null;
                let ids: string[] = [];
                if (draft) {
                    restoredDraftRef.current=true;
                    resumeSearchRef.current=shouldSearchRestoredDraft(draft,new URLSearchParams(window.location.search));
                    setEntryLabel(resumeSearchRef.current ? '저장 전 작업을 이어서 만들고 있습니다.' : '이전 출제 조건을 복원했습니다. 조건 검색하기를 눌러 문항을 확인하세요.');
                    ids = draft.cartIds;
                    setSelectedDbIds(draft.selectedDbIds);
                    setExcludedQuestionIds(draft.excludedQuestionIds);
                    setSelectedExamIds(draft.selectedExamIds);
                    setFilterState(draft.filters);
                    setExamTitle(draft.title);
                    setQuestionsPerColumn(draft.questionsPerColumn);
                    setViewMode(draft.viewMode);
                    setShowAutoModal(draft.autoOpen);
                } else if (!new URLSearchParams(window.location.search).has('src') && !hasEntryContext(new URLSearchParams(window.location.search))) {
                    const legacy = JSON.parse(localStorage.getItem('exam_cart_ids') || '[]');
                    if (Array.isArray(legacy)) ids = legacy.filter(x => typeof x === 'string').slice(0, 50);
                }
                if (ids.length) {
                    const response = await fetch('/api/questions/by-ids', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
                    });
                    const result = await response.json();
                    if (!response.ok || !Array.isArray(result.data)) throw new Error('이전 문제를 불러오지 못했습니다. 새로고침하면 다시 시도합니다.');
                    const map = new Map(result.data.map((q: any) => [q.id, q]));
                    if (active) {
                        setCart(ids.map(id => map.get(id)).filter(Boolean));
                        if (result.data.length !== ids.length) showToast('일부 문항을 복원하지 못했습니다. 저장 전에 문항 수를 확인해주세요.', 'info');
                    }
                }
                if (active) {setDraftReady(true);if(resuming)logQb('qb_resume');}
            } catch (error) { if (active) showToast((error as Error).message, 'error'); }
        };
        restore();
        return () => { active = false; };
    }, [showToast]);

    useEffect(() => {
        if (!draftReady) return;
        try {
            const ids = cart.map(q => q.id);
            localStorage.setItem('exam_cart_ids', JSON.stringify(ids));
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, updatedAt: Date.now(), entryContext:draftContext(new URLSearchParams(window.location.search)), cartIds: ids,
                selectedDbIds, excludedQuestionIds, selectedExamIds, filters: filterState, title: examTitle,
                questionsPerColumn, viewMode, autoOpen: showAutoModal && !regenerateItem }));
        } catch { showToast('이 브라우저에서 작업을 임시 보관할 수 없습니다.', 'info'); }
    }, [draftReady, cart, selectedDbIds, excludedQuestionIds, selectedExamIds, filterState, examTitle, questionsPerColumn, viewMode, showAutoModal, regenerateItem, showToast]);


    const entryStarted=useRef(false);
    useEffect(()=>{
      const params=new URLSearchParams(window.location.search);
      if(!draftReady||!isDbInitialized||restoredDraftRef.current||entryStarted.current||params.has('resume')||!hasEntryContext(params))return;
      entryStarted.current=true;
      fetch(`/api/questions/entry?${params}`).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);
       setSelectedDbIds(d.dbIds);setFilterState(d.filters);setFilterVersion(v=>v+1);setEntryLabel(d.label);
       if(d.demo){const detail=await fetch('/api/questions/by-ids',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:d.data.map((q:any)=>q.id)})}).then(r=>r.json());
        if(detail.data?.length!==5)throw Error('예시 문항을 불러오지 못했습니다.');setCart(d.data.map((q:any)=>detail.data.find((x:any)=>x.id===q.id)));setExamTitle('기출 5문항 체험');setViewMode('review');logQb('qb_demo');}
       else{setQuestions(d.data.map((q:any)=>({...q,question_images:null})));loadImagesProgressively(d.data.map((q:any)=>q.id));lastSearchDbIds.current=d.dbIds;setHasSearched(true);setTotalQuestions(d.total??d.data.length);setCurrentPage(1);}
      }).catch(e=>{setEntryFailure(true);setSelectedDbIds([]);setQuestions([]);setTotalQuestions(0);setHasSearched(true);setEntryLabel((e as Error).message);showToast((e as Error).message,'error');});
    },[draftReady,isDbInitialized]);
    useEffect(()=>{
      if(!draftReady||!isDbInitialized||!restoredDraftRef.current||searchedRestoredDraft.current)return;
      searchedRestoredDraft.current=true;
      if(resumeSearchRef.current&&viewMode==='search'&&selectedDbIds.length)handleSearch();
    },[draftReady,isDbInitialized,viewMode,selectedDbIds]);
    const restoreRecent=async(item:any,fresh:boolean)=>{
      if(cart.length&&!confirm('현재 담은 문항을 이 시험지로 바꾸시겠습니까?'))return;
      const allowed=new Set(purchasedDbs.filter(d=>!d.availability).map(d=>d.id));
      const scope=(item.dbIds||[]).filter((id:string)=>allowed.has(id));
      if(fresh&&(!scope.length||scope.length!==item.dbIds.length)){showToast('이전 시험지의 자료 범위를 모두 이용할 수 없습니다. 자료를 직접 선택해주세요.','error');return;}
      if(fresh){setRegenerateItem({...item,dbIds:scope});setShowAutoModal(true);return;}
      let restored:any[]=[];
      if(!fresh){try{const r=await fetch('/api/questions/by-ids',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:item.ids})});const d=await r.json();if(!r.ok||d.data?.length!==item.ids.length)throw Error();const map=new Map(d.data.map((q:any)=>[q.id,q]));restored=item.ids.map((id:string)=>map.get(id));}catch{showToast('전체 문항을 불러오지 못했습니다. 기존 작업은 유지됩니다.','error');return;}}
      setSelectedDbIds(scope);setFilterState(item.filters);setFilterVersion(v=>v+1);setQuestionsPerColumn(item.questionsPerColumn);setExamTitle(`${item.name} 다시 만들기`.slice(0,100));setEntryLabel(`${item.name}에서 이어서 출제`);setEntryFailure(false);
      setRecentOpen(false);setCart(restored);setExcludedQuestionIds([]);setViewMode('review');showToast('시험지를 불러왔습니다. 수정 후 저장하면 새 시험지로 남습니다.');
      logQb('qb_clone');
    };

    // Config Confirmed -> Open Save Modal
    const handleConfigConfirm = (title: string, qpc: number) => {
        setExamTitle(title);
        setQuestionsPerColumn(qpc);
        setShowConfigModal(false);
        setShowSaveModal(true);
    };

    // Save Location Confirmed -> Execute Save
    const handleSaveConfirm = async (folderId: string | null) => {
        if(saveInFlight.current)return;
        if(savedCount>=SAVED_EXAM_LIMIT){showToast('보관함이 가득 찼습니다. 파일을 받은 뒤 기존 시험지를 정리해주세요.','error');return;}
        saveInFlight.current=true;setIsGenerating(true);

        try {
            const response = await fetch('/api/pro/exam/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-qb-session-id': questionBankSession() },
                body: JSON.stringify({
                    ids: cart.map(q => q.id),
                    title: examTitle,
                    folderId: folderId || 'root',
                    dbIds: selectedDbIds,  // 현재 선택된 DB UUID들 전달
                    questionsPerColumn: questionsPerColumn,
                    filters:filterState,
                }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                // [퍼널] 저장까지 왔는데 실패한 건 가장 아까운 이탈이라 따로 남긴다
                logQb('qb_save_fail', String(result.error || response.status).slice(0, 120));
                throw new Error(result.error || 'Save failed');
            }

            logQuestionBankEvent('qb_save', { exam_id: result.item.id, question_count: cart.length });
            setSavedExam({ id: result.item.id, name: result.savedTitle || examTitle,bytes:result.fileBytes,count:cart.length });
            // 이름이 겹쳐 번호가 붙었으면 그대로 알려준다. 조용히 바꾸면 보관함에서 못 찾는다.
            const saved = result.savedTitle as string | undefined;
            showToast(
                saved && saved !== examTitle
                    ? `같은 이름이 있어 "${saved}" 로 저장했어요. 아래 파일 받기 버튼을 눌러주세요.`
                    : '보관함에 저장되었습니다! 아래 파일 받기 버튼을 눌러주세요.',
                'success');
            setCart([]);
            try{localStorage.removeItem('exam_cart');}catch{}
            setShowSaveModal(false);
            setViewMode('search');

            // [V72] Refresh storage data & Invalidate cache
            // (storageRefreshKey 변경 → 프리페치 effect가 db/exam 데이터 자동 재로드)
            setStorageRefreshKey(prev => prev + 1);

            // Optional: Open Storage Modal to show the result?
            // setShowStorageModal(true);

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            showToast('저장 실패: ' + errorMessage, 'error');
        } finally {
            saveInFlight.current=false;setIsGenerating(false);
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
        <GuidedTour
            steps={TEACHER_TOUR_STEPS}
            run={runTeacherTour}
            onStepChange={(i) => {
                // 모바일: 사이드바 단계(0~2)면 바텀시트 열고, 헤더 단계(3~4)면 닫아서 스포트라이트가 보이게
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                    setShowMobileSidebar(i <= 2);
                }
            }}
            onClose={() => { setRunTeacherTour(false); setShowMobileSidebar(false); try { localStorage.setItem('mathetf_qb_tour_seen', '1'); } catch {} }}
        />
        {/* [모바일] h-screen(100vh)은 iOS 주소창 높이를 포함해 하단 60~80px이 잘린다 → dvh. 미지원 브라우저는 h-screen 폴백 */}
        <div data-question-bank="true" className="flex flex-col h-screen bg-[#F7F9FC] overflow-hidden" style={{ height: process.env.NEXT_PUBLIC_LOCAL_PREVIEW === '1' ? 'calc(100dvh - 28px)' : '100dvh' }}>
            <Header
                user={user}
                purchasedPoints={purchasedPoints}
                earnedPoints={earnedPoints}
                onUploadClick={handleUploadClick}
            />

            <div className="workbench-title"><div><p>THE MATH STUDIO</p><h2>시험지 편집실</h2></div><div className="workbench-tabs" aria-label="편집 화면"><button aria-pressed={viewMode==='search'} onClick={()=>setViewMode('search')}>문항 찾기</button><button disabled={!cart.length} aria-pressed={viewMode==='review'} onClick={()=>{setViewMode('review');setShowMobileSidebar(false);}}>선택한 문항 {cart.length}</button></div></div>
            <div className="qb-context px-3 py-2 bg-white border-b text-xs shrink-0 flex flex-wrap gap-2 items-center"><a href="/guide" className="hover:text-brand-700">사용법·이용 범위 ↗</a><button className="hover:text-brand-700" onClick={()=>{setViewMode('search');setShowMobileSidebar(true);setRunTeacherTour(true);}}>화면 안내</button>{catalogNotice&&<details className="relative"><summary className="cursor-pointer">자료 안내</summary><p className="absolute top-6 left-0 z-40 w-60 rounded-xl border bg-white p-4 shadow-lg">{catalogNotice}</p></details>}<span>HML 저장 · 보관함 {savedCount}/{SAVED_EXAM_LIMIT}</span>{entryLabel&&<span role="status" className="text-brand-800">{entryLabel}</span>}{filterState?.mockSlug&&<button className="underline" onClick={()=>{setFilterState((f:any)=>f?{...f,mockSlug:undefined}:null);setFilterVersion(v=>v+1);setEntryLabel('자료 범위에서 검색');}}>모의고사 회차 제한 해제</button>}{entryFailure&&<button className="underline" onClick={()=>{setEntryFailure(false);setEntryLabel('전체 자료에서 검색');setFilterState(null);setFilterVersion(v=>v+1);}}>전체 검색으로 전환</button>}</div>
            <nav aria-label="출제 단계" className="md:hidden grid grid-cols-3 shrink-0 border-b bg-white text-xs"><button className="p-3" onClick={()=>setShowMobileSidebar(true)}>1. 범위 선택</button><button className="p-3" onClick={()=>{setViewMode('search');setShowMobileSidebar(false);}}>2. 문항 확인</button><button className="p-3" disabled={!cart.length} onClick={()=>{setViewMode('review');setShowMobileSidebar(false);}}>3. 완성 ({cart.length})</button></nav>
            <div className="flex flex-1 overflow-hidden relative">

                {/* 로그인 게이트 모달 - 비로그인 유저가 시험지 생성 클릭 시 */}
                {showLoginGate && <div role="dialog" aria-modal="true" aria-label="로그인 안내" className="product-modal fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-5" onClick={e=>{if(e.target===e.currentTarget)setShowLoginGate(false);}}><div className="w-full max-w-sm rounded-3xl bg-white p-8"><FileText size={30} className="text-brand-600 mb-5"/><h2 className="text-2xl font-bold">고른 문제를<br/>시험지로 간직하세요.</h2><p className="text-sm text-slate-500 leading-6 mt-4">로그인하면 저장하고 한글 파일로 받을 수 있습니다. 선택한 문항과 출제 조건은 이 브라우저에 보관됩니다.</p><a className="product-button primary w-full mt-7" href={questionBankLoginUrl()}>로그인하고 이어서 만들기</a><button className="product-button secondary w-full mt-2" onClick={()=>setShowLoginGate(false)}>계속 둘러보기</button></div></div>}

                {/* Storage Modal - Persistent Rendering for 0s Loading (visibility 전환으로 열림 애니메이션) */}
                <div className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-150 ${showStorageModal ? 'visible opacity-100' : 'invisible opacity-0 pointer-events-none'}`} aria-hidden={!showStorageModal}>
                    <div className={`bg-white w-full sm:max-w-5xl sm:mx-4 max-h-[90dvh] sm:h-[80vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-transform duration-200 ${showStorageModal ? 'translate-y-0 sm:scale-100' : 'translate-y-4 sm:scale-[0.98]'}`}>
                        <div className="px-4 py-3 border-b flex justify-between items-center bg-white">
                            <h3 className="font-extrabold text-lg flex items-center gap-2.5 text-[#1D2C45]">
                                {storageModalMode === 'db' ? (
                                    <><span className="w-9 h-9 rounded-xl bg-[#F0F5FF] border border-[#C9D9FF]/60 flex items-center justify-center"><Database size={18} className="text-[#285CE6]" /></span> 기출 자료 선택</>
                                ) : storageModalMode === 'exam' ? (
                                    <><span className="w-9 h-9 rounded-xl bg-[#EDF3FF] border border-[#285CE6]/40 flex items-center justify-center"><FolderIcon size={18} className="text-[#204BC3]" /></span> 만든 시험지 선택</>
                                ) : (
                                    <><span className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center"><FolderIcon size={18} className="text-slate-500" /></span> 내 보관함</>
                                )}
                            </h3>
                            <button onClick={() => setShowStorageModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden p-4 bg-slate-100 flex flex-col">
                            {!user && storageModalMode === 'exam' && (
                                /* 비로그인 '만든 시험지': 아직 만든 게 없음 — 안내 */
                                <div className="mb-3 px-4 py-3 bg-[#F0F5FF] border border-[#C9D9FF] rounded-xl text-sm text-[#3A5A82] break-keep shrink-0">
                                    시험지를 만들어 <strong>저장하면 이곳에 모여요.</strong> 저장에는 로그인이 필요해요.
                                </div>
                            )}
                            <div className="flex-1 min-h-0">
                            {!user && storageModalMode === 'db' ? <SourceCatalog
                                items={guestDbInitialData?.items || []}
                                selectedIds={selectedDbIds}
                                onItemSelect={handleStorageItemSelect}
                                onGroupSelect={(items, select) => {
                                    const ids = items.map(i => i.reference_id || i.id);
                                    setSelectedDbIds(prev => select ? [...new Set([...prev, ...ids])] : prev.filter(id => !ids.includes(id)));
                                }}
                                onGetViewItems={setCurrentExamItems}
                            /> : <FolderExplorer
                                // [비로그인] 전체 DB 카탈로그 주입 / [로그인] 프리페치 주입 → 열자마자 목록 표시
                                initialData={!user
                                    ? (storageModalMode === 'db' ? guestDbInitialData : undefined)
                                    : (storageModalMode === 'db' ? storagePrefetch.db : storageModalMode === 'exam' ? storagePrefetch.exam : undefined)}
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
                            />}
                            </div>
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
                                                        ? 'bg-[#285CE6] text-white border-[#3A6BA0] hover:bg-[#3A6BA0]'
                                                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                                }`}
                                            >
                                                <CheckSquare size={16} />
                                                {allSelected ? '전체 해제' : '전체 선택'}
                                                {selectedDbIds.length > 0 && (
                                                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${allSelected ? 'bg-white/30 text-white' : 'bg-[#285CE6] text-white'}`}>
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
                                            className="px-4 py-2 bg-brand-50 text-brand-700 font-bold rounded-lg hover:bg-brand-100 transition flex items-center gap-2 border border-brand-200"
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
                                        setShowStorageModal(false);
                                        const chosen = purchasedDbs.filter(db => selectedDbIds.includes(db.id));
                                        setEntryLabel(chosen.length === 1 ? chosen[0].title : chosen.length ? `선택한 자료 ${chosen.length}개` : '전체 자료에서 검색');
                                        setEntryFailure(false);
                                        if (filterState?.mockSlug) { setFilterState((f:any) => ({...f, mockSlug:undefined})); setFilterVersion(v => v + 1); }
                                        if (user) setShowDuplicateModal(true);
                                        else setExcludedQuestionIds([]);
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
                <div id="qb-filter-sidebar" className={`workbench-sidebar ${
                    viewMode === 'review'
                        ? 'hidden'
                        : showMobileSidebar
                            ? 'fixed bottom-0 left-0 right-0 z-50 bg-white border-t rounded-t-2xl shadow-2xl flex flex-col w-full max-h-[85dvh] md:relative md:bottom-auto md:z-20 md:border-t-0 md:border-r md:rounded-none md:shadow-none md:w-64 md:max-h-full'
                            : isFilterCollapsed
                                ? 'hidden'
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
                    <div data-tour="qb-pool" className="px-4 py-2.5 md:p-4 border-b space-y-2">
                        <h2 className="hidden md:block font-bold text-lg text-slate-800">출제 범위</h2>
                        {/* ... existing DB selectors ... */}
                        <div className="flex gap-2 mb-2">
                            {/* 비로그인도 열람 가능 (맛보기 — 게이트는 시험지 저장에서만) */}
                            <button
                                onClick={() => {
                                    setStorageModalMode('db');
                                    setShowStorageModal(true);
                                    setShowMobileSidebar(false);
                                }}
                                className="flex-1 py-2 md:py-3 px-3 bg-[#F0F5FF] text-[#285CE6] border border-[#C9D9FF] rounded-xl hover:bg-[#E5EDFF] flex items-center justify-center gap-2 font-bold text-sm transition-colors whitespace-nowrap"
                            >
                                <Database size={16} />
                                출제 자료
                            </button>
                            <button
                                onClick={() => {
                                    setStorageModalMode('exam');
                                    setShowStorageModal(true);
                                    setShowMobileSidebar(false);
                                }}
                                className="flex-1 py-2 md:py-3 px-3 bg-[#EDF3FF] text-[#204BC3] border border-[#285CE6]/40 rounded-xl hover:bg-[#C8F0EE] flex items-center justify-center gap-2 font-bold text-sm transition-colors whitespace-nowrap"
                            >
                                <FolderIcon size={16} />
                                만든 시험지
                            </button>
                        </div>
                        {!user && (
                            /* 비로그인: 전체 DB 자동 선택 안내 (한 줄) */
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                {!isDbInitialized ? '자료 목록을 불러오는 중…' : selectedDbIds.length > 0 ? `선택한 자료 ${selectedDbIds.length}개에서 검색` : `자료 미선택 · 전체 ${purchasedDbs.length}개에서 검색`}
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
                                key={(draftReady ? 'restored' : 'loading')+filterVersion}
                                initialFilters={filterState}
                                dbFilter={null}
                                selectedDbIds={selectedDbIds}
                                purchasedDbs={purchasedDbs}
                                onFilterChange={(filters) => {
                                    if (draftReady) setFilterState(filters);
                                }}
                            />
                        </div>
                        <div className="p-4 border-t bg-[#F7F9FC]">
                            <button
                                data-tour="qb-search"
                                onClick={() => {
                                    handleSearch();
                                    setShowMobileSidebar(false);
                                    setShowStorageModal(false);
                                }}
                                className="w-full py-3 bg-[#285CE6] text-white font-bold rounded-xl shadow-md hover:bg-[#204BC3] transition flex items-center justify-center gap-2"
                            >
                                <span>조건 검색하기</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main List Area */}
                <div ref={mainScrollRef} id="main-scroll" className="flex-1 overflow-y-auto overflow-x-hidden relative">
                    {user&&<details className="m-3 rounded-xl bg-white border p-3" open={recentOpen} onToggle={e=>setRecentOpen(e.currentTarget.open)}><summary className="cursor-pointer text-sm">최근 시험지 · 수정·재출제</summary><RecentExams refresh={storageRefreshKey} onRestore={restoreRecent} onCount={setSavedCount}/></details>}

                    {viewMode === 'search' ? (
                        <header className="sticky top-0 z-10 flex justify-between items-center px-3 sm:px-6 py-2 sm:py-4 bg-white/90 backdrop-blur-sm border-b border-[#C9D9FF]/60 shadow-sm">
                            <div className="flex items-center gap-2 min-w-0">
                                <button
                                    className="md:hidden flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 flex-shrink-0"
                                    onClick={() => setShowMobileSidebar(true)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="10" y2="18"/></svg>
                                    필터
                                </button>
                                <button
                                    ref={desktopFilterToggleRef}
                                    type="button"
                                    className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 flex-shrink-0"
                                    aria-controls="qb-filter-sidebar"
                                    aria-expanded={!isFilterCollapsed}
                                    onClick={() => setIsFilterCollapsed(value => !value)}
                                >
                                    {isFilterCollapsed ? '조건 펼치기' : '조건 접기'}
                                </button>
                                {/* 화면 제목은 h2 — 이 페이지의 h1 은 layout.tsx 의 sr-only 하나뿐이다.
                                    전체화면 툴이라 화면에 본문이 없어 크롤러·스크린리더용 h1 을 layout 에 뒀는데,
                                    여기까지 h1 이면 한 페이지에 h1 이 둘이 된다(2026-09-03 전수검사에서 확인). */}
                                <h2 className="hidden sm:block sm:text-2xl font-bold text-gray-800 truncate">
                                    {selectedDbIds.length > 0 ? '문항 고르기' : '전체 문제 검색'}
                                </h2>
                            </div>
                            <div className="flex gap-1.5 sm:gap-2 items-center">
                                {/* 카드 크기(열 수) 토글 — lg 이상에서만 의미 있음 */}
                                <div className="hidden lg:flex items-center border border-slate-200 rounded-lg overflow-hidden text-xs font-bold">
                                    <button
                                        onClick={() => changeSearchCols(3)}
                                        title="카드 크게 (3열)"
                                        className={`px-2.5 py-2 transition-colors ${searchCols === 3 ? 'bg-[#285CE6] text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
                                    >
                                        크게
                                    </button>
                                    <button
                                        onClick={() => changeSearchCols(4)}
                                        title="카드 작게 (4열)"
                                        className={`px-2.5 py-2 transition-colors ${searchCols === 4 ? 'bg-[#285CE6] text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
                                    >
                                        작게
                                    </button>
                                </div>
                                {questions.length > 0 && (
                                    <button
                                        onClick={handleSelectAllToggle}
                                        className="border border-[#C9D9FF] text-[#285CE6] px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-[#F0F5FF] shadow-sm transition font-bold text-xs sm:text-sm whitespace-nowrap"
                                    >
                                        {questions.every(q => q && cartIdSet.has(q.id)) ? '전체 해제' : '전체 선택'}
                                    </button>
                                )}
                                <button
                                    data-tour="qb-generate"
                                    onClick={handleGenerate}
                                    disabled={cart.length === 0 || isGenerating}
                                    className="bg-[#285CE6] disabled:bg-slate-300 text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-[#204BC3] shadow-sm transition font-bold flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                                >
                                    <span className="hidden sm:inline">시험지 생성 ({cart.length}/{MAX_CART_SIZE})</span>
                                    <span className="sm:hidden">생성 ({cart.length})</span>
                                </button>
                                <button
                                    data-tour="qb-auto"
                                    onClick={() => {
                                        // 장바구니가 이미 꽉 찼으면 '최대 1문제' 짜리 모달이 열려 혼란만 준다
                                        if (cart.length >= MAX_CART_SIZE) {
                                            showToast(`장바구니가 이미 ${MAX_CART_SIZE}문제로 가득 찼습니다. 빼고 다시 시도해주세요.`, 'info');
                                            return;
                                        }
                                        setShowAutoModal(true);
                                    }}
                                    className="bg-[#285CE6] text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-[#204BC3] shadow-sm transition font-bold whitespace-nowrap text-xs sm:text-sm"
                                >
                                    자동 출제
                                </button>
                            </div>
                        </header>
                    ) : (
                        <header className="sticky top-0 z-10 flex flex-col gap-2 sm:gap-4 px-3 sm:px-6 py-2 sm:py-4 bg-white/90 backdrop-blur-sm border-b border-[#C9D9FF]/60 shadow-sm">
                            {/* 모바일: 컴팩트 단일 행 / 데스크탑: 2행 */}
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div className="min-w-0">
                                    <h2 className="text-base sm:text-2xl font-black text-slate-800 whitespace-nowrap">시험지 문항 검토</h2>
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
                                        onClick={() => { if (!draftReady) return; if (!user) { setShowLoginGate(true); return; } setShowConfigModal(true); }}
                                        className="px-3 sm:px-8 py-2 sm:py-2.5 bg-[#285CE6] text-white rounded-xl font-bold hover:bg-[#204BC3] shadow-lg shadow-[#285CE6]/20 transition-all text-xs sm:text-sm whitespace-nowrap"
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
                                                className="text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200 rounded-lg px-2 py-1.5 outline-none cursor-pointer hover:bg-brand-100 transition-colors"
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
                                            className="px-2 py-1 rounded-lg text-xs font-bold text-slate-400 border border-dashed border-slate-200 hover:border-brand-300 hover:text-brand-500 transition-all"
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
                                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#285CE6] text-white hover:bg-[#204BC3] disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap flex-shrink-0"
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
                        /* 검색 로딩: 문제 카드 모양 스켈레톤 (스피너보다 체감 빠름) */
                        <div className={`grid grid-cols-1 md:grid-cols-2 ${searchCols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-6 px-6 pt-6 pb-10 animate-pulse`} aria-label="문제 검색 중">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-2.5">
                                    <div className="flex justify-between">
                                        <div className="h-3 w-16 bg-slate-200 rounded" />
                                        <div className="h-3 w-10 bg-slate-100 rounded" />
                                    </div>
                                    <div className="h-3.5 bg-slate-200 rounded w-11/12" />
                                    <div className="h-3.5 bg-slate-200 rounded w-4/5" />
                                    <div className="h-4 bg-slate-100 rounded w-1/2 mx-auto my-2" />
                                    <div className="flex gap-3 pt-1">
                                        <div className="h-3 bg-slate-100 rounded w-10" />
                                        <div className="h-3 bg-slate-100 rounded w-10" />
                                        <div className="h-3 bg-slate-100 rounded w-10" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <>
                            <div className={`grid grid-cols-1 md:grid-cols-2 ${viewMode === 'review' ? 'lg:grid-cols-3 xl:grid-cols-4' : (searchCols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4')} gap-6 px-6 pt-6 pb-10 animate-in fade-in duration-500`}>
                                {(viewMode === 'search' ? questions : cart).length > 0 ? (viewMode === 'search' ? questions : cart).map((q, idx) => {
                                    const inCart = q && cartIdSet.has(q.id);
                                return (
                                    <div
                                        key={`${viewMode}-${q.id}`}
                                        role="checkbox"
                                        tabIndex={0}
                                        aria-label={`${idx+1}번 문항 ${viewMode==='search'?'담기':'선택'}`}
                                        aria-checked={viewMode==='search'?inCart:selectedReviewIds.has(q.id)}
                                        onClick={(e) => {
                                            if ((e.target as HTMLElement).closest('button,a,input,label')) return;
                                            if(viewMode==='search')toggleCart(q);
                                            else setSelectedReviewIds(prev=>{const next=new Set(prev);next.has(q.id)?next.delete(q.id):next.add(q.id);return next;});
                                        }}
                                        onKeyDown={(e) => {
                                            if(e.target!==e.currentTarget||!['Enter',' '].includes(e.key))return;
                                            e.preventDefault();
                                            if(viewMode==='search')toggleCart(q);
                                            else setSelectedReviewIds(prev=>{const next=new Set(prev);next.has(q.id)?next.delete(q.id):next.add(q.id);return next;});
                                        }}

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
                                        className={`qb-card relative h-[300px] rounded-2xl shadow-sm border transition flex flex-col overflow-hidden group
                                            ${viewMode === 'review'
                                                ? draggingIndex === idx
                                                    ? 'opacity-40 scale-95 border-[#285CE6] border-dashed'
                                                    : selectedReviewIds.has(q.id)
                                                        ? 'bg-[#EDF3FF] border-[#285CE6] ring-2 ring-[#285CE6] cursor-move hover:shadow-md'
                                                        : 'bg-white border-slate-200 cursor-move hover:border-[#C9D9FF] hover:shadow-md'
                                                : inCart ? 'bg-[#F0F5FF] border-[#285CE6] ring-2 ring-[#285CE6] shadow-md cursor-pointer' : 'bg-white hover:shadow-lg border-gray-200 cursor-pointer'}
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
                                                            ? 'bg-[#285CE6] text-white ring-2 ring-[#285CE6]/50'
                                                            : viewMode === 'review' ? 'bg-[#285CE6] text-white hover:bg-[#285CE6]' : 'bg-slate-200 text-slate-500'
                                                        }`}
                                                    title={viewMode === 'review' && !q._similarOf ? '클릭하여 선택' : ''}
                                                >
                                                    {(viewMode==='search'?inCart:selectedReviewIds.has(q.id)) ? '✓' : idx + 1}
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
                                                <span className="bg-[#F0F5FF] text-[#285CE6] text-xs px-2 py-0.5 rounded-md font-bold">
                                                    {q.unit || '단원 미정'}
                                                </span>
                                                {/* [교과외] 현행 교육과정에서 삭제된 단원 — 시험지에 담기 전에 눈에 띄어야 함 */}
                                                {q.is_off_curriculum && (
                                                    <span
                                                        title="현행 교육과정에서 삭제된 단원입니다"
                                                        className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-md font-bold border border-amber-200"
                                                    >
                                                        교과외
                                                    </span>
                                                )}
                                                <span className="text-[11px] font-bold text-gray-500">
                                                    {q.year && `${q.year}년 `}{q.grade && `${q.grade} `}{q.semester && `${q.semester}`}{examFormLabel(q.source_db_id)} 원본 {q.question_number}번
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {/* [수업 사다리] 이 문항을 가르치기 전에 시킬 쉬운 문항부터 3단으로 담는다.
                                                    난이도 5 이상에서만 의미가 있다(그 아래는 내려갈 계단이 없다). */}
                                                {Number(q.difficulty) >= 5 && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); if (!user) { setShowLoginGate(true); return; } void buildLadder(q); }}
                                                        className="px-2 py-1 bg-[#285CE6] hover:bg-[#204BC3] text-white rounded-md shadow-sm transition-all flex items-center gap-1 whitespace-nowrap"
                                                        title="이 문항까지 올라가는 3단 사다리(기초→유형→목표)를 담습니다"
                                                    >
                                                        <span className="text-[10px] font-bold">사다리</span>
                                                    </button>
                                                )}
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
                                                        aria-label={`${idx+1}번 문항 삭제`} onClick={(e) => { e.stopPropagation(); toggleCart(q); }}
                                                        className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-md transition-all"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

 {/* Content */}
                                        <div className="p-3 bg-white flex-1 min-h-0 overflow-y-auto scrollbar-thin">
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
                                                    loadError={q.imageLoadError}
                                                    onRetry={() => retryQuestionImages(q.id)}
                                                    displayMode="question"
                                                    showDownloadAction={false}
                                                    className="border-none shadow-none !p-0 !text-base"
                                                />
                                            )}
                                        </div>

                                        {/* Meta/Actions Footer */}
                                        <div className="px-4 py-3 bg-white border-t flex flex-wrap gap-2 items-center justify-between">
                                            <div className="text-[12px] sm:text-[10px] text-slate-400 font-medium truncate flex-1 pr-2">
                                                {q.school} {q.year||q.exam_year}
                                            </div>
                                            {/* [모바일 ②] 순서 이동 — 헤더에 두면 390px 에서 뱃지가 줄바꿈되어 푸터(검토 모드엔 비어 있음)에 둔다. 데스크톱은 드래그. */}
                                            {viewMode === 'review' && (
                                                <div className="flex items-center gap-1.5 md:hidden" data-no-drag="true">
                                                    <button onClick={(e) => { e.stopPropagation(); moveInCart(idx, -1); }} disabled={idx === 0} aria-label="위로" className="w-10 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 disabled:opacity-30 flex items-center justify-center active:bg-slate-100"><ChevronUp size={16} /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); moveInCart(idx, 1); }} disabled={idx === cart.length - 1} aria-label="아래로" className="w-10 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 disabled:opacity-30 flex items-center justify-center active:bg-slate-100"><ChevronDown size={16} /></button>
                                                </div>
                                            )}
                                            <button aria-label={`${idx+1}번 문항 상세보기`} className="question-action" onClick={e=>{e.stopPropagation();setZoomQuestion(q);}}><FileText size={14} aria-hidden="true"/>상세보기</button>
                                            {viewMode === 'search' && (
                                                <div className="flex items-center gap-2 transition-opacity">
                                                    <button
                                                        className="question-action"
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
                                            <p className="text-sm text-slate-400">필터 조건을 조정하거나 다른 출제 자료를 선택해보세요.</p>
                                        </div>
                                    ) : selectedDbIds.length > 0 ? (
                                        /* DB 선택됨, 아직 검색 안 함 */
                                        <div className="flex flex-col gap-4">
                                        {/* [퍼널 2026-09-13] 받아간 회차가 있으면 그것부터. 이 화면에서 39%가
                                                아무것도 누르지 않고 나갔는데, 그중 대부분이 무료PDF 를 받아본 사람이었다.
                                                고를 것을 주는 대신, 이미 고른 것을 되돌려준다. */}
                                            {resumeItem && (
                                                <div className="rounded-2xl border-2 border-[#204BC3]/40 bg-[#F2FBFA] p-4 flex flex-wrap items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-[11px] font-black text-[#2A8C89] tracking-wide">직전에 받아가신 회차예요</p>
                                                        <p className="font-extrabold text-[#1D2C45] mt-1 break-keep">{resumeItem.label}</p>
                                                        <p className="text-xs text-slate-500 mt-0.5">{resumeItem.count}문항 · 담은 뒤 빼거나 더 채우실 수 있어요</p>
                                                    </div>
                                                    <button
                                                        disabled={resumeBusy}
                                                        onClick={async () => {
                                                            if (resumeBusy) return;
                                                            setResumeBusy(true);
                                                            try {
                                                                const n = await fillFromSrc(resumeItem.src, 'resume:{n}');
                                                                if (!n) showToast('이 회차 문항을 불러오지 못했어요. 검색으로 골라주세요.', 'info');
                                                            } catch {
                                                                showToast('불러오지 못했어요. 잠시 후 다시 눌러주세요.', 'info');
                                                            }
                                                            setResumeBusy(false);
                                                        }}
                                                        className="shrink-0 px-5 py-3 bg-[#204BC3] hover:bg-[#2A8C89] disabled:opacity-60 text-white font-black rounded-xl shadow-sm transition-colors active:scale-95"
                                                    >
                                                        {resumeBusy ? '담는 중…' : '이 회차로 시작하기 →'}
                                                    </button>
                                                </div>
                                            )}
                                        <div className="text-center py-20 bg-white rounded-2xl border border-dashed flex flex-col items-center justify-center gap-3">
                                            <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center">
                                                <Search size={24} className="text-brand-500" />
                                            </div>
                                            <p className="text-base font-semibold text-slate-600"><span className="hidden md:inline">왼쪽 필터 조건 설정 후 </span><span className="md:hidden">위 「필터」에서 조건을 고른 뒤 </span><span className="text-brand-600">「조건 검색하기」</span>를 눌러주세요.</p>
                                            {/* [모바일] 폰에는 "왼쪽 필터"가 없다 — 시트를 여는 버튼을 바로 준다 (9/7 모바일 감사 ④) */}
                                            <button onClick={() => setShowMobileSidebar(true)} className="md:hidden mt-3 inline-flex items-center gap-2 px-5 py-3 bg-[#285CE6] text-white font-bold rounded-xl shadow-md active:scale-95 transition">필터 열기</button>
                                            <p className="text-sm text-slate-400">단원, 난이도, 키워드를 조합해 원하는 문제를 찾을 수 있어요.</p>
                                            {/* [퍼널] 이 화면은 수동 경로만 안내하고 있었다. 같은 화면 상단에 한 번에 채워주는
                                                '자동생성' 버튼이 이미 있는데 처음 온 사람은 그걸 쓸 생각을 못 한다.
                                                (프리셋을 새로 만들기 전에, 있는 길부터 안내한다 — qb_autogen 로그로 효과를 본다) */}
                                            <button
                                                onClick={() => {
                                                    if (cart.length >= MAX_CART_SIZE) {
                                                        showToast(`장바구니가 이미 ${MAX_CART_SIZE}문제로 가득 찼습니다.`, 'info');
                                                        return;
                                                    }
                                                    setShowAutoModal(true);
                                                }}
                                                className="mt-2 bg-[#285CE6] hover:bg-[#204BC3] text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-colors"
                                            >
                                                고르기 어렵다면 — 단원·난이도만 정하고 자동생성 →
                                            </button>
                                        </div>
                                        </div>
                                    ) : !isDbInitialized ? (
                                        /* DB 초기 로딩 중 - 가이드 깜빡임 방지 (스켈레톤) */
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 px-6 pt-6 pb-10 animate-pulse" aria-label="문제 풀 준비 중">
                                            {Array.from({ length: 4 }).map((_, i) => (
                                                <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-2.5">
                                                    <div className="h-3 w-16 bg-slate-200 rounded" />
                                                    <div className="h-3.5 bg-slate-200 rounded w-11/12" />
                                                    <div className="h-3.5 bg-slate-200 rounded w-4/5" />
                                                    <div className="h-4 bg-slate-100 rounded w-1/2 mx-auto my-2" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="workbench-start"><div><p className="suite-eyebrow">A PAGE OF POSSIBILITIES</p><h2>어떤 문제로<br/>시작할까요?</h2><p>범위를 고르고, 마음에 드는 문항을 눌러 담으세요.<br/>선택한 문제들이 나만의 시험지가 됩니다.</p><div className="workbench-start-actions"><a className="suite-button" href="/question-bank?demo=1&origin=question-bank">기출 5문항으로 시작 →</a><button className="suite-button secondary" onClick={()=>{setStorageModalMode('db');setShowStorageModal(true);setShowMobileSidebar(false);}}>내 시험지 불러오기</button></div><a href="/guide">시험지 만들기 가이드 ↗</a></div><div className="workbench-empty-paper" aria-hidden="true"><span>MY WORKSHEET / MATH ETF</span><strong>나의 수학 시험지</strong><div/><div/><div/><small>좋은 문제를 고르는 일부터,<br/>새로운 배움이 시작됩니다.</small></div></div>
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




                {zoomQuestion&&<div role="dialog" aria-modal="true" aria-label="문항 상세보기" className="fixed inset-0 z-[150] bg-black/60 p-3 flex items-center justify-center" onClick={e=>{if(e.target===e.currentTarget)setZoomQuestion(null);}}><div className="bg-white rounded-xl p-4 max-w-3xl w-full max-h-[90dvh] overflow-auto"><button autoFocus className="sticky top-0 ml-auto block p-3 bg-white border rounded-lg" onClick={()=>setZoomQuestion(null)}>상세보기 닫기</button><QuestionRenderer xmlContent={zoomQuestion.content_xml} externalImages={zoomQuestion.question_images} displayMode="question" showDownloadAction={false}/></div></div>}
                {savedExam && (
                    <div role="dialog" aria-modal="true" aria-labelledby="saved-exam-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
                        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                            <h2 id="saved-exam-title" className="text-xl font-bold text-slate-800">시험지가 완성되었습니다</h2>
                            <p className="mt-3 break-words text-slate-600">{savedExam.name}</p><p className="mt-2 text-sm text-slate-500">{savedExam.count}문항 · {formatFileSize(savedExam.bytes)}</p>{(savedExam.bytes||0)>20*1024*1024&&<p className="text-sm text-amber-800">큰 파일입니다. 모바일에서는 안정적인 연결에서 받아주세요.</p>}
                            <p className="mt-2 text-sm text-slate-500">한글에서 열어 편집할 수 있는 HML 파일입니다. PDF가 필요하면 한글에서 PDF로 저장해주세요.</p>
                            <a className="mt-5 block rounded-xl bg-[#285CE6] p-3 text-center font-bold text-white" href={`/api/storage/download?id=${savedExam.id}`} download onClick={() => window.setTimeout(() => setSavedExam(null), 400)}>시험지 파일 받기 (.hml)</a>
                            <button className="mt-3 w-full rounded-xl border p-3 text-slate-700" onClick={() => setSavedExam(null)}>계속 출제하기</button>
                        </div>
                    </div>
                )}
                {showConfigModal && (
                    <ConfigModal
                        onDraftChange={(title,qpc)=>{setExamTitle(title);setQuestionsPerColumn(qpc);}}
                        initialTitle={examTitle}
                        initialQuestionsPerColumn={questionsPerColumn}
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
                        initialFilters={regenerateItem?.filters||filterState}
                        onClose={() => {setShowAutoModal(false);setRegenerateItem(null);}}
                        selectedDbs={purchasedDbs.filter(db => (regenerateItem?.dbIds||selectedDbIds).includes(db.id))}
                        excludedQuestionIds={regenerateItem?regenerateItem.ids:[...excludedQuestionIds, ...cart.map(q => q.id)]}
                        includeOffCurriculum={(regenerateItem?.filters||filterState)?.includeOffCurriculum === true}
                        maxCount={regenerateItem?MAX_CART_SIZE:Math.max(0, MAX_CART_SIZE - cart.length)}
                        sourceName={regenerateItem?.name}
                        initialCount={regenerateItem?.ids.length}
                        ignoreSavedDraft={!!regenerateItem}
                        onGenerate={(newQuestions,notice) => {
                            setRecentOpen(false);
                            if(regenerateItem){setSelectedDbIds(regenerateItem.dbIds);setFilterState(regenerateItem.filters);setFilterVersion(v=>v+1);setQuestionsPerColumn(regenerateItem.questionsPerColumn);setExamTitle(`${regenerateItem.name} 재출제`.slice(0,100));setEntryLabel(`${regenerateItem.name}과 같은 범위 · 이전 ${regenerateItem.ids.length}문항 제외`);setEntryFailure(false);setExcludedQuestionIds(regenerateItem.ids);setCart(newQuestions);setRegenerateItem(null);setViewMode('review');showToast(notice||`이전 문항과 겹치지 않는 ${newQuestions.length}문항을 담았습니다.`);return;}
                            // [퍼널] 자동생성이 실제로 쓰이는지 기록이 없었다.
                            // '프리셋 10문항 원클릭' 을 새로 만들지 말지는 이 수를 보고 정한다 —
                            // 이미 '단원·난이도만 정하면 채워주는' 기능이 여기 있는데 안 쓰이는 것인지,
                            // 아예 이 버튼까지 못 오는 것인지 구분이 안 된다.
                            logQb('qb_autogen', `q:${newQuestions.length}`);
                            // 자동생성만 상한 없이 합치고 있었다. 장바구니 42개 + 생성 50개 = 92개가 되고,
                            // 저장 버튼을 눌러야 서버가 거절해 고른 것이 통째로 날아갔다(8/29 실패 1건).
                            const newIds = new Set(newQuestions.map((q: any) => q.id));
                            const existing = cart.filter(c => !newIds.has(c.id));
                            const room = MAX_CART_SIZE - existing.length;
                            const kept = newQuestions.slice(0, Math.max(0, room));
                            const dropped = newQuestions.length - kept.length;
                            setCart([...existing, ...kept]);
                            if (dropped > 0) {
                                showToast(`한 시험지 최대 ${MAX_CART_SIZE}문제라 ${kept.length}개만 담았습니다. (${dropped}개 제외)`, 'info');
                            }
                            setViewMode('review');showToast(notice||`${kept.length}문항을 담았습니다. 문항을 확인한 뒤 저장하세요.`);
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
