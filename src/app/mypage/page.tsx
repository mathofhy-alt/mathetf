"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileItem } from '@/lib/data';
import { Download, FileText, User as UserIcon, Coins, ArrowLeft, RefreshCw, Edit, Trash2, Database } from 'lucide-react';
import { PdfFileIcon, HwpFileIcon } from '@/components/FileIcons';
import SettlementModal from '@/components/SettlementModal';
import EditModal from '@/components/EditModal';
import { deleteFile, deletePurchase } from './actions';

export default function MyPage() {
    const [user, setUser] = useState<User | null>(null);
    const [activeTab, setActiveTab] = useState<'purchases' | 'sales'>('purchases');
    const [loading, setLoading] = useState(true);
    const [purchases, setPurchases] = useState<any[]>([]);
    const [uploads, setUploads] = useState<any[]>([]);
    const [purchasedPoints, setPurchasedPoints] = useState(0);
    const [earnedPoints, setEarnedPoints] = useState(0);
    const [settlements, setSettlements] = useState<any[]>([]);
    const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
    const [purchaseTab, setPurchaseTab] = useState<'material' | 'db'>('material');

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingFile, setEditingFile] = useState<any>(null);

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
            const { data: profile } = await supabase.from('profiles').select('purchased_points, earned_points').eq('id', user.id).single();
            if (profile) {
                setPurchasedPoints(profile.purchased_points || 0);
                setEarnedPoints(profile.earned_points || 0);
            }

            // Fetch Purchases
            const { data: purchaseData } = await supabase
                .from('purchases')
                .select(`
                    *,
                    exam:exam_materials(*)
                `)
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (purchaseData) setPurchases(purchaseData);

            // Fetch Uploads (Sales)
            const { data: uploadData } = await supabase
                .from('exam_materials')
                .select('*')
                .eq('uploader_id', user.id)
                .neq('school', 'DELETED')
                .order('created_at', { ascending: false });

            if (uploadData) setUploads(uploadData);

            // Fetch Settlements
            const { data: settlementData } = await supabase
                .from('settlement_requests')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (settlementData) setSettlements(settlementData);

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
            // Limits removed as per user request (unlimited re-download)

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

    const handleDelete = async (fileId: string, filePath: string) => {
        if (!confirm('정말로 이 자료를 삭제하시겠습니까?\n삭제된 자료는 복구할 수시 없습니다.')) return;

        try {
            const result = await deleteFile(fileId);

            if (!result.success) {
                alert(result.message || '삭제 실패');
                return;
            }

            alert('자료가 삭제되었습니다.');

            // Refresh List Locally
            setUploads(prev => prev.filter(u => u.id !== fileId));

        } catch (error: any) {
            console.error('Delete error:', error);
            alert('삭제 중 오류가 발생했습니다.');
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
        <div className="min-h-screen bg-[#f3f4f6]">
            <header className="bg-white border-b border-slate-200">
                <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-slate-500 hover:text-slate-800"><ArrowLeft /></Link>
                        <h1 className="text-xl font-bold text-slate-800">마이페이지</h1>
                    </div>
                    {user && (
                        <div className="flex items-center gap-2">
                            <div className="flex items-center text-sm font-medium text-slate-600 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                <span className="flex items-center gap-2 px-3 py-1.5 border-r border-slate-200">
                                    <span className="text-xs text-slate-500">구매</span>
                                    <span className="font-bold text-slate-800">{purchasedPoints.toLocaleString()}</span>
                                </span>
                                <span className="flex items-center gap-2 px-3 py-1.5">
                                    <span className="text-xs text-slate-500">수익</span>
                                    <span className="font-bold text-brand-600">{earnedPoints.toLocaleString()}</span>
                                </span>
                                <button
                                    onClick={() => setIsSettlementModalOpen(true)}
                                    className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 text-xs font-bold transition-colors"
                                >
                                    정산
                                </button>
                                <Link href="/charge" className="bg-yellow-400 hover:bg-yellow-500 text-slate-900 px-3 py-1.5 text-xs font-bold transition-colors">
                                    충전
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            <main className="max-w-[1200px] mx-auto px-4 py-8">
                <div className="flex gap-4 mb-6 border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('purchases')}
                        className={`pb-3 px-2 font-bold text-sm ${activeTab === 'purchases' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        구매 내역
                    </button>
                    <button
                        onClick={() => setActiveTab('sales')}
                        className={`pb-3 px-2 font-bold text-sm ${activeTab === 'sales' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        판매 관리 (업로드)
                    </button>
                </div>

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
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${purchaseTab === 'db' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
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
                                                    <div className={`w-10 h-10 flex items-center justify-center rounded ${file.file_type === 'DB' || file.content_type === '개인DB' ? 'bg-indigo-50 text-indigo-400' : 'bg-slate-100 text-slate-400'}`}>
                                                        {file.file_type === 'PDF' ? <PdfFileIcon size={20} /> : (file.file_type === 'DB' ? <Database size={20} /> : <HwpFileIcon size={20} />)}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${file.file_type === 'DB' ? 'bg-indigo-100 text-indigo-600' : 'bg-brand-50 text-brand-600'}`}>
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
                                                            <span className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-extrabold border border-indigo-100 flex items-center gap-1.5">
                                                                <Database size={12} /> DB 소스용
                                                            </span>
                                                            <Link href="/" className="text-[10px] text-slate-400 hover:text-brand-600 underline font-medium">
                                                                '시험지 만들기'에서 문항 추출
                                                            </Link>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleDownload(p)}
                                                            className="px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-all shadow-sm active:scale-95"
                                                        >
                                                            <Download size={14} /> 다운로드
                                                        </button>
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

                {activeTab === 'sales' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                                <div className="text-sm text-slate-500 mb-1">총 판매 건수</div>
                                <div className="text-2xl font-bold text-slate-800">{uploads.reduce((acc, curr) => acc + (curr.sales_count || 0), 0)}건</div>
                            </div>
                            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
                                <div className="relative z-10">
                                    <div className="text-sm text-slate-500 mb-1">현재 보유 수익 포인트</div>
                                    <div className="text-2xl font-bold text-brand-600">
                                        {earnedPoints.toLocaleString()} P
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1">총 누적 수익: {(uploads.reduce((acc, curr) => acc + (Math.floor(curr.sales_count * curr.price * 0.7) || 0), 0)).toLocaleString()} P</div>
                                </div>
                                <div className="absolute right-4 bottom-4 z-10">
                                    <button onClick={() => setIsSettlementModalOpen(true)} className="px-3 py-1.5 bg-brand-50 text-brand-600 rounded text-xs font-bold hover:bg-brand-100">정산신청</button>
                                </div>
                            </div>
                        </div>

                        {/* Settlement History */}
                        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                            <h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2">
                                <RefreshCw size={14} /> 정산 내역
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-2">신청일</th>
                                            <th className="px-4 py-2">금액</th>
                                            <th className="px-4 py-2">은행/계좌</th>
                                            <th className="px-4 py-2">상태</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {settlements.map(s => (
                                            <tr key={s.id} className="hover:bg-slate-50">
                                                <td className="px-4 py-2 text-slate-600">{new Date(s.created_at).toLocaleDateString()}</td>
                                                <td className="px-4 py-2 font-bold text-slate-800">{s.amount.toLocaleString()} P</td>
                                                <td className="px-4 py-2 text-slate-500">{s.bank_name} {s.account_number}</td>
                                                <td className="px-4 py-2">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold w-fit ${s.status === 'completed' ? 'bg-green-100 text-green-600' :
                                                            s.status === 'rejected' ? 'bg-red-100 text-red-600' :
                                                                'bg-yellow-100 text-yellow-600'
                                                            }`}>
                                                            {s.status === 'completed' ? '완료' : (s.status === 'rejected' ? '반려' : '대기중')}
                                                        </span>
                                                        {s.status === 'rejected' && s.admin_memo && (
                                                            <span className="text-xs text-red-500 font-medium">
                                                                사유: {s.admin_memo}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {settlements.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">정산 내역이 없습니다.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm border border-slate-200 divide-y divide-slate-100">
                            {uploads.length === 0 ? (
                                <div className="p-10 text-center text-slate-400">업로드한 자료가 없습니다.</div>
                            ) : (
                                uploads.map(file => (
                                    <div key={file.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded text-slate-400">
                                                {file.file_type === 'PDF' ? <FileText size={20} /> : <FileText size={20} />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm font-bold text-brand-600">{file.school}</span>
                                                    <span className="w-px h-3 bg-slate-300"></span>
                                                    <span className="text-xs text-slate-500">{file.exam_year}년 {file.grade}학년 {file.semester}학기 {file.exam_type}</span>
                                                </div>
                                                <div className="font-medium text-slate-900">{file.title}</div>
                                                <div className="text-xs text-slate-400 mt-1">
                                                    등록일: {new Date(file.created_at).toLocaleDateString()} <span className="mx-1">·</span> {file.subject} <span className="mx-1">·</span> {file.price}P
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right flex flex-col items-end gap-2">
                                            <div>
                                                <div className="text-sm font-bold text-slate-800">{file.sales_count || 0}회 판매</div>
                                                <div className="text-xs text-brand-600 font-bold">
                                                    +{Math.floor((file.sales_count || 0) * file.price * 0.7).toLocaleString()}P 수익
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => { setEditingFile(file); setIsEditModalOpen(true); }}
                                                    className="flex items-center gap-1 text-slate-400 hover:text-brand-600 px-2 py-1 rounded text-xs border border-slate-200 hover:border-brand-200 transition-colors"
                                                >
                                                    <Edit size={12} /> 수정
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(file.id, file.file_path)}
                                                    className="flex items-center gap-1 text-slate-400 hover:text-red-600 px-2 py-1 rounded text-xs border border-slate-200 hover:border-red-200 transition-colors"
                                                >
                                                    <Trash2 size={12} /> 삭제
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
                <SettlementModal
                    isOpen={isSettlementModalOpen}
                    onClose={() => setIsSettlementModalOpen(false)}
                    earnedPoints={earnedPoints}
                    userId={user?.id || ''}
                />
                <EditModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    user={user}
                    fileData={editingFile}
                    regions={regions}
                    districtsMap={districtsMap}
                    schoolsMap={schoolsMap}
                />
            </main>
        </div>
    );
}
