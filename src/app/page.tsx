"use client";

import React, { useState, useEffect } from 'react';
import { FileItem } from '../lib/data';
import { Search, Upload, FileText, Download, X, User as UserIcon, ChevronRight, PlayCircle, Lock, Coins } from 'lucide-react';
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
                        contentType: item.content_type // Added
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
                // Check Limits
                const purchaseDate = new Date(existingPurchase.created_at);
                const now = new Date();
                const diffTime = Math.abs(now.getTime() - purchaseDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // DB items usually don't expire in the same way, or maybe they do?
                // User said "10000P". If it's permanent access or not isn't specified, but assuming same ruled for now or lenient.
                // But for "Access", we shouldn't really block it if purchased.
                // However, existing logic blocks > 7 days.
                // If user wants it to be usable in "Make Exam", maybe we should relax expiry for DB?
                // For now, I'll keep the same expiry logic to avoid business logic assumptions, 
                // OR I'll add a check: if (file.type !== 'DB') check expiry.
                // Given the high price (10000P vs 1000P), it might be expected to last longer or indefinitely.
                // But let's stick to current logic unless it blocks immediate usage.

                if (diffDays > 7 && file.type !== 'DB') {
                    alert('다운로드 기한(7일)이 만료되었습니다. 다시 구매해주세요.');
                    return;
                }

                // If it is DB, maybe we don't care about "download count".
                if (file.type !== 'DB') {
                    if ((existingPurchase.download_count || 0) >= 3) {
                        alert('다운로드 횟수(3회)를 초과했습니다. 다시 구매해주세요.');
                        return;
                    }

                    // Increment download count
                    await supabase.from('purchases')
                        .update({ download_count: (existingPurchase.download_count || 0) + 1 })
                        .eq('id', existingPurchase.id);
                }
            }

            // If Type is DB, we don't download anything.
            if (file.type === 'DB') {
                alert('이미 구매한 DB입니다. 시험지 만들기 탭에서 확인하세요.');
                return;
            }

            // 2. Download Logic
            // Requested format: 학교이름_년도_학년_학기_중간/기말_문제(or 문제+해설)
            const extension = file.type === 'PDF' ? 'pdf' : (file.type === 'HWP' ? 'hwp' : 'file');
            const safeContentType = file.contentType || '자료';
            // e.g. 경기고_2024_1_1_중간고사_문제.pdf
            const filename = `${file.school}_${file.year}_${file.grade}_${file.semester}_${file.examType}_${safeContentType}.${extension}`;

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


                            <div className="bg-slate-50 text-slate-500 text-xs font-bold py-2 px-4 grid grid-cols-12 text-center border-b border-slate-200 gap-2 items-center">
                                <div className="col-span-5 text-left pl-4">시험명</div>
                                <div className="col-span-2">학년/학기</div>
                                <div className="col-span-1">등록일</div>
                                <div className="col-span-1">작성자</div>
                                <div className="col-span-3">다운로드 (PDF / HWP / DB)</div>
                            </div>

                            <div className="divide-y divide-slate-100">
                                {filteredFiles.length > 0 ? filteredFiles.map(group => (
                                    <div key={group.key} className="grid grid-cols-12 items-center py-4 px-4 hover:bg-slate-50 gap-2 text-sm text-center">
                                        <div className="col-span-5 text-left pl-4">
                                            <div className="font-bold text-slate-800 hover:text-brand-600 cursor-pointer text-base break-keep">
                                                {group.title}
                                            </div>
                                            {/* Subtitle removed as it overlaps with title info */}
                                        </div>
                                        <div className="col-span-2 text-slate-600 whitespace-nowrap">{group.grade}학년 {group.semester}학기</div>
                                        <div className="col-span-1 text-slate-400 text-xs whitespace-nowrap">{group.date}</div>
                                        <div className="col-span-1 text-slate-600 truncate text-xs">{group.uploader}</div>

                                        <div className="col-span-3 flex items-center justify-center gap-3">
                                            {/* PDF Problem (REMOVED) */}

                                            {/* PDF Solution */}
                                            {group.files.pdfSol ? (
                                                <button
                                                    onClick={() => handleDownload(group.files.pdfSol!)}
                                                    title={`PDF 해설 (${group.files.pdfSol.price}원)`}
                                                    className="group flex flex-col items-center p-1 rounded hover:bg-slate-50 transition-colors"
                                                >
                                                    <PdfFileIcon size={28} className="drop-shadow-sm group-hover:scale-110 transition-transform" />
                                                    <span className="text-[10px] font-bold text-slate-600 mt-1 whitespace-nowrap">문제+해설</span>
                                                    <span className="text-[9px] text-slate-400">{group.files.pdfSol.price}P</span>
                                                </button>
                                            ) : (
                                                <div className="flex flex-col items-center p-1 opacity-50 cursor-not-allowed grayscale">
                                                    <PdfFileIcon size={28} grayscale={true} />
                                                    <span className="text-[10px] font-bold text-slate-400 mt-1 whitespace-nowrap">문제+해설</span>
                                                    <span className="text-[9px] text-slate-300">미등록</span>
                                                </div>
                                            )}

                                            <div className="w-px h-8 bg-slate-200 mx-1"></div>

                                            {/* HWP Problem (REMOVED) */}

                                            {/* HWP Solution */}
                                            {group.files.hwpSol ? (
                                                <button
                                                    onClick={() => handleDownload(group.files.hwpSol!)}
                                                    title={`HWP 해설 (${group.files.hwpSol.price}원)`}
                                                    className="group flex flex-col items-center p-1 rounded hover:bg-slate-50 transition-colors"
                                                >
                                                    <HwpFileIcon size={28} className="drop-shadow-sm group-hover:scale-110 transition-transform" />
                                                    <span className="text-[10px] font-bold text-slate-600 mt-1 whitespace-nowrap">문제+해설</span>
                                                    <span className="text-[9px] text-slate-400">{group.files.hwpSol.price}P</span>
                                                </button>
                                            ) : (
                                                <div className="flex flex-col items-center p-1 opacity-50 cursor-not-allowed grayscale">
                                                    <HwpFileIcon size={28} grayscale={true} />
                                                    <span className="text-[10px] font-bold text-slate-400 mt-1 whitespace-nowrap">문제+해설</span>
                                                    <span className="text-[9px] text-slate-300">미등록</span>
                                                </div>
                                            )}

                                            <div className="w-px h-8 bg-slate-200 mx-1"></div>

                                            {/* Personal DB */}
                                            {group.files.db ? (
                                                <button
                                                    onClick={() => handleDownload(group.files.db!)}
                                                    title={purchasedIds.has(group.files.db.id) ? "이미 구매한 DB입니다" : `개인 DB 접근 (${group.files.db.price}원)`}
                                                    className={`group flex flex-col items-center p-1 rounded transition-colors ${purchasedIds.has(group.files.db.id) ? 'bg-indigo-50/50' : 'hover:bg-indigo-50'}`}
                                                >
                                                    <DbFileIcon
                                                        size={28}
                                                        purchased={purchasedIds.has(group.files.db.id)}
                                                        className="drop-shadow-sm group-hover:scale-110 transition-transform"
                                                    />
                                                    <span className={`text-[10px] font-bold mt-1 ${purchasedIds.has(group.files.db.id) ? 'text-indigo-600' : 'text-indigo-600'}`}>개인DB</span>
                                                    <span className={`text-[9px] ${purchasedIds.has(group.files.db.id) ? 'text-indigo-700 font-bold' : 'text-indigo-400'}`}>
                                                        {purchasedIds.has(group.files.db.id) ? '구매완료' : `${group.files.db.price}P`}
                                                    </span>
                                                </button>
                                            ) : (
                                                <div className="flex flex-col items-center p-1 opacity-50 cursor-not-allowed grayscale">
                                                    <DbFileIcon size={28} grayscale={true} />
                                                    <span className="text-[10px] font-bold text-slate-400 mt-1">개인DB</span>
                                                    <span className="text-[9px] text-slate-300">대기중</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="py-20 text-center text-slate-400">
                                        <p>검색 결과가 없습니다.</p>
                                    </div>
                                )}
                            </div>

                            <div className="py-4 border-t border-slate-200 flex justify-center gap-1">
                                <button className="w-8 h-8 border border-slate-300 rounded hover:bg-slate-50 flex items-center justify-center text-slate-500"><ChevronRight size={14} className="rotate-180" /></button>
                                <button className="w-8 h-8 bg-brand-600 text-white rounded flex items-center justify-center font-bold">1</button>
                                <button className="w-8 h-8 border border-slate-300 rounded hover:bg-slate-50 flex items-center justify-center text-slate-600">2</button>
                                <button className="w-8 h-8 border border-slate-300 rounded hover:bg-slate-50 flex items-center justify-center text-slate-600">3</button>
                                <button className="w-8 h-8 border border-slate-300 rounded hover:bg-slate-50 flex items-center justify-center text-slate-500"><ChevronRight size={14} /></button>
                            </div>
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
        </div>
    );
}
