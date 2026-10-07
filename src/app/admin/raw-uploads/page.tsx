'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { FileDown, Calendar, School, User as UserIcon, Trash2, Coins, RefreshCw } from 'lucide-react';
import { REPORT_REWARD_LABEL } from '@/lib/report-reward';

export default function RawUploadsAdmin() {
    const supabase = createClient();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [uploads, setUploads] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [rewardedIds, setRewardedIds] = useState<Set<string>>(new Set());  // 채택 보상 지급 완료된 제보
    const [rewardingId, setRewardingId] = useState<string | null>(null);

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
        }

        // 채택 보상 지급 완료 목록
        try {
            const res = await fetch('/api/admin/approve-submission');
            if (res.ok) {
                const j = await res.json();
                setRewardedIds(new Set(j.ids || []));
            }
        } catch { }

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

    // [2026-10-05] 회원 제보는 사진 여러 장 = 행 1개. 나머지 경로는 description(JSON).files 에 있다.
    const reportFiles = (row: any): string[] => { try { const d = JSON.parse(row.description || '{}'); if (Array.isArray(d.files) && d.files.length) return d.files; } catch { } return row.file_path ? [row.file_path] : []; };
    const reportNote = (row: any): string => { try { return JSON.parse(row.description || '{}').note || ''; } catch { return ''; } };
    // [10/7] 운영자 안내 — 회원 마이페이지 › 내 요청 › 원본 제보에 보인다(개인DB 요청과 같은 방식)
    const reportReply = (row: any): { text: string; at: string | null } => { try { const d = JSON.parse(row.description || '{}'); return { text: d.admin_reply || '', at: d.replied_at || null }; } catch { return { text: '', at: null }; } };
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [savingReply, setSavingReply] = useState<string | null>(null);
    // [10/8] 무료 타이핑 완성 파일 — 올리면 회원 마이페이지 › 내 요청에서 받는다
    const typedFiles = (row: any): any[] => { try { const d = JSON.parse(row.description || '{}'); return Array.isArray(d.typed_files) ? d.typed_files : []; } catch { return []; } };
    const [typedBusy, setTypedBusy] = useState<string | null>(null);
    const setTyped = (id: string, list: any[]) => setUploads(prev => prev.map(x => { if (x.id !== id) return x; let d: any = {}; try { d = JSON.parse(x.description || '{}'); } catch { } return { ...x, description: JSON.stringify({ ...d, typed_files: list }) }; }));
    const uploadTyped = async (row: any, file: File) => {
        setTypedBusy(row.id);
        try {
            const call = (b: any) => fetch('/api/admin/raw-uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, ...b }) }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.status); return j; });
            const { path, token } = await call({ action: 'typed-upload-url', filename: file.name });
            const { error } = await supabase.storage.from('exam-materials').uploadToSignedUrl(path, token, file, { contentType: file.type || 'application/octet-stream' });
            if (error) throw new Error(error.message);
            const j = await call({ action: 'typed-attach', path, name: file.name, size: file.size });
            setTyped(row.id, j.typed_files);
        } catch (e: any) { alert('파일을 올리지 못했습니다: ' + (e?.message || e)); }
        setTypedBusy(null);
    };
    const removeTyped = async (row: any, path: string) => {
        if (!confirm('이 완성 파일을 지울까요? 회원 마이페이지에서도 사라집니다.')) return;
        const r = await fetch('/api/admin/raw-uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, action: 'typed-remove', path }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { alert('지우지 못했습니다: ' + (j.error || r.status)); return; }
        setTyped(row.id, j.typed_files);
    };
    // [10/7] 채택(보상 지급)한 제보는 '채택됨' 탭으로 — 할 일만 먼저 보이게(사용자 요청)
    const [tab, setTab] = useState<'open' | 'done'>('open');
    const shown = uploads.filter(u => (tab === 'done') === rewardedIds.has(u.id));
    const saveReply = async (row: any) => {
        setSavingReply(row.id);
        const r = await fetch('/api/admin/raw-uploads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, admin_reply: drafts[row.id] ?? reportReply(row).text }) });
        const j = await r.json().catch(() => ({}));
        setSavingReply(null);
        if (!r.ok) { alert('안내를 저장하지 못했습니다: ' + (j.error || r.status)); return; }
        setUploads(prev => prev.map(x => { if (x.id !== row.id) return x; let d: any = {}; try { d = JSON.parse(x.description || '{}'); } catch { } return { ...x, description: JSON.stringify({ ...d, admin_reply: j.admin_reply, replied_at: j.replied_at }) }; }));
        setDrafts(prev => { const n = { ...prev }; delete n[row.id]; return n; });
    };
    // [10/7] 받은 파일 이름에 시도·구군·연도·시험·학교·학년·과목이 다 보이게(사용자 요청)
    //   예: 대구_수성구_2026년_2중간_대구혜화여자고등학교1_공통수학2_원본제보(_01 — 여러 장일 때만)
    const shortRegion = (r: string) => String(r || '').replace(/(특별자치시|특별자치도|특별시|광역시|자치시|자치도)$/, '')
        .replace(/^(충청|전라|경상)(북|남)도$/, (_m, a, b) => ({ 충청: '충', 전라: '전', 경상: '경' } as Record<string, string>)[a] + b).replace(/도$/, '');
    const reportFileBase = (row: any) => {
        const kind = String(row.exam_type || '').includes('중간') ? '중간' : String(row.exam_type || '').includes('기말') ? '기말' : String(row.exam_type || '');
        return [shortRegion(row.region), row.district, row.exam_year ? `${row.exam_year}년` : '', `${row.semester || ''}${kind}`, `${row.school || ''}${row.grade || ''}`, row.subject, '원본제보']
            .filter(Boolean).join('_');
    };
    const handleDownloadAll = async (row: any) => {
        const paths = reportFiles(row);
        for (let i = 0; i < paths.length; i++) {
            await handleDownload(paths[i], `${reportFileBase(row)}${paths.length > 1 ? `_${String(i + 1).padStart(2, '0')}` : ''}.${paths[i].split('.').pop()}`);
            await new Promise(r => setTimeout(r, 400));   // 브라우저가 연속 다운로드를 막지 않게
        }
    };

    const handleDownload = async (filePath: string, originalTitle: string) => {
        try {
            // [10/5] 파일을 먼저 받아(blob) 같은 출처 주소로 저장한다. 서명 주소를 바로 누르면 다른 도메인이라
            //   a.download 가 무시돼 현재 탭에서 사진이 열리고(관리자 화면이 사라짐), 연달아 누르면 앞 다운로드가
            //   취소돼 여러 장 제보의 일부만 받아졌다.
            const { data, error } = await supabase.storage
                .from('exam-materials')
                .download(filePath);

            if (error) throw error;
            if (data) {
                const url = URL.createObjectURL(data);
                const a = document.createElement('a');
                a.href = url;
                a.download = originalTitle.replace(/[\\/:*?"<>|]/g, '_');
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }
        } catch (err) {
            console.error('Download failed:', err);
            alert('다운로드에 실패했습니다. 해당 파일이 Storage에 존재하지 않을 수 있습니다.');
        }
    };

    const handleDelete = async (id: string, filePath: string) => {
        if (!confirm('이 파일을 스토리지와 DB에서 영구 삭제하시겠습니까? (삭제 후 복구 불가)')) return;

        // [10/6] 서버(관리자 확인)에서 지운다. 브라우저에서 직접 지우면 권한 규칙에 막혀도 오류가 안 나
        //   '삭제됐다' 뜨고 새로고침하면 다시 나타났다. filePath 는 서버가 제보 기록에서 다시 읽는다.
        void filePath;
        try {
            const res = await fetch('/api/admin/raw-uploads', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
            setUploads(prev => prev.filter(u => u.id !== id));
            alert(`삭제했습니다 (파일 ${j.files ?? 0}개).`);
        } catch (err: any) {
            console.error('Delete failed:', err);
            alert('삭제하지 못했습니다: ' + (err?.message || '알 수 없는 오류'));
        }
    };

    // [10/6] 'DB 연결'(제보 ↔ 개인DB 출처 연결) 제거 — 쓰던 칸(source_submission_id)이 DB 에 없어 처음부터 동작하지 않았고,
    //   채택 → 정리·등록 흐름에 필요 없다(사용자 결정).

    // 제보 채택 → 제보자에게 보상 지급 (서버에서 멱등 보장)
    const handleApprove = async (file: any) => {
        if (!confirm(`이 제보를 채택하고 제보자(${file.submitter_name || file.uploader_name || '익명'})에게 ${REPORT_REWARD_LABEL}를 지급하시겠습니까?`)) return;
        setRewardingId(file.id);
        try {
            const res = await fetch('/api/admin/approve-submission', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: file.id }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
            setRewardedIds(prev => new Set(prev).add(file.id));
            alert(`✅ 채택 완료 — ${REPORT_REWARD_LABEL} 지급됐습니다.`);
        } catch (err: any) {
            alert('지급 실패: ' + err.message);
        } finally {
            setRewardingId(null);
        }
    };

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
                            회원이 헤더의 원본 제보 버튼으로 올린 시험지 목록입니다 (사진 여러 장 = 제보 1건).
                        </p>
                    </div>
                    <button
                        onClick={fetchData}
                        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 px-3 py-2 rounded-lg border border-slate-200 hover:border-brand-300 transition-colors"
                    >
                        <RefreshCw size={14} /> 새로고침
                    </button>
                </div>

                <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="제보 구분">
                    {([['open', '검토 중'], ['done', '채택됨']] as const).map(([k, label]) => (
                        <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}
                            className={`px-4 py-1.5 text-sm font-bold rounded-md ${tab === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                            {label} <span className="text-xs font-semibold text-slate-400">{uploads.filter(u => (k === 'done') === rewardedIds.has(u.id)).length}</span>
                        </button>
                    ))}
                </div>
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    {isLoading ? (
                        <div className="p-20 text-center text-slate-400 font-bold animate-pulse text-lg">데이터를 스캔하는 중입니다...</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {shown.length === 0 && (
                                <div className="py-20 text-center text-slate-500 font-medium">{tab === 'open' ? '검토할 제보가 없습니다.' : '채택한 제보가 없습니다.'}</div>
                            )}
                            {shown.map(file => {
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
                                                    </div>
                                                    <div className="font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                                                        <School size={14} className="text-slate-400" /> {file.school}
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-0.5">
                                                        {file.exam_year}년도 {file.grade}학년 {file.semester === 1 ? '1학기' : '2학기'} {file.exam_type} ({file.subject})
                                                    </div>
                                                    <div className="text-xs text-brand-600 mt-0.5 font-medium">{file.title} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{reportFiles(file).length}장</span></div>
                                                    {reportNote(file) && <div className="text-xs text-slate-600 mt-1 bg-slate-50 rounded px-2 py-1">💬 {reportNote(file)}</div>}
                                                    <div className="mt-3">
                                                        <label className="block text-xs font-bold text-slate-600 mb-1">회원에게 보낼 안내 <span className="font-normal text-slate-400">— 마이페이지 &gt; 내 요청에 보입니다</span></label>
                                                        <textarea value={drafts[file.id] ?? reportReply(file).text} onChange={e => setDrafts(p => ({ ...p, [file.id]: e.target.value }))} rows={2} maxLength={2000} placeholder="예: 사진이 흐려 일부 문항을 읽기 어렵습니다. 다시 찍어 올려 주세요." className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
                                                        <div className="mt-1 flex items-center justify-between gap-2">
                                                            <span className="text-xs text-slate-400">{reportReply(file).at ? `저장됨 · ${new Date(reportReply(file).at!).toLocaleString('ko-KR')}` : '아직 안내 없음'}</span>
                                                            <button onClick={() => saveReply(file)} disabled={savingReply === file.id || drafts[file.id] === undefined} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-brand-600 text-white disabled:opacity-40">안내 저장</button>
                                                        </div>
                                                    </div>
                                                    <div className="mt-3">
                                                        <div className="text-xs font-bold text-slate-600 mb-1">무료 타이핑 완성 파일 <span className="font-normal text-slate-400">— 올리면 회원이 마이페이지 &gt; 내 요청에서 받습니다</span></div>
                                                        <ul className="space-y-1">
                                                            {typedFiles(file).map((t: any) => <li key={t.path} className="flex items-center gap-2 text-xs"><span className="font-semibold text-slate-700">📄 {t.name}</span>{t.size ? <span className="text-slate-400">{Math.max(1, Math.round(t.size / 1024))}KB</span> : null}<button onClick={() => removeTyped(file, t.path)} className="text-rose-500 hover:underline">지우기</button></li>)}
                                                        </ul>
                                                        <label className={`mt-1 inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 ${typedBusy === file.id ? 'opacity-50 pointer-events-none' : ''}`}>
                                                            {typedBusy === file.id ? '올리는 중…' : '+ 완성 파일 올리기 (HWP·HWPX·HML·PDF·ZIP)'}
                                                            <input type="file" accept=".hwp,.hwpx,.hml,.pdf,.zip" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadTyped(file, f); }} />
                                                        </label>
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                                        <UserIcon size={11} />
                                                        <span className="font-bold">{file.submitter_name || file.uploader_name || '익명'}</span>
                                                        <span className="font-mono text-slate-400 ml-1">{file.submitter_id || file.uploader_id}</span>
                                                    </div>
                                                </div>

                                                {/* 액션 버튼 */}
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {rewardedIds.has(file.id) ? (
                                                        <span className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-lg bg-amber-100 text-amber-700 border border-amber-200">
                                                            <Coins size={13} /> 채택됨 · {REPORT_REWARD_LABEL}
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleApprove(file)}
                                                            disabled={rewardingId === file.id}
                                                            title={`채택하고 ${REPORT_REWARD_LABEL} 지급`}
                                                            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-600 hover:text-white transition-colors shadow-sm disabled:opacity-50"
                                                        >
                                                            <Coins size={13} /> {rewardingId === file.id ? '지급 중…' : `채택 +${REPORT_REWARD_LABEL}`}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDownloadAll(file)}
                                                        title={`다운로드 (${reportFiles(file).length}장)`}
                                                        className="inline-flex items-center justify-center p-2 bg-brand-50 text-brand-600 hover:bg-brand-600 hover:text-white rounded-lg transition-colors shadow-sm"
                                                    >
                                                        <FileDown size={16} />
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
