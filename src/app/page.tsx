"use client";

import React, { useState, useEffect } from 'react';
import { FileItem } from '../lib/data';
import { Search, Upload, FileText, Download, X, User as UserIcon, ChevronRight, PlayCircle, Lock, Coins, Info, List } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import HeroBanner from '@/components/HeroBanner';
import RightSidebar from '@/components/RightSidebar';
import { PdfFileIcon, HwpFileIcon, DbFileIcon } from '@/components/FileIcons';
import Header from '@/components/Header';
import UploadModal from '@/components/UploadModal';

export default function ExamPlatform() {
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
        examType: string; // Added for filtering
        files: {
            pdfProb?: FileItem;
            pdfSol?: FileItem;
            hwpProb?: FileItem;
            hwpSol?: FileItem;
            db?: FileItem; // Added Personal DB
        };
    }

    const [groupedFiles, setGroupedFiles] = useState<GroupedExam[]>([]);

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
    const [user, setUser] = useState<User | null>(null);
    const router = useRouter();
    const supabase = createClient();
    const [selectedDbForDetail, setSelectedDbForDetail] = useState<FileItem | null>(null);
    const [dbDetails, setDbDetails] = useState<any[]>([]);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);

    // Derived Data
    const districts = selectedRegion ? districtsMap[selectedRegion] || [] : [];
    const schools = (selectedRegion && selectedDistrict) ? schoolsMap[selectedRegion]?.[selectedDistrict] || [] : [];

    // Client-side Filtering Logic
    const filteredFiles = groupedFiles.filter(group => {
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
    });

    const fetchMyPoints = async (userId: string) => {
        const { data, error } = await supabase.from('profiles').select('purchased_points, earned_points').eq('id', userId).single();
        if (data) {
            setPurchasedPoints(data.purchased_points || 0);
            setEarnedPoints(data.earned_points || 0);
        }

        // Fetch purchased exams to distinguish in UI
        const { data: purchaseData } = await supabase
            .from('purchases')
            .select('exam_id')
            .eq('user_id', userId);

        if (purchaseData) {
            setPurchasedIds(new Set(purchaseData.map(p => p.exam_id)));
        }
    };

    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            if (user) fetchMyPoints(user.id);
        };

        const fetchSchoolData = async () => {
            // Fetch all schools (handling 1000 row limit by chunking)
            let allSchoolData: any[] = [];
            let from = 0;
            const step = 1000;
            let loopError: any = null;

            while (true) {
                const { data, error } = await supabase
                    .from('schools')
                    .select('region, district, name')
                    .range(from, from + step - 1);

                if (error) {
                    console.error('Error fetching schools:', error);
                    loopError = error;
                    break;
                }

                if (!data || data.length === 0) break;

                allSchoolData = [...allSchoolData, ...data];

                if (data.length < step) break; // Reached end
                from += step;
            }

            if (allSchoolData.length > 0) {
                const data = allSchoolData;
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
            } else if (loopError) {
                console.error('Error fetching schools:', loopError);
            }
            setIsLoadingSchools(false);
        };

        const fetchFiles = async () => {
            const { data } = await supabase
                .from('exam_materials')
                .select('*')
                .neq('school', 'DELETED')
                .order('created_at', { ascending: false });
            if (data) {
                const groups: { [key: string]: GroupedExam } = {};

                data.forEach((item: any) => {
                    // Include subject in the key to differentiate exams
                    const subjectKey = item.subject || 'Unknown';
                    // Derive year from title since exam_year column is missing
                    const yearDerived = item.exam_year || parseInt(item.title?.match(/\d{4}/)?.[0] || '2024');

                    const key = `${item.school}-${yearDerived}-${item.grade}-${item.semester}-${item.exam_type}-${subjectKey}`;

                    if (!groups[key]) {
                        groups[key] = {
                            key,
                            title: `[${item.school}] ${yearDerived}년 ${item.grade}학년 ${item.semester}학기 ${item.exam_type} ${item.subject || ''}`,
                            school: item.school,
                            grade: item.grade,
                            semester: item.semester,
                            subject: item.subject || '',
                            uploader: item.uploader_name || 'Anonymous',
                            date: new Date(item.created_at).toISOString().split('T')[0],
                            sales: 0,
                            examType: item.exam_type, // Added to match interface
                            files: {}
                        };
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
                        year: item.exam_year || parseInt(item.title.match(/\d{4}/)?.[0] || '2024'),
                        semester: item.semester,
                        examType: item.exam_type,
                        filePath: item.file_path, // Added
                        contentType: item.content_type, // Added
                        subject: item.subject || '' // Add subject here
                    };

                    groups[key].sales += (item.sales_count || 0);

                    if (item.file_type === 'PDF') {
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
        fetchSchoolData();
        fetchFiles();
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
            if (confirm('로그인이 필요한 서비스입니다.\\n로그인 페이지로 이동하시겠습니까?')) router.push('/login');
            return;
        }
        setIsUploadModalOpen(true);
    };

    const handleDownload = async (file: FileItem) => {
        if (!user) {
            if (confirm('로그인이 필요합니다. 로그인하시겠습니까?')) router.push('/login');
            return;
        }

        try {
            // 1. Check if already purchased
            const { data: existingPurchase } = await supabase
                .from('purchases')
                .select('*') // Select all to get created_at and download_count
                .eq('user_id', user.id)
                .eq('exam_id', file.id)
                .maybeSingle();

            if (!existingPurchase) {
                if (!confirm(`${file.price}P를 사용하여 ${file.type === 'DB' ? 'DB 접근 권한을 구매' : '다운로드'}하시겠습니까?`)) return;

                const { data: result, error } = await supabase.rpc('purchase_exam_material', {
                    buyer_id: user.id,
                    seller_id: file.uploaderId,
                    price: file.price,
                    exam_id: file.id
                });

                if (error) throw error;
                // @ts-ignore
                if (!result.success) {
                    // @ts-ignore
                    alert(result.message);
                    return;
                }

                fetchMyPoints(user.id);
                // For DB, we just stop here after purchase
                if (file.type === 'DB') {
                    setPurchasedIds(prev => new Set([...Array.from(prev), file.id]));
                    alert('개인 DB 구매가 완료되었습니다. 이제 시험지 만들기 탭에서 이 DB를 소스로 사용할 수 있습니다.');
                    return;
                }

            } else {
                // [V66] Removed 7-day expiry and 3-download count limit (User Request: Lifetime access)
                if (file.type === 'DB') {
                    alert('이미 구매한 DB입니다. 시험지 만들기 탭에서 확인하세요.');
                    return;
                }
            }

            // 2. Download Logic
            // [V102] Extract original extension from filePath to prevent format distortion
            const originalExt = file.filePath.split('.').pop() || (file.type === 'PDF' ? 'pdf' : 'hwp');
            const safeContentType = file.contentType || '자료';
            // Requested format: 학교이름_년도_학년_학기_중간/기말_문제(or 문제+해설)
            // e.g. 경기고_2024_1_1_중간고사_문제.pdf
            const filename = `${file.school}_${file.year}_${file.grade}_${file.semester}_${file.examType}_${safeContentType}.${originalExt}`;

            console.log('Generating signed URL for:', file.filePath);
            console.log('Download filename:', filename);

            // 1. Get raw signed URL (no download param)
            // Increase expiry to 1 hour (3600s) to handle client/server clock drift
            const { data, error: urlError } = await supabase.storage
                .from('exam-materials')
                .createSignedUrl(file.filePath, 3600);

            if (data?.signedUrl) console.log('Generated Signed URL:', data.signedUrl);

            if (urlError) throw urlError;
            if (!data?.signedUrl) throw new Error('다운로드 URL 생성 실패');

            // 2. Fetch Blob
            console.log('Fetching file blob...');
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

    return (
        <div className="min-h-screen bg-[#f3f4f6] text-slate-900 font-sans">
            <Header
                user={user}
                purchasedPoints={purchasedPoints}
                earnedPoints={earnedPoints}
                onUploadClick={handleUploadClick}
            />

            <HeroBanner user={user} purchasedPoints={purchasedPoints} earnedPoints={earnedPoints} />

            <main className="max-w-[1200px] mx-auto px-4 pb-20">
                <div className="grid grid-cols-12 gap-6">
                    <div className="col-span-12 lg:col-span-9 space-y-6">
                        {/* Search Filter Box */}
                        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                            <div className="space-y-3 mb-4">
                                {/* Row 1: Region, District, School */}
                                <div className="grid grid-cols-12 gap-2">
                                    <div className="col-span-3">
                                        <select className="w-full form-select h-10 text-sm" value={selectedRegion} onChange={e => { setSelectedRegion(e.target.value); setSelectedDistrict(''); }}>
                                            <option value="">시/도</option>
                                            {regions.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-3">
                                        <select className="w-full form-select h-10 text-sm" value={selectedDistrict} onChange={e => setSelectedDistrict(e.target.value)} disabled={!selectedRegion}>
                                            <option value="">구/군</option>
                                            {districts.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-6">
                                        <select className="w-full form-select h-10 text-sm" value={selectedSchool} onChange={e => setSelectedSchool(e.target.value)} disabled={!selectedDistrict}>
                                            <option value="">학교 전체</option>
                                            {schools.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Row 2: Grade, Semester, Year */}
                                <div className="grid grid-cols-12 gap-2">
                                    <div className="col-span-4">
                                        <select className="w-full form-select h-10 text-sm" value={selectedGrade} onChange={e => setSelectedGrade(e.target.value)}>
                                            <option value="">학년 전체</option>
                                            {[1, 2, 3].map(g => <option key={g} value={g}>{g}학년</option>)}
                                        </select>
                                    </div>
                                    <div className="col-span-4">
                                        <select className="w-full form-select h-10 text-sm" value={selectedExamScope} onChange={e => setSelectedExamScope(e.target.value)}>
                                            <option value="">시험 전체</option>
                                            <option value="1-중간고사">1학기 중간고사</option>
                                            <option value="1-기말고사">1학기 기말고사</option>
                                            <option value="2-중간고사">2학기 중간고사</option>
                                            <option value="2-기말고사">2학기 기말고사</option>
                                        </select>
                                    </div>
                                    <div className="col-span-4">
                                        <select className="w-full form-select h-10 text-sm" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                                            <option value="">년도 전체</option>
                                            {Array.from({ length: 3 }, (_, i) => 2024 + i).reverse().map(y => (
                                                <option key={y} value={y}>{y}년</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Checkbox Row (REMOVED) */}

                            {/* Search Row */}
                            <div className="flex gap-2 items-center">
                                <div className="flex-1 w-full flex gap-2">
                                    <input
                                        type="text"
                                        value={searchKeyword}
                                        onChange={(e) => setSearchKeyword(e.target.value)}
                                        placeholder="검색어를 입력하세요 (예: 경기고)"
                                        className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                                    />
                                    <button className="bg-brand-600 text-white px-6 py-2 rounded font-bold text-sm hover:bg-brand-700">검색하기</button>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">


                            <div className="grid grid-cols-12 py-3 px-4 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
                                <div className="col-span-6 text-left pl-4">시험명</div>
                                <div className="col-span-1">등록일</div>
                                <div className="col-span-1">작성자</div>
                                <div className="col-span-4">다운로드 (PDF / HWP / DB)</div>
                            </div>

                            <div className="divide-y divide-slate-100">
                                {currentItems.length > 0 ? currentItems.map(group => (
                                    <div key={group.key} className="grid grid-cols-12 items-center py-4 px-4 hover:bg-slate-50 gap-2 text-sm text-center">
                                        <div className="col-span-6 text-left pl-4">
                                            <div className="font-bold text-slate-800 hover:text-brand-600 cursor-pointer text-base break-keep leading-tight">
                                                {group.title.includes(']') ? (
                                                    <>
                                                        <span className="text-indigo-600">
                                                            {group.title.split(']')[0]}]
                                                        </span>
                                                        <br />
                                                        <span className="text-slate-500 text-sm font-medium">
                                                            {group.title.split(']')[1].trim()}
                                                        </span>
                                                    </>
                                                ) : group.title}
                                            </div>
                                            {/* Subtitle removed as it overlaps with title info */}
                                        </div>
                                        <div className="col-span-1 text-slate-400 text-[11px] whitespace-nowrap">{group.date}</div>
                                        <div className="col-span-1 text-slate-600 truncate text-[11px]">{group.uploader}</div>

                                        <div className="col-span-4 flex items-start justify-center gap-3">
                                            {/* PDF Problem (REMOVED) */}

                                            {/* PDF Solution */}
                                            {group.files.pdfSol ? (
                                                <button
                                                    onClick={() => handleDownload(group.files.pdfSol!)}
                                                    title={purchasedIds.has(group.files.pdfSol.id) ? "이미 구매한 자료입니다" : `PDF 해설 (${group.files.pdfSol.price}원)`}
                                                    className={`group flex flex-col items-center p-1 rounded transition-colors ${purchasedIds.has(group.files.pdfSol.id) ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}
                                                >
                                                    <PdfFileIcon
                                                        size={28}
                                                        purchased={purchasedIds.has(group.files.pdfSol.id)}
                                                        className="drop-shadow-sm group-hover:scale-110 transition-transform"
                                                    />
                                                    <span className={`text-xs font-bold mt-1 whitespace-nowrap ${purchasedIds.has(group.files.pdfSol.id) ? 'text-indigo-600' : 'text-slate-700'}`}>문제+해설</span>
                                                    <span className={`text-[11px] whitespace-nowrap ${purchasedIds.has(group.files.pdfSol.id) ? 'text-indigo-700 font-bold' : 'text-slate-500 font-medium'}`}>
                                                        {purchasedIds.has(group.files.pdfSol.id) ? '구매완료' : `${group.files.pdfSol.price}P`}
                                                    </span>
                                                </button>
                                            ) : (
                                                <div className="flex flex-col items-center p-1 opacity-50 cursor-not-allowed grayscale">
                                                    <PdfFileIcon size={28} grayscale={true} />
                                                    <span className="text-xs font-bold text-slate-400 mt-1 whitespace-nowrap">문제+해설</span>
                                                    <span className="text-[11px] text-slate-300 font-medium">미등록</span>
                                                </div>
                                            )}

                                            <div className="w-px h-8 bg-slate-200 mx-1 self-center"></div>

                                            {/* HWP Problem (REMOVED) */}

                                            {/* HWP Solution */}
                                            {group.files.hwpSol ? (
                                                <button
                                                    onClick={() => handleDownload(group.files.hwpSol!)}
                                                    title={purchasedIds.has(group.files.hwpSol.id) ? "이미 구매한 자료입니다" : `HWP 해설 (${group.files.hwpSol.price}원)`}
                                                    className={`group flex flex-col items-center p-1 rounded transition-colors ${purchasedIds.has(group.files.hwpSol.id) ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}
                                                >
                                                    <HwpFileIcon
                                                        size={28}
                                                        purchased={purchasedIds.has(group.files.hwpSol.id)}
                                                        className="drop-shadow-sm group-hover:scale-110 transition-transform"
                                                    />
                                                    <span className={`text-xs font-bold mt-1 whitespace-nowrap ${purchasedIds.has(group.files.hwpSol.id) ? 'text-indigo-600' : 'text-slate-700'}`}>문제+해설</span>
                                                    <span className={`text-[11px] whitespace-nowrap ${purchasedIds.has(group.files.hwpSol.id) ? 'text-indigo-700 font-bold' : 'text-slate-500 font-medium'}`}>
                                                        {purchasedIds.has(group.files.hwpSol.id) ? '구매완료' : `${group.files.hwpSol.price}P`}
                                                    </span>
                                                </button>
                                            ) : (
                                                <div className="flex flex-col items-center p-1 opacity-50 cursor-not-allowed grayscale">
                                                    <HwpFileIcon size={28} grayscale={true} />
                                                    <span className="text-xs font-bold text-slate-400 mt-1 whitespace-nowrap">문제+해설</span>
                                                    <span className="text-[11px] text-slate-300 font-medium">미등록</span>
                                                </div>
                                            )}

                                            <div className="w-px h-8 bg-slate-200 mx-1 self-center"></div>

                                            {/* Personal DB */}
                                            <div className="relative group/db p-1 rounded-xl transition-all duration-300 border border-transparent hover:border-indigo-100 hover:bg-indigo-50/30">
                                                {group.files.db ? (
                                                    <div className="flex flex-col items-center min-w-[64px]">
                                                        <DbFileIcon
                                                            size={28}
                                                            purchased={purchasedIds.has(group.files.db.id)}
                                                            className="drop-shadow-sm group-hover/db:scale-110 transition-transform duration-300"
                                                        />
                                                        <span className={`text-[10px] font-bold mt-1 whitespace-nowrap ${purchasedIds.has(group.files.db.id) ? 'text-indigo-600' : 'text-slate-400'}`}>개인DB</span>
                                                        <span className={`text-[10px] whitespace-nowrap ${purchasedIds.has(group.files.db.id) ? 'text-indigo-700 font-bold' : 'text-slate-500 font-medium'}`}>
                                                            {purchasedIds.has(group.files.db.id) ? '구매완료' : `${group.files.db.price}P`}
                                                        </span>

                                                        {/* Hover Overlay */}
                                                        <div className="absolute inset-x-[-4px] inset-y-[-4px] bg-white/95 rounded-xl border border-indigo-200 shadow-xl opacity-0 group-hover/db:opacity-100 transition-all duration-200 flex flex-col items-center justify-center gap-1 z-10 p-1.5 pointer-events-none group-hover/db:pointer-events-auto">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    fetchDbDetails(group.files.db!);
                                                                }}
                                                                className="w-full py-1 text-[9px] font-extrabold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors flex items-center justify-center gap-1"
                                                            >
                                                                <Info size={10} /> 구성 확인
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDownload(group.files.db!);
                                                                }}
                                                                className={`w-full py-1 text-[9px] font-extrabold text-white rounded-md transition-all active:scale-95 flex items-center justify-center gap-1 ${purchasedIds.has(group.files.db.id) ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-indigo-600 hover:bg-indigo-700 shadow-sm'
                                                                    }`}
                                                            >
                                                                {purchasedIds.has(group.files.db.id) ? <Download size={10} /> : <Coins size={10} />}
                                                                {purchasedIds.has(group.files.db.id) ? '다운로드' : '구매하기'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center p-1 opacity-50 cursor-not-allowed grayscale">
                                                        <DbFileIcon size={28} grayscale={true} />
                                                        <span className="text-[10px] font-bold text-slate-400 mt-1 whitespace-nowrap">개인DB</span>
                                                        <span className="text-[10px] text-slate-300 font-medium">대기중</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="py-20 text-center text-slate-400">
                                        <p>검색 결과가 없습니다.</p>
                                    </div>
                                )}
                            </div>

                            {totalPages > 1 && (
                                <div className="py-4 border-t border-slate-200 flex justify-center gap-1">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="w-8 h-8 border border-slate-300 rounded hover:bg-slate-50 flex items-center justify-center text-slate-500 disabled:opacity-30"
                                    >
                                        <ChevronRight size={14} className="rotate-180" />
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-8 h-8 rounded flex items-center justify-center font-bold transition-colors ${currentPage === page ? 'bg-brand-600 text-white' : 'border border-slate-300 hover:bg-slate-50 text-slate-600'}`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="w-8 h-8 border border-slate-300 rounded hover:bg-slate-50 flex items-center justify-center text-slate-500 disabled:opacity-30"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="hidden lg:block lg:col-span-3 space-y-6">
                        <RightSidebar user={user} points={purchasedPoints} />
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
                            <button onClick={() => setSelectedDbForDetail(null)} className="hover:bg-white/20 p-1.5 rounded-lg transition-colors">
                                <X size={20} />
                            </button>
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
                                <div className="py-20 text-center text-slate-400">
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
