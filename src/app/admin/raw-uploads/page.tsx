'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { FileDown, Calendar, School, User as UserIcon, Trash2, Link2, Coins, ChevronDown, ChevronUp, RefreshCw, AlertCircle } from 'lucide-react';

export default function RawUploadsAdmin() {
    const supabase = createClient();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [uploads, setUploads] = useState<any[]>([]);
    const [dbItems, setDbItems] = useState<any[]>([]);  // 연결 가능한 DB 자료 목록
    const [isLoading, setIsLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [earningsMap, setEarningsMap] = useState<Record<string, number>>({});  // submission_id → 총 수익
    const [linkingId, setLinkingId] = useState<string | null>(null);  // 현재 연결 처리 중인 submission id
    const [selectedDbId, setSelectedDbId] = useState<string>('');

    const fetchData = async () => {
        setIsLoading(true);

        // 원본 제보 목록
        const { data, error } = await supabase
            .from('exam_materials')
            .select('*')
            .eq('content_type', '원본제보')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setUploads(data);

            // 각 제보의 총 수익 조회
            const ids = data.map((d: any) => d.id);
            if (ids.length > 0) {
                const { data: earningsData } = await supabase
                    .from('submission_earnings')
                    .select('submission_id, earnings_amount');

                if (earningsData) {
                    const map: Record<string, number> = {};
                    earningsData.forEach((e: any) => {
                        map[e.submission_id] = (map[e.submission_id] || 0) + e.earnings_amount;
                    });
                    setEarningsMap(map);
                }
            }
        }

        // 연결 가능한 모든 DB 자료 (content_type 이 '개인DB' 이거나 file_type이 'DB')
        const { data: dbData } = await supabase
            .from('exam_materials')
            .select('id, title, school, exam_year, grade, semester, exam_type, subject, source_submission_id')
            .or("content_type.eq.개인DB,file_type.eq.DB")
            .order('created_at', { ascending: false });

        if (dbData) setDbItems(dbData);

        setIsLoading(false);
    };

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || user.email !== 'mathofhy@naver.com') {
                router.push('/');
                return;
            }
            setUser(user);
            await fetchData();
        };
        init();
    }, [router, supabase]);

    const handleDownload = async (filePath: string, originalTitle: string) => {
        try {
            const { data, error } = await supabase.storage
                .from('exam-materials')
                .createSignedUrl(filePath, 60);

            if (error) throw error;
            if (data?.signedUrl) {
                const a = document.createElement('a');
                a.href = data.signedUrl;
                a.download = originalTitle;
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
        } catch (err) {
            console.error('Download failed:', err);
            alert('다운로드에 실패했습니다. 해당 파일이 Storage에 존재하지 않을 수 있습니다.');
        }
    };

    const handleDelete = async (id: string, filePath: string) => {
        if (!confirm('이 파일을 스토리지와 DB에서 영구 삭제하시겠습니까? (삭제 후 복구 불가)')) return;

        try {
            await supabase.storage.from('exam-materials').remove([filePath]);
            await supabase.from('exam_materials').delete().eq('id', id);
            setUploads(uploads.filter(u => u.id !== id));
            alert('성공적으로 삭제되었습니다.');
        } catch (err) {
            console.error('Delete failed:', err);
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    // DB 자료와 원본 제보 연결
    const handleLinkDb = async (submissionId: string, dbItemId: string) => {
        if (!dbItemId) {
            alert('연결할 DB 자료를 선택해주세요.');
            return;
        }
        if (!confirm('이 원본 제보를 해당 DB 자료와 연결하시겠습니까?\n이후 해당 DB 자료 판매 시 제보자에게 70% 포인트가 자동 적립됩니다.')) return;

        setLinkingId(submissionId);
        try {
            const { error } = await supabase
                .from('exam_materials')
                .update({ source_submission_id: submissionId })
                .eq('id', dbItemId);

            if (error) throw error;

            alert('✅ 연결 완료! 이제 해당 DB 구매 시 제보자에게 70%가 자동 적립됩니다.');
            setSelectedDbId('');
            await fetchData();
        } catch (err: any) {
            alert('연결 실패: ' + err.message);
        } finally {
            setLinkingId(null);
        }
    };

    // 이 제보와 연결된 DB 자료 목록
    const getLinkedDbs = (submissionId: string) =>
        dbItems.filter(d => d.source_submission_id === submissionId);

    if (!user) return null;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
            <Header user={user} />
            <main className="max-w-[1200px] mx-auto px-4 py-8">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                            📥 유저 제보 족보(원본) 확인
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">
                            사용자들이 '자료등록 - 원본 시험지 제보' 탭을 통해 업로드한 파일 목록입니다.
                            <span className="ml-2 text-purple-600 font-bold">DB 자료 연결 시 판매 수익 70%가 제보자에게 자동 적립됩니다.</span>
                        </p>
                    </div>
                    <button
                        onClick={fetchData}
                        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 px-3 py-2 rounded-lg border border-slate-200 hover:border-brand-300 transition-colors"
                    >
                        <RefreshCw size={14} /> 새로고침
                    </button>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    {isLoading ? (
                        <div className="p-20 text-center text-slate-400 font-bold animate-pulse text-lg">데이터를 스캔하는 중입니다...</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {uploads.length === 0 && (
                                <div className="py-20 text-center text-slate-500 font-medium">제보된 파일이 없습니다.</div>
                            )}
                            {uploads.map(file => {
                                const linkedDbs = getLinkedDbs(file.id);
                                const totalEarnings = earningsMap[file.id] || 0;
                                const isExpanded = expandedId === file.id;

                                return (
                                    <div key={file.id}>
                                        {/* 메인 행 */}
                                        <div className="p-4 hover:bg-slate-50 transition-colors">
                                            <div className="flex items-start gap-4">
                                                {/* 제보 정보 */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                                                            <Calendar size={12} /> {new Date(file.created_at).toLocaleString('ko-KR')}
                                                        </span>
                                                        {linkedDbs.length > 0 && (
                                                            <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                                                                <Link2 size={10} /> DB 연결됨 ({linkedDbs.length}개)
                                                            </span>
                                                        )}
                                                        {totalEarnings > 0 && (
                                                            <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                                                                <Coins size={10} /> 총 {totalEarnings.toLocaleString()}P 적립됨
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                                                        <School size={14} className="text-slate-400" /> {file.school}
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-0.5">
                                                        {file.exam_year}년도 {file.grade}학년 {file.semester === 1 ? '1학기' : '2학기'} {file.exam_type} ({file.subject})
                                                    </div>
                                                    <div className="text-xs text-brand-600 mt-0.5 font-medium">{file.title}</div>
                                                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                                        <UserIcon size={11} />
                                                        <span className="font-bold">{file.submitter_name || file.uploader_name || '익명'}</span>
                                                        <span className="font-mono text-slate-400 ml-1">{file.submitter_id || file.uploader_id}</span>
                                                    </div>
                                                </div>

                                                {/* 액션 버튼 */}
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        onClick={() => handleDownload(file.file_path, file.title)}
                                                        title="다운로드"
                                                        className="inline-flex items-center justify-center p-2 bg-brand-50 text-brand-600 hover:bg-brand-600 hover:text-white rounded-lg transition-colors shadow-sm"
                                                    >
                                                        <FileDown size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => setExpandedId(isExpanded ? null : file.id)}
                                                        title="DB 연결 관리"
                                                        className={`inline-flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-lg transition-colors shadow-sm border ${isExpanded ? 'bg-purple-600 text-white border-purple-600' : 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-600 hover:text-white'}`}
                                                    >
                                                        <Link2 size={14} /> DB 연결
                                                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(file.id, file.file_path)}
                                                        title="완전 삭제"
                                                        className="inline-flex items-center justify-center p-2 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-colors shadow-sm"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 확장 패널: DB 연결 관리 */}
                                        {isExpanded && (
                                            <div className="bg-purple-50 border-t border-purple-100 p-4 space-y-4">
                                                {/* 연결된 DB 목록 */}
                                                {linkedDbs.length > 0 && (
                                                    <div>
                                                        <h4 className="text-xs font-bold text-purple-800 mb-2 flex items-center gap-1">
                                                            <Link2 size={12} /> 현재 연결된 DB 자료
                                                        </h4>
                                                        <div className="space-y-1.5">
                                                            {linkedDbs.map(db => (
                                                                <div key={db.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-purple-100">
                                                                    <div>
                                                                        <div className="text-xs font-bold text-slate-700">{db.title}</div>
                                                                        <div className="text-[10px] text-slate-400">{db.school} · {db.exam_year}년 {db.grade}학년 {db.subject}</div>
                                                                    </div>
                                                                    <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">연결됨</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* 새 DB 연결 */}
                                                <div>
                                                    <h4 className="text-xs font-bold text-purple-800 mb-2 flex items-center gap-1">
                                                        <AlertCircle size={12} /> DB 자료 새로 연결하기
                                                    </h4>
                                                    <p className="text-[11px] text-purple-700 mb-2">
                                                        이 원본 제보를 바탕으로 생성한 개인DB 자료를 선택하면, 해당 DB 판매 시 제보자에게 <strong>70%</strong>가 자동 적립됩니다.
                                                    </p>
                                                    <div className="flex gap-2">
                                                        <select
                                                            className="flex-1 text-xs border border-purple-200 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-400 bg-white"
                                                            value={selectedDbId}
                                                            onChange={e => setSelectedDbId(e.target.value)}
                                                        >
                                                            <option value="">-- 연결할 DB 자료 선택 --</option>
                                                            {dbItems
                                                                .filter(d => !d.source_submission_id)  // 아직 연결 안 된 것만
                                                                .map(d => (
                                                                    <option key={d.id} value={d.id}>
                                                                        {d.title} ({d.school} / {d.exam_year}년)
                                                                    </option>
                                                                ))
                                                            }
                                                        </select>
                                                        <button
                                                            onClick={() => handleLinkDb(file.id, selectedDbId)}
                                                            disabled={linkingId === file.id || !selectedDbId}
                                                            className="px-4 py-2 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                                                        >
                                                            <Link2 size={12} />
                                                            {linkingId === file.id ? '연결 중...' : '연결하기'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* 수익 내역 */}
                                                {totalEarnings > 0 && (
                                                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                                                        <div className="text-xs font-bold text-amber-800 flex items-center gap-1 mb-1">
                                                            <Coins size={12} /> 수익 적립 현황
                                                        </div>
                                                        <div className="text-lg font-black text-amber-700">
                                                            {totalEarnings.toLocaleString()} P
                                                            <span className="text-xs font-normal text-amber-600 ml-1">제보자에게 적립됨</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
