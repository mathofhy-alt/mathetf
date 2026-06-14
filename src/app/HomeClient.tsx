"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { FileItem } from '../lib/data';
import { FileText, Download, X, User as UserIcon, ChevronRight, Info, List, ShoppingCart, AlertTriangle, Search } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HeroBanner from '@/components/HeroBanner';
import SimilarDemo from '@/components/SimilarDemo';
import RoleOnboardingModal from '@/components/RoleOnboardingModal';
import LaunchPromoModal from '@/components/LaunchPromoModal';
import GuidedTour, { TourStep } from '@/components/GuidedTour';

// 학생·학부모 홈 투어 단계
const STUDENT_TOUR_STEPS: TourStep[] = [
    {
        target: '[data-tour="search-filter"]',
        title: '① 기출 검색',
        body: '시/도·학교·학년·시험으로 원하는 기출 시험지를 찾을 수 있어요. 시/도부터 선택해 보세요.',
        advanceOn: 'click',
        placement: 'bottom',
    },
    {
        target: '[data-tour="exam-card"]',
        title: '② 자료 고르기',
        body: '검색 결과(또는 아래 목록)에서 원하는 학교·시험의 자료를 고르세요.',
        advanceOn: 'click',
        placement: 'top',
    },
    {
        target: '[data-tour="pdf-download"]',
        title: '③ PDF 받기',
        body: '문제와 해설이 담긴 PDF는 여기서 받아요. (로그인 후 이용)',
        advanceOn: 'click',
        placement: 'left',
    },
];
import RightSidebar from '@/components/RightSidebar';
import { PdfFileIcon, HwpFileIcon, DbFileIcon } from '@/components/FileIcons';
import Header from '@/components/Header';
import { useCart } from '@/components/providers/CartProvider';
import dynamic from 'next/dynamic';

const UploadModal = dynamic(() => import('@/components/UploadModal'), { ssr: false });
const ReportModal = dynamic(() => import('@/components/ReportModal'), { ssr: false });

interface HomeClientProps {
    initialExamData: any[];
    initialSchoolsRaw: any[];
    initialUser: any | null;
    isAdmin: boolean;
}

export default function HomeClient({ initialExamData, initialSchoolsRaw, initialUser, isAdmin }: HomeClientProps) {
    interface GroupedExam {
        key: string;
        title: string;
        school: string;
        grade: number;
        semester: number;
        subject: string;
        uploader: string;
        date: string;
        sales: number;
        isVerified?: boolean;
        examType: string; // Added for filtering
        files: {
            pdfProb?: FileItem;
            pdfSol?: FileItem;
            hwpProb?: FileItem;
            hwpSol?: FileItem;
            db?: FileItem; // Added Personal DB
            raw?: FileItem; // Added Original Raw Scan
        };
    }

    const [groupedFiles, setGroupedFiles] = useState<GroupedExam[]>([]);
    const [runStudentTour, setRunStudentTour] = useState(false);

    const [files, setFiles] = useState<FileItem[]>([]);
    const [selectedRegion, setSelectedRegion] = useState('');
    const [selectedDistrict, setSelectedDistrict] = useState('');
    const [selectedSchool, setSelectedSchool] = useState('');
    const [selectedGrade, setSelectedGrade] = useState('');
    const [selectedExamScope, setSelectedExamScope] = useState(''); // Combined Semester + ExamType
    const [selectedYear, setSelectedYear] = useState('');
    const [searchKeyword, setSearchKeyword] = useState(''); // Search State

    // Points State
    // Points State (Separated)
    const [purchasedPoints, setPurchasedPoints] = useState<number>(0);
    const [earnedPoints, setEarnedPoints] = useState<number>(0);

    // Dynamic School Data State
    const [regions, setRegions] = useState<string[]>([]);
    const [districtsMap, setDistrictsMap] = useState<Record<string, string[]>>({});
    const [schoolsMap, setSchoolsMap] = useState<Record<string, Record<string, string[]>>>({});
    const [isLoadingSchools, setIsLoadingSchools] = useState(true);
    const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());

    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [showLoginPrompt, setShowLoginPrompt] = useState(false);
    const [selectedExamForReport, setSelectedExamForReport] = useState<{key: string, title: string} | null>(null);
    const [user, setUser] = useState<User | null>(initialUser);
    const router = useRouter();
    const supabase = createClient();
    const { addToCart, items: cartItems } = useCart();
    // useMemo: cartItems가 바뀔 때만 Set 재생성 (기존: 매 렌더마다 new Set)
    const cartItemIds = useMemo(() => new Set(cartItems.map((item) => item.item_id)), [cartItems]);

    const [selectedDbForDetail, setSelectedDbForDetail] = useState<FileItem | null>(null);
    const [dbDetails, setDbDetails] = useState<any[]>([]);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);

    // Derived Data
    const districts = selectedRegion ? districtsMap[selectedRegion] || [] : [];
    const schools = (selectedRegion && selectedDistrict) ? schoolsMap[selectedRegion]?.[selectedDistrict] || [] : [];

    // useMemo: 필터 조건이나 groupedFiles가 바뀔 때만 재계산 (기존: 매 렌더마다 filter 실행)
    const filteredFiles = useMemo(() => groupedFiles.filter(group => {
        // 0. Keyword Search
        if (searchKeyword) {
            const keyword = searchKeyword.toLowerCase();
            const matchSchool = group.school.toLowerCase().includes(keyword);
            const matchTitle = group.title.toLowerCase().includes(keyword);
            if (!matchSchool && !matchTitle) return false;
        }

        // 1. Region Filter
        if (selectedRegion) {
            const firstFile = group.files.pdfProb || group.files.pdfSol || group.files.hwpProb || group.files.hwpSol || group.files.db;
            if (firstFile && firstFile.region !== selectedRegion) return false;
        }
        // 2. District Filter
        if (selectedDistrict) {
            const firstFile = group.files.pdfProb || group.files.pdfSol || group.files.hwpProb || group.files.hwpSol || group.files.db;
            if (firstFile && firstFile.district !== selectedDistrict) return false;
        }
        // 3. School Filter
        if (selectedSchool && group.school !== selectedSchool) return false;

        // 4. Grade Filter
        if (selectedGrade && group.grade !== Number(selectedGrade)) return false;

        // 5. Year Filter
        if (selectedYear) {
            const year = group.key.split('-')[1];
            if (String(year) !== String(selectedYear)) return false;
        }

        // 6. Exam Scope Filter (Semester + ExamType)
        if (selectedExamScope) {
            const [sem, type] = selectedExamScope.split('-');
            if (group.semester !== Number(sem)) return false;

            const groupExamType = group.key.split('-')[4];
            if (groupExamType !== type) return false;
        }

        return true;
    }), [groupedFiles, searchKeyword, selectedRegion, selectedDistrict, selectedSchool, selectedGrade, selectedYear, selectedExamScope]);

    const fetchMyPoints = async (userId: string) => {
        const { data, error } = await supabase.from('profiles').select('purchased_points, earned_points').eq('id', userId).single();
        if (data) {
            setPurchasedPoints(data.purchased_points || 0);
            setEarnedPoints(data.earned_points || 0);
        }

        // Fetch purchased exams to distinguish in UI
        const { data: purchaseData } = await supabase
            .from('purchased_items')
            .select('item_id')
            .eq('user_id', userId);

        if (purchaseData) {
            setPurchasedIds(new Set(purchaseData.map(p => p.item_id)));
        }
    };

    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            if (user) fetchMyPoints(user.id);
        };

        const initSchoolData = () => {
            if (initialSchoolsRaw.length > 0) {
                const data = initialSchoolsRaw;
                const newRegions = new Set<string>();
                const newDistricts: Record<string, Set<string>> = {};
                const newSchools: Record<string, Record<string, string[]>> = {};

                data.forEach(item => {
                    newRegions.add(item.region);

                    if (!newDistricts[item.region]) newDistricts[item.region] = new Set();
                    newDistricts[item.region].add(item.district);

                    if (!newSchools[item.region]) newSchools[item.region] = {};
                    if (!newSchools[item.region][item.district]) newSchools[item.region][item.district] = [];
                    newSchools[item.region][item.district].push(item.name);
                });

                setRegions(Array.from(newRegions).sort());

                const finalDistricts: Record<string, string[]> = {};
                Object.keys(newDistricts).forEach(r => {
                    finalDistricts[r] = Array.from(newDistricts[r]).sort();
                });
                setDistrictsMap(finalDistricts);

                // Sort schools
                Object.keys(newSchools).forEach(r => {
                    Object.keys(newSchools[r]).forEach(d => {
                        newSchools[r][d].sort();
                    });
                });
                setSchoolsMap(newSchools);
            }
            setIsLoadingSchools(false);
        };

        const initFiles = () => {
            const data = initialExamData;
            if (data) {
                const groups: { [key: string]: GroupedExam } = {};

                // 무료 시험(모의고사·수능·사관학교/경찰대 입학시험·전국연합)은 홈 카탈로그에 노출하지 않음
                // (이들은 시험지 출제 탭에서 무료 DB로만 제공)
                const FREE_EXAM_SCHOOLS = ['전국연합', '사관학교', '경찰대학교', '육군사관학교', '해군사관학교', '공군사관학교', '국군간호사관학교'];
                const isMockExam = (item: any) =>
                    item.exam_type === '모의고사' || item.exam_type === '수능' || item.exam_type === '입학시험'
                    || FREE_EXAM_SCHOOLS.includes(item.school)
                    || item.title?.includes('모의고사');
                
                const filteredData = isAdmin 
                    ? data.filter((item: any) => !isMockExam(item)) 
                    : data.filter((item: any) => item.content_type !== '원본제보' && !isMockExam(item));

                filteredData.forEach((item: any) => {
                    // Include subject in the key to differentiate exams
                    const subjectKey = item.subject || 'Unknown';
                    // [V105] Prioritize title regex for year to fix 2024/2025 discrepancy
                    const titleYear = item.title?.match(/20\d{2}/)?.[0];
                    const yearDerived = titleYear ? parseInt(titleYear) : (item.exam_year || 2024);

                    const key = `${item.school}-${yearDerived}-${item.grade}-${item.semester}-${item.exam_type}-${subjectKey}`;

                    if (!groups[key]) {
                        const isMockOpt = item.exam_type === '모의고사' || item.exam_type === '수능';
                        const semLabel = isMockOpt ? `${item.semester}월` : `${item.semester}학기`;
                        groups[key] = {
                            key,
                            title: `[${item.school}] ${yearDerived}년 ${item.grade}학년 ${semLabel} ${item.exam_type} ${item.subject || ''}`,
                            school: item.school,
                            grade: item.grade,
                            semester: item.semester,
                            subject: item.subject || '',
                            uploader: item.uploader_name || 'Anonymous',
                            date: new Date(item.created_at).toISOString().split('T')[0],
                            sales: 0,
                            examType: item.exam_type, // Added to match interface
                            isVerified: item.is_verified || false,
                            files: {}
                        };
                    }

                    if (item.is_verified) {
                        groups[key].isVerified = true;
                    }

                    const fileItem: FileItem = {
                        id: item.id,
                        title: item.title,
                        type: item.file_type,
                        price: item.price,
                        uploader: item.uploader_name || 'Anonymous',
                        uploaderId: item.uploader_id, // Added
                        date: new Date(item.created_at).toISOString().split('T')[0],
                        school: item.school,
                        grade: item.grade,
                        sales: item.sales_count,
                        region: item.region,
                        district: item.district,
                        year: titleYear ? parseInt(titleYear) : (item.exam_year || 2024),
                        semester: item.semester,
                        examType: item.exam_type,
                        filePath: item.file_path, // Added
                        contentType: item.content_type, // Added
                        subject: item.subject || '' // Add subject here
                    };

                    groups[key].sales += (item.sales_count || 0);

                    if (item.content_type === '원본제보') {
                        groups[key].files.raw = fileItem;
                    } else if (item.file_type === 'PDF') {
                        if (item.content_type === '문제') groups[key].files.pdfProb = fileItem;
                        else groups[key].files.pdfSol = fileItem;
                    } else if (item.file_type === 'HWP') {
                        if (item.content_type === '문제') groups[key].files.hwpProb = fileItem;
                        else groups[key].files.hwpSol = fileItem;
                    } else if (item.file_type === 'DB') {
                        groups[key].files.db = fileItem;
                    }
                });

                setGroupedFiles(Object.values(groups));
            }
        };
        checkUser();
        initSchoolData();
        initFiles();
    }, []);

    const fetchDbDetails = async (file: FileItem) => {
        setIsLoadingDetails(true);
        setSelectedDbForDetail(file);
        try {
            const params = new URLSearchParams({
                school: file.school,
                year: String(file.year || ''),
                grade: String(file.grade || ''),
                semester: String(file.semester || ''),
                examType: file.examType || '',
                subject: file.subject || ''
            });
            const res = await fetch(`/api/db/details?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setDbDetails(data.data);
            } else {
                alert('정보를 불러오지 못했습니다: ' + data.error);
                setSelectedDbForDetail(null);
            }
        } catch (e) {
            console.error(e);
            alert('오류가 발생했습니다.');
            setSelectedDbForDetail(null);
        } finally {
            setIsLoadingDetails(false);
        }
    };

    const handleUploadClick = () => {
        if (!user) {
            setShowLoginPrompt(true);
            return;
        }
        setIsUploadModalOpen(true);
    };

    const handleNeedLogin = () => {
        setShowLoginPrompt(true);
    };

    const handleReportClick = (e: React.MouseEvent, group: any) => {
        e.stopPropagation();
        if (!user) {
            alert('로그인이 필요합니다.');
            router.push('/login');
            return;
        }
        setSelectedExamForReport({ key: group.key, title: group.title });
        setIsReportModalOpen(true);
    };

    const handleVerifyAdmin = async (e: React.MouseEvent, group: any) => {
        e.stopPropagation();
        if (user?.email !== 'mathofhy@naver.com') return;
        
        const newStatus = !group.isVerified;
        try {
            const fileIds: string[] = Object.values(group.files).map((f: any) => f?.id).filter(Boolean) as string[];
            if (fileIds.length === 0) return;

            const { error } = await supabase
                .from('exam_materials')
                .update({ is_verified: newStatus })
                .in('id', fileIds);

            if (error) throw error;
            
            setGroupedFiles((prev: GroupedExam[]) => 
                prev.map((g: GroupedExam) => g.key === group.key ? { ...g, isVerified: newStatus } : g)
            );
        } catch (error) {
            console.error('Verify update error:', error);
            alert('상태 변경에 실패했습니다.');
        }
    };

    const handleAddToCart = async (file: FileItem) => {
        if (!user) {
            setShowLoginPrompt(true);
            return;
        }
        try {
            const isMockFile = file.examType === '모의고사' || file.examType === '수능';
            const semLabelFile = isMockFile ? `${file.semester}월` : `${file.semester}학기`;
            await addToCart({
                item_type: file.type === 'DB' ? 'PERSONAL_DB' : (file.type === 'HWP' ? 'HWP_DOC' : 'MOCK_EXAM'),
                item_id: file.id,
                title: `[${file.school}] ${file.year}년 ${file.grade}학년 ${semLabelFile} ${file.examType} ${file.subject || ''} - ${file.contentType}`,
                price: file.price
            });
            alert('장바구니에 담겼습니다. 상단 장바구니 아이콘을 확인해주세요.');
        } catch (e: any) {
            if (e.message.includes('ALREADY_IN_CART')) {
                alert('이미 장바구니에 담긴 상품입니다.');
            } else {
                alert(e.message);
            }
        }
    };

    const handleDownload = async (file: FileItem) => {
        if (!user) {
            setShowLoginPrompt(true);
            return;
        }

        try {
            // Check if purchased
            if (!purchasedIds.has(file.id) && !isAdmin) {
                alert('구매가 완료되지 않은 자료입니다. 장바구니를 통해 결제해주세요.');
                return;
            }

            if (file.type === 'DB' && !isAdmin) {
                alert('DB 상품은 시험지 만들기 탭에서 확인 하세요.');
                return;
            }

            // 2. Download Logic
            // [V102] Extract original extension from filePath to prevent format distortion
            const originalExt = file.filePath.split('.').pop() || (file.type === 'PDF' ? 'pdf' : 'hwp');
            const safeContentType = file.contentType || '자료';
            // Requested format: 학교이름_년도_학년_학기_중간/기말_문제(or 문제+해설)
            // e.g. 경기고_2024_1_1_중간고사_문제.pdf
            const filename = `${file.school}_${file.year}_${file.grade}_${file.semester}_${file.examType}_${safeContentType}.${originalExt}`;

            // 1. Get raw signed URL (no download param)
            // Increase expiry to 1 hour (3600s) to handle client/server clock drift
            const { data, error: urlError } = await supabase.storage
                .from('exam-materials')
                .createSignedUrl(file.filePath, 3600);

            if (urlError) throw urlError;
            if (!data?.signedUrl) throw new Error('다운로드 URL 생성 실패');

            // 2. Fetch Blob
            const response = await fetch(data.signedUrl);

            // Check if response is JSON error (even with 200 OK sometimes, or 400/403)
            const contentType = response.headers.get('content-type');
            if (!response.ok || (contentType && contentType.includes('application/json'))) {
                // Try to parse error text
                const errText = await response.text();
                console.error('Download fetch failed:', errText);
                throw new Error(`파일 다운로드 실패 (${response.status}): ${errText.substring(0, 100)}`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

        } catch (error: any) {
            console.error('Download error:', error);
            alert('다운로드 중 오류가 발생했습니다: ' + (error.message || 'Unknown error'));
        }
    };





    // [V74] Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const totalPages = Math.ceil(filteredFiles.length / itemsPerPage);

    // Get current items
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredFiles.slice(indexOfFirstItem, indexOfLastItem);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedRegion, selectedDistrict, selectedSchool, selectedGrade, selectedExamScope, selectedYear, searchKeyword]);

    const checkAccess = (id: string) => purchasedIds.has(id) || user?.email === 'mathofhy@naver.com';

    return (
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans">
            <Header
                user={user}
                purchasedPoints={purchasedPoints}
                earnedPoints={earnedPoints}
                onUploadClick={handleUploadClick}
            />

            <RoleOnboardingModal onSelect={(role) => {
                if (role === 'student') {
                    setRunStudentTour(true);
                } else {
                    router.push('/question-bank?tour=1');
                }
            }} />
            <GuidedTour steps={STUDENT_TOUR_STEPS} run={runStudentTour} onClose={() => setRunStudentTour(false)} />
            <LaunchPromoModal />

            <HeroBanner user={user} earnedPoints={earnedPoints} />

            <SimilarDemo />

            <main className="max-w-[1200px] mx-auto px-4 pb-20">
                <div className="flex flex-col gap-6">
                    <div className="space-y-6">
                        {/* 검색 필터 박스 */}
                        <div data-tour="search-filter" className="bg-white rounded-2xl border border-[#B7D1EA] shadow-sm p-5">
                            <p className="text-xs font-bold text-[#497AB7] mb-3 flex items-center gap-1.5">
                                <Search size={12} /> 기출 자료 검색
                            </p>
                            <div className="space-y-2 mb-3">
                                {/* Row 1: Region, District, School */}
                                <div className="grid grid-cols-2 md:grid-cols-12 gap-2">
                                    <div className="col-span-1 md:col-span-3">
                                        <select className="w-full form-select h-10" aria-label="시/도 선택" value={selectedRegion} onChange={e => { setSelectedRegion(e.target.value); setSelectedDistrict(''); }}>
                                            <option value="">시/도</option>
                                            {regions.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-1 md:col-span-3">
                                        <select className="w-full form-select h-10" aria-label="구/군 선택" value={selectedDistrict} onChange={e => setSelectedDistrict(e.target.value)} disabled={!selectedRegion}>
                                            <option value="">구/군</option>
                                            {districts.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-2 md:col-span-6">
                                        <select className="w-full form-select h-10" aria-label="학교 선택" value={selectedSchool} onChange={e => setSelectedSchool(e.target.value)} disabled={!selectedDistrict}>
                                            <option value="">학교 전체</option>
                                            {schools.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {/* Row 2: Grade, Semester, Year */}
                                <div className="grid grid-cols-3 gap-2">
                                    <select className="w-full form-select h-10" aria-label="학년 선택" value={selectedGrade} onChange={e => setSelectedGrade(e.target.value)}>
                                        <option value="">학년 전체</option>
                                        {[1, 2, 3].map(g => <option key={g} value={g}>{g}학년</option>)}
                                    </select>
                                    <select className="w-full form-select h-10" aria-label="시험 범위 선택" value={selectedExamScope} onChange={e => setSelectedExamScope(e.target.value)}>
                                        <option value="">시험 전체</option>
                                        <option value="1-중간고사">1학기 중간</option>
                                        <option value="1-기말고사">1학기 기말</option>
                                        <option value="2-중간고사">2학기 중간</option>
                                        <option value="2-기말고사">2학기 기말</option>
                                    </select>
                                    <select className="w-full form-select h-10" aria-label="년도 선택" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                                        <option value="">년도 전체</option>
                                        {Array.from({ length: new Date().getFullYear() - 2016 }, (_, i) => new Date().getFullYear() - i).map(y => (
                                            <option key={y} value={y}>{y}년</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {/* Search Input */}
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AAAAC4] pointer-events-none" />
                                <input
                                    type="text"
                                    value={searchKeyword}
                                    onChange={(e) => setSearchKeyword(e.target.value)}
                                    placeholder="학교명 검색 (예: 경기고)"
                                    className="w-full pl-9 pr-3 py-2.5 border border-[#B7D1EA] rounded-lg text-sm focus:border-[#497AB7] focus:outline-none focus:ring-2 focus:ring-[#497AB7]/10 transition-colors"
                                />
                            </div>
                        </div>

                        {/* 기출 자료 카드 목록 */}
                        <div id="main-list" className="space-y-2">
                            {currentItems.length > 0 ? currentItems.map((group, idx) => (
                                <div key={group.key} data-tour={idx === 0 ? 'exam-card' : undefined} className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border-l-4 ${group.isVerified ? 'border-l-[#5CC6C3]' : 'border-l-[#497AB7]'}`}>
                                    <div className="p-3 md:p-4">
                                        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                                            {/* Title + meta */}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-base break-keep leading-snug mb-1.5">
                                                    {group.title.includes(']') ? (
                                                        <>
                                                            <Link
                                                                href={group.files.pdfSol ? `/exam/${group.files.pdfSol.id}` : `/school/${encodeURIComponent(group.school)}`}
                                                                className="text-[#497AB7] hover:underline"
                                                                title="문제 미리보기 보기"
                                                            >
                                                                {group.title.split(']')[0]}]
                                                            </Link>{' '}
                                                            <span className="text-[#1E2D4F]">{group.title.split(']')[1].trim()}</span>
                                                        </>
                                                    ) : <span className="text-[#1E2D4F]">{group.title}</span>}
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {group.isVerified && (
                                                        <span className="text-[10px] bg-teal-50 text-teal-600 border border-teal-200 px-2 py-0.5 rounded-full font-bold">✓ 검수완료</span>
                                                    )}
                                                    <span className="text-[11px] text-[#AAAAC4]">{group.date}</span>
                                                    <span className="text-[11px] text-[#AAAAC4]">·</span>
                                                    <span className="text-[11px] text-[#AAAAC4]">{group.uploader === 'mathofhy' || group.uploader === 'Anonymous' ? '수학ETF팀' : group.uploader}</span>
                                                    {user && (
                                                        <button onClick={(e) => handleReportClick(e, group)} className="text-[10px] text-[#AAAAC4] hover:text-red-400 flex items-center gap-0.5 transition-colors">
                                                            <AlertTriangle size={9} /> 신고
                                                        </button>
                                                    )}
                                                    {user?.email === 'mathofhy@naver.com' && (
                                                        <button onClick={(e) => handleVerifyAdmin(e, group)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${group.isVerified ? 'bg-teal-50 border-teal-200 text-teal-600 hover:bg-teal-100' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-[#497AB7] hover:text-[#497AB7]'}`}>
                                                            {group.isVerified ? '인증 취소' : '관리자 인증'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Download chips */}
                                            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                                                {/* PDF */}
                                                {group.files.pdfSol ? (
                                                    <button
                                                        data-tour={idx === 0 ? 'pdf-download' : undefined}
                                                        onClick={() => checkAccess(group.files.pdfSol!.id) ? handleDownload(group.files.pdfSol!) : handleAddToCart(group.files.pdfSol!)}
                                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                                                            checkAccess(group.files.pdfSol.id)
                                                                ? 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'
                                                                : cartItemIds.has(group.files.pdfSol.id)
                                                                ? 'bg-brand-50 text-brand-600 border-brand-200'
                                                                : 'bg-red-50 text-red-400 border-red-100 hover:border-red-200 hover:text-red-500'
                                                        }`}
                                                    >
                                                        <PdfFileIcon size={13} purchased={checkAccess(group.files.pdfSol.id)} />
                                                        <span>{checkAccess(group.files.pdfSol.id) ? 'PDF 다운' : cartItemIds.has(group.files.pdfSol.id) ? '장바구니' : `PDF ${group.files.pdfSol.price}원`}</span>
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed">
                                                        <PdfFileIcon size={13} grayscale /> PDF
                                                    </div>
                                                )}

                                                {/* HWP */}
                                                {group.files.hwpSol ? (
                                                    <button
                                                        onClick={() => checkAccess(group.files.hwpSol!.id) ? handleDownload(group.files.hwpSol!) : handleAddToCart(group.files.hwpSol!)}
                                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                                                            checkAccess(group.files.hwpSol.id)
                                                                ? 'bg-[#E0F7F6] text-[#3AADA9] border-teal-200 hover:bg-teal-100'
                                                                : cartItemIds.has(group.files.hwpSol.id)
                                                                ? 'bg-brand-50 text-brand-600 border-brand-200'
                                                                : 'bg-[#E0F7F6] text-[#3AADA9] border-teal-100 hover:border-teal-200'
                                                        }`}
                                                    >
                                                        <HwpFileIcon size={13} purchased={checkAccess(group.files.hwpSol.id)} />
                                                        <span>{checkAccess(group.files.hwpSol.id) ? 'HWP 다운' : cartItemIds.has(group.files.hwpSol.id) ? '장바구니' : `HWP ${group.files.hwpSol.price}원`}</span>
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed">
                                                        <HwpFileIcon size={13} grayscale /> HWP
                                                    </div>
                                                )}

                                                {/* DB */}
                                                <div className="relative group/db">
                                                    {group.files.db ? (
                                                        <>
                                                            <button className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                                                                checkAccess(group.files.db.id)
                                                                    ? 'bg-[#E8F0FB] text-[#497AB7] border-blue-200 hover:bg-blue-100'
                                                                    : cartItemIds.has(group.files.db.id)
                                                                    ? 'bg-brand-50 text-brand-600 border-brand-200'
                                                                    : 'bg-[#E8F0FB] text-[#497AB7] border-blue-100 hover:border-blue-200'
                                                            }`}>
                                                                <DbFileIcon size={13} purchased={checkAccess(group.files.db.id)} />
                                                                <span>{checkAccess(group.files.db.id) ? 'DB 이용중' : '개인DB'}</span>
                                                            </button>
                                                            <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-[#B7D1EA] shadow-xl z-20 p-2 w-36 opacity-0 group-hover/db:opacity-100 pointer-events-none group-hover/db:pointer-events-auto transition-all duration-200">
                                                                <button onClick={(e) => { e.stopPropagation(); fetchDbDetails(group.files.db!); }} className="w-full py-1.5 px-2 text-xs font-bold text-slate-500 hover:text-[#497AB7] hover:bg-blue-50 rounded-lg flex items-center gap-1 transition-colors">
                                                                    <Info size={11} /> 구성 확인
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); if(checkAccess(group.files.db!.id)) { handleDownload(group.files.db!); } else { handleAddToCart(group.files.db!); } }}
                                                                    className="w-full mt-1 py-1.5 px-2 text-xs font-extrabold bg-[#497AB7] text-white hover:bg-[#3A6599] rounded-lg flex items-center gap-1 justify-center transition-colors"
                                                                >
                                                                    {checkAccess(group.files.db.id) ? <><Download size={11} /> 열기</> : <><ShoppingCart size={11} /> 장바구니</>}
                                                                </button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed">
                                                            <DbFileIcon size={13} grayscale /> DB
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Admin raw */}
                                                {user?.email === 'mathofhy@naver.com' && group.files.raw && (
                                                    <button onClick={() => handleDownload(group.files.raw!)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-purple-50 text-purple-500 border border-purple-200 hover:bg-purple-100 transition-colors">
                                                        <Download size={11} /> 원본
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="py-20 text-center text-[#AAAAC4] bg-white rounded-xl shadow-sm">
                                    <p>검색 결과가 없습니다.</p>
                                </div>
                            )}

                            {/* 페이지네이션 */}
                            {totalPages > 1 && (
                                <div className="py-6 flex justify-center gap-1.5">
                                    <button aria-label="이전 페이지" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-9 h-9 border border-[#B7D1EA] rounded-lg hover:bg-[#EEF4FB] flex items-center justify-center text-[#497AB7] disabled:opacity-30 transition-colors">
                                        <ChevronRight size={15} className="rotate-180" />
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                        <button key={page} aria-label={`페이지 ${page}`} onClick={() => setCurrentPage(page)} className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold transition-colors text-sm ${currentPage === page ? 'bg-[#497AB7] text-white shadow-sm' : 'border border-[#B7D1EA] hover:bg-[#EEF4FB] text-[#497AB7]'}`}>
                                            {page}
                                        </button>
                                    ))}
                                    <button
                                        aria-label="다음 페이지"
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="w-9 h-9 border border-[#B7D1EA] rounded-lg hover:bg-[#EEF4FB] flex items-center justify-center text-[#497AB7] disabled:opacity-30 transition-colors"
                                    >
                                        <ChevronRight size={15} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            <UploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                user={user}
                regions={regions}
                districtsMap={districtsMap}
                schoolsMap={schoolsMap}
            />

            <ReportModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                user={user}
                examGroup={selectedExamForReport}
            />

            {/* 로그인 유도 - 모바일: 바텀시트, PC: 중앙 모달 */}
            {showLoginPrompt && (
                <div
                    className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
                    onClick={() => setShowLoginPrompt(false)}
                >
                    {/* 모바일: 바텀시트 / PC: 중앙 모달 */}
                    <div
                        className="bg-white w-full md:w-auto md:min-w-[400px] md:max-w-md rounded-t-3xl md:rounded-3xl p-6 pb-10 md:pb-6 shadow-2xl"
                        style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* 모바일 드래그 핸들 */}
                        <div className="flex justify-center mb-4 md:hidden">
                            <div className="w-10 h-1 rounded-full bg-slate-300" />
                        </div>
                        {/* PC 닫기 버튼 */}
                        <div className="hidden md:flex justify-end mb-2">
                            <button
                                onClick={() => setShowLoginPrompt(false)}
                                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100"
                                aria-label="닫기"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <div className="text-center mb-6">
                            <div className="text-3xl mb-3">📚</div>
                            <h3 className="text-xl font-extrabold text-slate-800 mb-2">무료로 이용해보세요</h3>
                            <p className="text-sm text-slate-500 break-keep leading-relaxed">
                                전국 내신 기출 즉시 다운로드,<br />
                                나만의 시험지 제작까지 <strong className="text-brand-600">지금 바로 무료</strong>로 시작하세요.
                            </p>
                        </div>
                        <div className="space-y-3">
                            <Link
                                href="/signup"
                                className="block w-full py-4 bg-brand-600 text-white font-extrabold text-base text-center rounded-2xl hover:bg-brand-700 transition-colors shadow-sm"
                            >
                                무료 회원가입 →
                            </Link>
                            <Link
                                href="/login"
                                className="block w-full py-3.5 border-2 border-slate-200 text-slate-600 font-bold text-sm text-center rounded-2xl hover:bg-slate-50 transition-colors"
                            >
                                이미 계정이 있어요 (로그인)
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* DB Detail Modal */}
            {selectedDbForDetail && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
                            <div>
                                <h3 className="font-bold flex items-center gap-2">
                                    <List size={18} />
                                    문항 구성 정보
                                </h3>
                                <p className="text-[11px] text-indigo-100 mt-0.5">{selectedDbForDetail.title}</p>
                            </div>
                            <button aria-label="닫기" onClick={() => setSelectedDbForDetail(null)} className="hover:bg-white/20 p-1.5 rounded-lg transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* 개인DB 안내 문구 추가 */}
                        <div className="bg-indigo-50 border-b border-indigo-100 px-5 py-3 flex items-start gap-2">
                            <Info size={16} className="text-indigo-600 mt-0.5 shrink-0" />
                            <div className="text-xs text-indigo-900 font-medium leading-relaxed">
                                <strong className="text-indigo-700">안내:</strong> 개인DB는 결제 후 <strong className="text-indigo-700 font-extrabold">1일(24시간) 이내</strong>에 '시험지 만들기' 탭에서 문항으로 제공됩니다.
                            </div>
                        </div>

                        <div className="p-5 max-h-[75vh] overflow-y-auto">
                            {isLoadingDetails ? (
                                <div className="py-20 flex flex-col items-center gap-3">
                                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-slate-500 font-medium">데이터를 분석 중입니다...</p>
                                </div>
                            ) : dbDetails.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                    {dbDetails.map((q, idx) => (
                                        <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50/50 border border-slate-100 hover:border-indigo-200 hover:bg-white transition-all shadow-sm group">
                                            <div className="flex items-center gap-3">
                                                <span className="text-[13px] font-black text-slate-700 w-8 group-hover:text-indigo-600 transition-colors shrink-0">{q.question_number}번</span>
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${q.difficulty >= 7 ? 'bg-red-100 text-red-600' :
                                                    q.difficulty >= 4 ? 'bg-orange-100 text-orange-600' :
                                                        'bg-emerald-100 text-emerald-600'
                                                    }`}>
                                                    Lv.{q.difficulty}
                                                </span>
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-bold truncate max-w-[100px]" title={q.unit}>
                                                {q.unit || '-'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-20 text-center text-slate-500">
                                    <p>등록된 문항 정보가 없습니다.</p>
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-slate-50 border-t flex justify-end">
                            <button
                                onClick={() => setSelectedDbForDetail(null)}
                                className="px-5 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-colors shadow-sm"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
