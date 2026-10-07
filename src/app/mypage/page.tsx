"use client";

import Header from "@/components/Header";
import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileItem } from '@/lib/data';
import { Download, FileText, ArrowLeft, Trash2, Database, Settings, MessageSquare } from 'lucide-react';
import MarketingSettings from '@/components/MarketingSettings';
import PasswordSettings from '@/components/PasswordSettings';
import { PdfFileIcon, HwpFileIcon } from '@/components/FileIcons';
import { deletePurchase } from './actions';
import MyDbRequests from '@/components/MyDbRequests';
import MyReports from '@/components/MyReports';
import PassModal, { passLine, type PassInfo } from '@/components/question-bank/PassModal';

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
    // [10/7] 시험지 만들기 이용권
    const [passInfo, setPassInfo] = useState<PassInfo | null>(null);
    const [showPass, setShowPass] = useState(false);
    const loadPass = () => fetch('/api/qb-pass', { cache: 'no-store' }).then(r => r.json()).then(j => setPassInfo(j.loggedIn && !j.error ? j : null)).catch(() => {});
    useEffect(() => { void loadPass(); try { if (new URLSearchParams(window.location.search).get('pass')) setShowPass(true); } catch { } }, []);
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
                .neq('item_type', 'QB_PASS')   // 이용권은 위 '시험지 만들기' 칸에 따로(10/7) — 목록에서 지우면 기간이 사라진다
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




    if (loading) return (
        <div className="rd rd-x rd-my">
            <Header />
            <p className="rd-my-loading" role="status">로딩중...</p>
        </div>
    );

    const isDbPurchase = (p: any) => p.exam?.file_type === 'DB' || p.exam?.content_type === '개인DB';
    const materialCount = purchases.filter(p => !isDbPurchase(p)).length;
    const dbCount = purchases.filter(p => isDbPurchase(p)).length;
    const shownPurchases = purchases.filter(p => (purchaseTab === 'db' ? isDbPurchase(p) : !isDbPurchase(p)));

    return (
        <div className="rd rd-x rd-my">
            <Header />
            <section className="rd-wrap rd-x-top rd-my-top">
                <Link href="/" className="rd-x-back" aria-label="홈으로"><ArrowLeft size={18} /> 홈</Link>
                <div className="rd-my-head">
                    <h1 className="rd-x-h1 rd-my-h1">나의 수학 서재.</h1>
                    {user && passInfo && !(passInfo.unlimited && !passInfo.passUntil) && (
                        <div className="rd-my-points rd-my-pass">
                            <span>시험지 만들기</span>
                            <b>{passInfo.passUntil ? passLine(passInfo) : `무료 ${passInfo.freeLeft}/${passInfo.freePerWeek}회 남음`}</b>
                            <button type="button" className="rd-btn rd-btn-primary" onClick={() => setShowPass(true)}>{passInfo.passUntil ? '기간 늘리기' : '이용권 보기'}</button>
                        </div>
                    )}
                    {user && (
                        <div className="rd-my-points">
                            <span>결제에 사용 가능한 포인트</span>
                            <b>{earnedPoints.toLocaleString()} P</b>
                        </div>
                    )}
                </div>
            </section>

            {showPass && user && <PassModal user={user} info={passInfo} onClose={() => setShowPass(false)} onPaid={() => { setShowPass(false); void loadPass(); }} />}
            <main className="rd-wrap rd-my-main">
                <div className="rd-seg rd-my-tabs" role="group" aria-label="마이페이지 메뉴">
                    <button type="button" aria-pressed={activeTab === 'purchases'} onClick={() => setActiveTab('purchases')}>
                        <FileText size={16} aria-hidden /> 구매 내역
                    </button>
                    <button type="button" aria-pressed={activeTab === 'requests'} onClick={() => setActiveTab('requests')}>
                        <MessageSquare size={16} aria-hidden /> 내 요청
                    </button>
                    {/* [수신설정] 2026-09-05 배포한 마케팅 동의문이 "마이페이지 > 설정에서" 끄라고
                        안내하는데 그 화면이 없었다. 법이 요구하는 '수신 거부 방법'이기도 하다. */}
                    <button type="button" aria-pressed={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>
                        <Settings size={16} aria-hidden /> 설정
                    </button>
                </div>

                <div className="rd-my-panel">
                    {/* [10/7] 내 요청 = 원본 제보 + 개인DB 요청 — 둘 다 운영자 안내가 붙는다 */}
                    {activeTab === 'requests' && <div className="rd-my-stack">
                        <section className="rd-my-reqsec" aria-labelledby="my-reports-h"><h2 id="my-reports-h" className="rd-my-sec-title">원본 제보</h2><MyReports /></section>
                        <section className="rd-my-reqsec" aria-labelledby="my-dbreq-h"><h2 id="my-dbreq-h" className="rd-my-sec-title">개인DB 요청</h2><MyDbRequests /></section>
                    </div>}

                    {activeTab === 'settings' && (
                        <div className="rd-my-stack">
                            <MarketingSettings />
                            <PasswordSettings />
                        </div>
                    )}

                    {activeTab === 'purchases' && (
                        <div className="rd-my-stack">
                            {/* Sub-tabs for Purchases */}
                            <div className="rd-seg rd-seg-inline rd-my-sub" role="group" aria-label="구매 내역 종류">
                                <button type="button" aria-pressed={purchaseTab === 'material'} onClick={() => setPurchaseTab('material')}>
                                    문항 자료 <b>{materialCount}</b>
                                </button>
                                <button type="button" aria-pressed={purchaseTab === 'db'} onClick={() => setPurchaseTab('db')}>
                                    개인DB 소스 <b>{dbCount}</b>
                                </button>
                            </div>

                            {shownPurchases.length === 0 ? (
                                <div className="rd-my-empty">
                                    <span className="rd-my-empty-icon">
                                        {purchaseTab === 'db' ? <Database size={28} /> : <FileText size={28} />}
                                    </span>
                                    <p>{purchaseTab === 'db' ? '구매한 개인DB 자료가 없습니다.' : '구매한 문항 자료가 없습니다.'}</p>
                                    <a href="/#catalog" className="rd-btn rd-btn-primary">출제자료 살펴보기</a>
                                </div>
                            ) : (
                                <ul className="rd-my-list">
                                    {shownPurchases.map(p => {
                                        const file = p.exam;
                                        if (!file) return null;
                                        const isDb = file.file_type === 'DB' || file.content_type === '개인DB';
                                        return (
                                            <li key={p.id} className="rd-my-item">
                                                <span className={`rd-my-ficon${isDb ? ' is-db' : ''}`}>
                                                    {file.file_type === 'PDF' ? <PdfFileIcon size={26} /> : (file.file_type === 'DB' ? <Database size={22} /> : <HwpFileIcon size={26} />)}
                                                </span>
                                                <div className="rd-my-info">
                                                    <p className="rd-my-meta">
                                                        <span className="rd-my-school">{file.school}</span>
                                                        <span>{file.exam_year}년 {file.grade}학년 {file.semester}학기 {file.exam_type}</span>
                                                    </p>
                                                    <p className="rd-my-title">{file.title}</p>
                                                    <p className="rd-my-facts">
                                                        <span>구매일: {new Date(p.created_at).toLocaleDateString()}</span>
                                                        {file.subject && <span>{file.subject}</span>}
                                                        <span>-{p.price?.toLocaleString()}P</span>
                                                    </p>
                                                </div>
                                                <div className="rd-my-actions">
                                                    {isDb ? (
                                                        <div className="rd-my-act">
                                                            <span className="rd-my-dbtag"><Database size={14} /> DB 소스용</span>
                                                            <Link href="/" className="rd-my-act-note rd-my-act-link">
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
                                                                <div className="rd-my-act">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDownload(p)}
                                                                        disabled={isExpired}
                                                                        className="rd-btn rd-my-dl"
                                                                    >
                                                                        <Download size={18} /> 다운로드
                                                                    </button>
                                                                    {isExpired ? (
                                                                        <span className="rd-my-act-note is-bad">다운로드 기간 만료</span>
                                                                    ) : (
                                                                        <span className="rd-my-act-note">{daysLeft}일 남음</span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeletePurchase(p.id)}
                                                        className="rd-my-del"
                                                        title="구매 내역 삭제"
                                                        aria-label="구매 내역 삭제"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
