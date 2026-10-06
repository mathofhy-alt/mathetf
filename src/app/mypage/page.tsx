"use client";

import Header from "@/components/Header";
import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileItem } from '@/lib/data';
import { Download, FileText, User as UserIcon, ArrowLeft, Trash2, Database, Settings, Edit, MessageSquare } from 'lucide-react';
import MarketingSettings from '@/components/MarketingSettings';
import PasswordSettings from '@/components/PasswordSettings';
import { PdfFileIcon, HwpFileIcon } from '@/components/FileIcons';
import { deletePurchase } from './actions';
import MyDbRequests from '@/components/MyDbRequests';

export default function MyPage() {
    const [user, setUser] = useState<User | null>(null);
    const [activeTab, setActiveTab] = useState<'purchases' | 'requests' | 'settings'>('purchases');
    // ?tab=requests 로 들어오면 '내 요청' 탭을 연다(안내 링크용, 10/6)
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('tab') === 'requests') setActiveTab('requests');
    }, []);
    const [loading, setLoading] = useState(true);
    const [purchases, setPurchases] = useState<any[]>([]);
    const [earnedPoints, setEarnedPoints] = useState(0);
    const [purchaseTab, setPurchaseTab] = useState<'material' | 'db'>('material');

    // Edit Modal State

    // School Data State
    const [regions, setRegions] = useState<string[]>([]);
    const [districtsMap, setDistrictsMap] = useState<Record<string, string[]>>({});
    const [schoolsMap, setSchoolsMap] = useState<Record<string, Record<string, string[]>>>({});

    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }
            setUser(user);

            // Fetch Points
            const { data: profile } = await supabase.from('profiles').select('earned_points').eq('id', user.id).single();
            if (profile) {
                setEarnedPoints(profile.earned_points || 0);
            }

            // Fetch Purchases (Old Point System)
            const { data: purchaseDataOld } = await supabase
                .from('purchases')
                .select(`
                    *,
                    exam:exam_materials(*)
                `)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            // Fetch New Cart Purchases
            const { data: purchaseDataNew } = await supabase
                .from('purchased_items')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            let finalPurchases = purchaseDataOld || [];
            
            if (purchaseDataNew && purchaseDataNew.length > 0) {
                const itemIds = purchaseDataNew.map((p: any) => p.item_id);
                // uuid 변환 불가 에러를 피하기 위해 itemIds 중 uuid 형식만 필터링
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                const validUuids = itemIds.filter((id: string) => uuidRegex.test(id));
                
                let exams: any[] = [];
                if (validUuids.length > 0) {
                    const { data } = await supabase.from('exam_materials').select('*').in('id', validUuids);
                    if (data) exams = data;
                }
                
                const examMap: Record<string, any> = {};
                exams.forEach((e: any) => examMap[e.id] = e);

                const newMappedPurchases = purchaseDataNew.map((p: any) => ({
                    id: p.id,
                    user_id: p.user_id,
                    created_at: p.created_at,
                    price: p.price_paid,
                    exam_id: p.item_id,
                    exam: examMap[p.item_id] || {
                        id: p.item_id,
                        title: p.title,
                        file_type: p.item_type.includes('MOCK_EXAM') ? 'PDF' : p.item_type.includes('HWP') ? 'HWP' : 'DB',
                        content_type: p.item_type.includes('MOCK_EXAM') ? '문제' : p.item_type.includes('HWP') ? '자료' : '개인DB',
                        school: '자료',
                        exam_year: new Date().getFullYear(),
                        grade: '-',
                        semester: '-',
                        exam_type: '-',
                        file_path: ''
                    }
                }));

                finalPurchases = [...finalPurchases, ...newMappedPurchases].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            }

            setPurchases(finalPurchases);

            // [10/6] '내 자료 관리'(예전 판매자 화면) 제거 — 회원은 자료를 올려 팔지 않는다(원본 제보만).


            setLoading(false);
        };

        const fetchSchoolData = async () => {
            // Fetch all schools (handling 1000 row limit by chunking)
            let allSchoolData: any[] = [];
            let from = 0;
            const step = 1000;

            while (true) {
                const { data, error } = await supabase
                    .from('schools')
                    .select('region, district, name')
                    .range(from, from + step - 1);

                if (error) break;
                if (!data || data.length === 0) break;

                allSchoolData = [...allSchoolData, ...data];
                if (data.length < step) break;
                from += step;
            }

            if (allSchoolData.length > 0) {
                const newRegions = new Set<string>();
                const newDistricts: Record<string, Set<string>> = {};
                const newSchools: Record<string, Record<string, string[]>> = {};

                allSchoolData.forEach(item => {
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
        };

        init();
        fetchSchoolData();
    }, [router, supabase]);

    const handleDownload = async (purchase: any) => {
        const file = purchase.exam;

        if (!file) {
            alert('자료 정보를 찾을 수 없습니다. (삭제되었거나 데이터 오류)');
            return;
        }

        try {
            // [PG사 심사 요건] 결제일로부터 30일 다운로드 제한
            if (purchase.created_at) {
                const purchaseDate = new Date(purchase.created_at);
                const now = new Date();
                const diffTime = Math.abs(now.getTime() - purchaseDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                
                if (diffDays > 30) {
                    alert('다운로드 가능 기간(결제일로부터 30일)이 만료되었습니다.');
                    return;
                }
            }

            // Increment download count (Try-catch wrapped to avoid blocking download if update fails)
            try {
                await supabase.from('purchases')
                    .update({ download_count: (purchase.download_count || 0) + 1 })
                    .eq('id', purchase.id);
            } catch (updateErr) {
                console.warn('Failed to update download count:', updateErr);
            }

            // [V102] Extract original extension from filePath to prevent format distortion
            const originalExt = file.file_path.split('.').pop() || (file.file_type === 'PDF' ? 'pdf' : 'hwp');
            const safeContentType = file.content_type || '자료';
            // Requested format: 학교이름_년도_학년_학기_중간/기말_문제(or 문제+해설)
            const filename = `${file.school}_${file.exam_year}_${file.grade}_${file.semester}_${file.exam_type}_${safeContentType}.${originalExt}`;

            const { data, error: urlError } = await supabase.storage
                .from('exam-materials')
                .createSignedUrl(file.file_path, 3600);

            if (urlError) {
                console.error('Signed URL Error Detail:', {
                    error: urlError,
                    requestedPath: file.file_path,
                    bucket: 'exam-materials'
                });
                throw new Error(`링크 생성 실패: ${urlError.message} (경로: ${file.file_path})`);
            }
            if (!data?.signedUrl) throw new Error('다운로드 링크가 생성되지 않았습니다.');

            // Using Blob download for better reliability and correct filename
            const response = await fetch(data.signedUrl);

            // Check if response is not OK or if it's a JSON error from Supabase
            const contentTypeCheck = response.headers.get('content-type');
            if (!response.ok || (contentTypeCheck && contentTypeCheck.includes('application/json'))) {
                const errText = await response.text();
                throw new Error(`파일 서버 응답 오류 (${response.status}): ${errText.substring(0, 30)}`);
            }

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
        } catch (e: any) {
            console.error('Download error:', e);
            alert(`다운로드 오류: ${e.message || '알 수 없는 오류'}`);
        }
    };

    const handleDeletePurchase = async (purchaseId: string) => {
        // First warning
        alert('이 내역을 삭제하시면 해당 자료를 다시 다운로드할 수 없습니다.');

        // Second confirmation
        if (!confirm('그래도 삭제하시겠습니까?')) return;

        try {
            const result = await deletePurchase(purchaseId);

            if (!result.success) {
                alert(result.message || '삭제 실패');
                return;
            }

            alert('구매 내역이 삭제되었습니다.');
            // Refresh List locally
            setPurchases(prev => prev.filter(p => p.id !== purchaseId));

        } catch (error) {
            console.error('Purchase delete error:', error);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };




    if (loading) return <div className="min-h-screen flex items-center justify-center">로딩중...</div>;

    return (
        <div className="min-h-screen bg-[#f2f3f0]">
            <Header/><div className="suite-local-header">
                <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-slate-500 hover:text-slate-800"><ArrowLeft /></Link>
                        <h1 className="text-xl font-bold text-slate-800">나의 수학 서재.</h1>
                    </div>
                    {user && (
                        <div className="flex items-center gap-2">
                            <div className="flex items-center text-sm font-medium text-slate-600 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                <span className="flex items-center gap-2 px-3 py-1.5 border-r border-slate-200">
                                    <span className="text-xs text-slate-500">결제에 사용 가능한 포인트</span>
                                    <span className="font-bold text-brand-600">{earnedPoints.toLocaleString()} P</span>
                                </span>

                            </div>
                        </div>
                    )}
                </div>
            </div>

            <main className="account-dashboard max-w-[1200px] mx-auto px-4 py-8">
                <div className="account-tabs flex gap-2 sm:gap-4 mb-6 border-b border-slate-200 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('purchases')}
                        className={`pb-3 px-2 font-bold text-xs sm:text-sm whitespace-nowrap flex-shrink-0 ${activeTab === 'purchases' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        구매 내역
                    </button>
                    <button
                        onClick={() => setActiveTab('requests')}
                        className={`pb-3 px-2 font-bold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${activeTab === 'requests' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <MessageSquare size={14} /> 내 요청
                    </button>
                    {/* [수신설정] 2026-09-05 배포한 마케팅 동의문이 "마이페이지 > 설정에서" 끄라고
                        안내하는데 그 화면이 없었다. 법이 요구하는 '수신 거부 방법'이기도 하다. */}
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`pb-3 px-2 font-bold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${activeTab === 'settings' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <Settings size={14} /> 설정
                    </button>
                </div>

                {activeTab === 'requests' && <MyDbRequests />}

                {activeTab === 'settings' && (
                    <div className="space-y-4">
                        <MarketingSettings />
                        <PasswordSettings />
                    </div>
                )}

                {activeTab === 'purchases' && (
                    <div className="space-y-4">
                        {/* Sub-tabs for Purchases */}
                        <div className="flex gap-2 p-1 bg-slate-200/50 rounded-xl w-fit">
                            <button
                                onClick={() => setPurchaseTab('material')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${purchaseTab === 'material' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                문항 자료 ({purchases.filter(p => p.exam?.file_type !== 'DB' && p.exam?.content_type !== '개인DB').length})
                            </button>
                            <button
                                onClick={() => setPurchaseTab('db')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${purchaseTab === 'db' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                개인DB 소스 ({purchases.filter(p => p.exam?.file_type === 'DB' || p.exam?.content_type === '개인DB').length})
                            </button>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm border border-slate-200 divide-y divide-slate-100">
                            {purchases.filter(p => {
                                const isDb = p.exam?.file_type === 'DB' || p.exam?.content_type === '개인DB';
                                return purchaseTab === 'db' ? isDb : !isDb;
                            }).length === 0 ? (
                                <div className="p-16 text-center">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                        {purchaseTab === 'db' ? <Database size={32} /> : <FileText size={32} />}
                                    </div>
                                    <p className="text-slate-400 font-medium">
                                        {purchaseTab === 'db' ? '구매한 개인DB 자료가 없습니다.' : '구매한 문항 자료가 없습니다.'}
                                    </p>
                                    <a href="/#catalog" className="mt-4 inline-block rounded-xl bg-[#193740] px-5 py-2.5 text-sm font-bold text-white">출제자료 살펴보기 →</a>
                                </div>
                            ) : (
                                purchases
                                    .filter(p => {
                                        const isDb = p.exam?.file_type === 'DB' || p.exam?.content_type === '개인DB';
                                        return purchaseTab === 'db' ? isDb : !isDb;
                                    })
                                    .map(p => {
                                        const file = p.exam;
                                        if (!file) return null;
                                        return (
                                            <div key={p.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 flex items-center justify-center rounded ${file.file_type === 'DB' || file.content_type === '개인DB' ? 'bg-brand-50 text-brand-400' : 'bg-slate-100 text-slate-400'}`}>
                                                        {file.file_type === 'PDF' ? <PdfFileIcon size={20} /> : (file.file_type === 'DB' ? <Database size={20} /> : <HwpFileIcon size={20} />)}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${file.file_type === 'DB' ? 'bg-brand-100 text-brand-600' : 'bg-brand-50 text-brand-600'}`}>
                                                                {file.school}
                                                            </span>
                                                            <span className="text-[11px] text-slate-500 font-medium">{file.exam_year}년 {file.grade}학년 {file.semester}학기 {file.exam_type}</span>
                                                        </div>
                                                        <div className="font-bold text-slate-800 text-sm">{file.title}</div>
                                                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2 font-medium">
                                                            <span>구매일: {new Date(p.created_at).toLocaleDateString()}</span>
                                                            <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                                            <span>{file.subject}</span>
                                                            <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                                            <span className="text-slate-500">-{p.price?.toLocaleString()}P</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {file.file_type === 'DB' || file.content_type === '개인DB' ? (
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className="px-3 py-1.5 bg-brand-50 text-brand-600 rounded-lg text-xs font-extrabold border border-brand-100 flex items-center gap-1.5">
                                                                <Database size={12} /> DB 소스용
                                                            </span>
                                                            <Link href="/" className="text-[10px] text-slate-400 hover:text-brand-600 underline font-medium">
                                                                '시험지 만들기'에서 문항 추출
                                                            </Link>
                                                        </div>
                                                    ) : (
                                                        (() => {
                                                            const purchaseDate = new Date(p.created_at);
                                                            const now = new Date();
                                                            const diffTime = now.getTime() - purchaseDate.getTime();
                                                            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                                                            const daysLeft = Math.max(0, 30 - diffDays);
                                                            const isExpired = daysLeft === 0;

                                                            return (
                                                                <div className="flex flex-col items-end gap-1">
                                                                    <button
                                                                        onClick={() => handleDownload(p)}
                                                                        disabled={isExpired}
                                                                        className={`px-4 py-2.5 border rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm ${
                                                                            isExpired 
                                                                                ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed' 
                                                                                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 active:scale-95'
                                                                        }`}
                                                                    >
                                                                        <Download size={14} /> 다운로드
                                                                    </button>
                                                                    {isExpired ? (
                                                                        <span className="text-[10px] text-red-500 font-bold">다운로드 기간 만료</span>
                                                                    ) : (
                                                                        <span className="text-[10px] text-slate-500 font-medium">{daysLeft}일 남음</span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()
                                                    )}
                                                    <button
                                                        onClick={() => handleDeletePurchase(p.id)}
                                                        className="px-2.5 py-2.5 border border-red-100 rounded-xl text-red-500 hover:bg-red-50 hover:text-red-600 transition-all active:scale-95"
                                                        title="구매 내역 삭제"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                            )}
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}
