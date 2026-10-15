'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Trash2, CheckCircle2, AlertCircle, Merge, Upload } from 'lucide-react';
import { CURRICULA } from '@/lib/curriculum';
import { REPORT_MIN_YEAR, REPORT_REWARD_LABEL } from '@/lib/report-reward';
import { guessReport, fitSubject, curriculumOf, type GuessSchool } from '@/lib/reportGuess';

/**
 * 여러 시험지 한꺼번에 제보 (10/15) — 사용자: 강사가 수원 학교 14곳 70회차를 한 건씩 폼으로 올리느라 몇 시간 걸렸다.
 * 지역만 한 번 고르고 파일을 한꺼번에 올리면 파일 이름·PDF 첫 쪽 글자로 학교·시험 정보를 채운다(lib/reportGuess).
 * 못 채운 칸만 회원이 고치고(여러 줄 골라 한꺼번에 바꾸기·사진 여러 장을 한 시험지로 합치기), 한 번에 보낸다.
 * 보내는 건 기존 /api/original-report 그대로 — 파일 서명은 한 번에, 접수는 시험지마다 한 건(제보 1건 = 행 1개 규칙).
 */
type Row = {
    key: string; files: File[];
    code: string; year: number | ''; grade: number | ''; semester: number | ''; examType: string; subject: string;
    auto: string[];                     // 자동으로 채운 칸 이름
    text?: string;                      // PDF 첫 쪽 글자(지역을 바꾸면 다시 짐작)
    status: '' | 'sending' | 'done' | 'error'; msg?: string;
};
type Taken = { owned: Set<string>; pending: Set<string> };
const MAX = 100;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';
const ALL_SUBJECTS = CURRICULA.flatMap(c => [...c.subjects]).filter((s, i, a) => a.indexOf(s) === i);

async function pdfHeaderText(file: File): Promise<string> {
    try {
        const pdfjs: any = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        // 한글 CID 글꼴은 문자표(cMap)가 있어야 글자로 풀린다 — 한국어 문자표만 public/pdf-cmaps 에 복사해 뒀다(node_modules/pdfjs-dist/cmaps)
        const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), cMapUrl: '/pdf-cmaps/', cMapPacked: true }).promise;
        const page = await doc.getPage(1);
        const tc = await page.getTextContent();
        return tc.items.map((it: any) => it.str).join(' ').slice(0, 3000);   // 스캔 PDF 는 글자가 없다 → 파일 이름만 쓴다
    } catch { return ''; }
}

export default function BatchReport({ schools, supabase, top, notify, notifySection, onDone, onBusy }: {
    schools: GuessSchool[]; supabase: any; top: React.ReactNode; notify: { sms: boolean; when: string };
    notifySection: React.ReactNode; onDone: (count: number) => void; onBusy: (b: boolean) => void;
}) {
    const thisYear = new Date().getFullYear();
    const [region, setRegion] = useState('');
    const [district, setDistrict] = useState('');
    const [rows, setRows] = useState<Row[]>([]);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [taken, setTaken] = useState<Record<string, Taken>>({});
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const pickRef = useRef<HTMLInputElement>(null);
    const REGION_ORDER = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
    const regions = useMemo(() => Array.from(new Set(schools.map(x => x.region))).sort((a, b) => (REGION_ORDER.indexOf(a) + 1 || 99) - (REGION_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b, 'ko')), [schools]);
    const districts = useMemo(() => Array.from(new Set(schools.filter(x => x.region === region).map(x => x.district))).sort((a, b) => a.localeCompare(b, 'ko')), [schools, region]);
    // 구·군을 안 고르면 시도 전체에서 찾는다(학교가 여러 구에 걸친 강사)
    const area = useMemo(() => schools.filter(x => x.region === region && (!district || x.district === district)).sort((a, b) => a.name.localeCompare(b.name, 'ko')), [schools, region, district]);
    const byCode = useMemo(() => new Map(schools.map(s => [s.code, s])), [schools]);
    const sending = !!busy;
    // [10/15 버그] 접수가 끝나면 부모가 완료 화면으로 바꿔 이 컴포넌트가 먼저 사라진다 → '보내는 중'이 켜진 채 남아 창이 안 닫혔다.
    //   사라질 때 꺼 주고, 부모도 onDone 에서 끈다.
    useEffect(() => { onBusy(sending); }, [sending, onBusy]);
    const onBusyRef = useRef(onBusy); onBusyRef.current = onBusy;   // 부모가 매번 새 함수를 넘겨도 정리는 한 번만
    useEffect(() => () => onBusyRef.current(false), []);

    // 고른 학교마다 이미 있는 회차·접수된 제보를 한 번씩 읽어 둔다
    const codes = useMemo(() => Array.from(new Set(rows.map(r => r.code).filter(Boolean))), [rows]);
    useEffect(() => {
        for (const c of codes) if (!taken[c]) {
            setTaken(t => ({ ...t, [c]: { owned: new Set(), pending: new Set() } }));
            fetch(`/api/original-report?code=${c}`).then(r => r.json())
                .then(j => setTaken(t => ({ ...t, [c]: { owned: new Set(j.owned || []), pending: new Set(j.pending || []) } }))).catch(() => { });
        }
    }, [codes, taken]);

    const missing = (r: Row) => [!r.code && '학교', !r.year && '연도', !r.grade && '학년', !r.semester && '학기', !r.examType && '시험', !r.subject && '과목'].filter(Boolean) as string[];
    const stateOf = (r: Row) => {
        if (missing(r).length) return '';
        const k = `${r.year}-${r.grade}-${r.semester}-${r.examType}-${r.subject}`, t = taken[r.code];
        return t?.owned.has(k) ? 'owned' : t?.pending.has(k) ? 'pending' : '';
    };
    // 같은 묶음 안에서 같은 시험이 두 번 — 두 번째부터 막는다(서버도 막지만 미리 보여 준다)
    const dupKeys = useMemo(() => {
        const seen = new Set<string>(), dup = new Set<string>();
        for (const r of rows) { if (r.status === 'done' || missing(r).length) continue; const k = `${r.code}-${r.year}-${r.grade}-${r.semester}-${r.examType}-${r.subject}`; if (seen.has(k)) dup.add(r.key); seen.add(k); }
        return dup;
    }, [rows]);
    const ready = rows.filter(r => r.status !== 'done' && !missing(r).length && !stateOf(r) && !dupKeys.has(r.key));

    const fill = (r: Row, g: ReturnType<typeof guessReport>, onlyEmpty: boolean): Row => {
        const n = { ...r, auto: [...r.auto] };
        const put = (k: 'code' | 'year' | 'grade' | 'semester' | 'examType' | 'subject', v: any) => { if (v === undefined || v === '') return; if (onlyEmpty && n[k]) return; (n as any)[k] = v; if (!n.auto.includes(k)) n.auto.push(k); };
        put('code', g.school?.code); put('year', g.year); put('grade', g.grade); put('semester', g.semester); put('examType', g.examType); put('subject', g.subject);
        if (n.subject) n.subject = fitSubject(n.subject, n.year || undefined, n.grade || undefined);
        return n;
    };

    const addFiles = (list: FileList | null) => {
        if (!list) return; setError('');
        const total = rows.reduce((n, r) => n + r.files.length, 0);
        const add = Array.from(list).slice(0, Math.max(0, MAX - total));
        if (add.length < list.length) setError(`파일은 한 번에 ${MAX}개까지예요. 나머지는 이번 걸 보낸 뒤에 올려 주세요.`);
        const made: Row[] = add.map(f => fill({ key: `${f.name}_${f.size}_${Math.random()}`, files: [f], code: '', year: '', grade: '', semester: '', examType: '', subject: '', auto: [], status: '' }, guessReport(f.name, '', area), false));
        setRows(rs => [...rs, ...made]);
        // PDF 는 첫 쪽 글자로 빈칸을 더 채운다(파일 이름이 우선)
        made.forEach(async row => {
            const f = row.files[0];
            if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) return;
            const text = await pdfHeaderText(f); if (!text) return;
            const g = guessReport(f.name, text, area);
            setRows(rs => rs.map(r => r.key === row.key && r.status !== 'done' ? { ...fill(r, g, true), text } : r));
        });
    };
    // 지역을 나중에 바꾸면 학교가 빈 줄만 다시 찾는다
    useEffect(() => {
        setRows(rs => rs.map(r => r.code || r.status === 'done' ? r : fill(r, guessReport(r.files[0].name, r.text || '', area), true)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [area]);
    const update = (keys: string[], patch: Partial<Row>) => setRows(rs => rs.map(r => {
        if (!keys.includes(r.key) || r.status === 'done') return r;
        const n = { ...r, ...patch, auto: r.auto.filter(a => !(a in patch)) };
        if ((patch.year || patch.grade) && n.subject) n.subject = fitSubject(n.subject, n.year || undefined, n.grade || undefined);
        return n;
    }));
    const remove = (key: string) => { setRows(rs => rs.filter(r => r.key !== key)); setChecked(c => { const n = new Set(c); n.delete(key); return n; }); };
    const toggle = (key: string) => setChecked(c => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    const selected = rows.filter(r => checked.has(r.key) && r.status !== 'done');
    // 사진 여러 장 = 시험지 하나 → 고른 줄을 첫 줄에 합친다
    const merge = () => {
        if (selected.length < 2) return;
        const [first, ...rest] = selected;
        const files = selected.flatMap(r => r.files);
        if (files.length > 30) return setError('한 시험지는 파일 30개까지 합칠 수 있어요.');
        setRows(rs => rs.filter(r => !rest.some(x => x.key === r.key)).map(r => r.key === first.key ? { ...r, files } : r));
        setChecked(new Set());
    };

    const submit = async () => {
        setError('');
        if (!ready.length) return setError('보낼 수 있는 시험지가 없어요. 빨간 칸을 채워 주세요.');
        try {
            const files = ready.flatMap(r => r.files);
            setBusy('업로드 준비 중…');
            const s = await fetch('/api/original-report', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sign', bulk: true, files: files.map(f => ({ name: f.name, type: f.type || 'image/jpeg', size: f.size })) }) });
            const sj = await s.json(); if (!s.ok) throw new Error(sj.error || '업로드 준비에 실패했습니다.');
            const pathOf = new Map<File, string>();
            for (let i = 0; i < files.length; i++) {
                setBusy(`파일 올리는 중… ${i + 1} / ${files.length}`);
                const { path, token } = sj.uploads[i];
                const { error: upErr } = await supabase.storage.from('exam-materials').uploadToSignedUrl(path, token, files[i], { contentType: files[i].type || 'image/jpeg' });
                if (upErr) throw new Error(`${files[i].name} 을(를) 올리지 못했습니다. 다시 시도해주세요.`);
                pathOf.set(files[i], path);
            }
            let ok = 0;
            for (const [i, r] of ready.entries()) {
                setBusy(`접수 중… ${i + 1} / ${ready.length}`);
                setRows(rs => rs.map(x => x.key === r.key ? { ...x, status: 'sending' } : x));
                const res = await fetch('/api/original-report', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'submit', paths: r.files.map(f => pathOf.get(f)), meta: { code: r.code, year: r.year, grade: r.grade, semester: r.semester, examType: r.examType, subject: r.subject, note: '', notify } }) });
                const j = await res.json().catch(() => ({}));
                if (res.ok) ok++;
                setRows(rs => rs.map(x => x.key === r.key ? { ...x, status: res.ok ? 'done' : 'error', msg: res.ok ? undefined : j.error || '접수하지 못했어요.' } : x));
            }
            if (ok === ready.length) onDone(ok);
            else setError(`${ok}개는 접수됐고 ${ready.length - ok}개는 접수하지 못했어요. 빨간 줄을 확인해 주세요.`);
        } catch (err: any) {
            setError(err?.message || '제보 중 문제가 생겼습니다. 잠시 후 다시 시도해주세요.');
        } finally { setBusy(''); }
    };

    const base = 'w-full min-w-0 rounded-[10px] border-0 px-2 py-2 text-[14px] text-[#17202C] outline-none focus:ring-2 focus:ring-[#1B7E7A]/30';
    const sel = `${base} bg-[#F2F4F6]`;
    // 배경색이 겹치면 Tailwind 순서로 갈려 초록이 안 보였다 → 칸마다 배경을 하나만 붙인다
    const cls = (r: Row, k: string, empty: boolean) => `${base} ${empty ? 'ring-2 ring-[#E5484D]/50 bg-[#FDECEC]' : r.auto.includes(k) || (k === 'semester' && r.auto.includes('examType')) ? 'bg-[#E8F6F5] text-[#145F5C]' : 'bg-[#F2F4F6]'}`;
    const h3 = 'm-0 text-[15px] font-bold text-[#17202C]';
    // .rd 안 버튼 기본 색이 Tailwind 색을 덮어 글자가 안 보였다 → 인라인으로
    const barBtn: React.CSSProperties = { background: 'rgba(255,255,255,.16)', color: '#fff', border: 0, fontSize: 13 };
    const pending = rows.filter(r => r.status !== 'done');
    const fileCount = rows.reduce((n, r) => n + r.files.length, 0);

    // 컴포넌트가 아니라 그리는 함수 — 안에서 컴포넌트로 만들면 칸을 바꿀 때마다 새로 만들어져 선택 상자가 닫힌다
    const fields = (r: Partial<Row>, keys: string[]) => {
        const on = (patch: Partial<Row>) => update(keys, patch);
        const one = keys.length === 1 ? rows.find(x => x.key === keys[0]) : undefined;
        const c = (k: string, empty: boolean) => one ? cls(one, k, empty) : sel;
        return <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1.3fr)] gap-1.5">
            <select aria-label="학교" value={r.code || ''} onChange={e => on({ code: e.target.value })} className={`${c('code', !r.code)} col-span-2 sm:col-span-1`}>
                <option value="">{keys.length > 1 ? '학교 바꾸기' : '학교 선택'}</option>
                {area.map(s => <option key={s.code} value={s.code}>{s.name}{district ? '' : ` (${s.district})`}</option>)}
                {r.code && !area.some(s => s.code === r.code) && byCode.get(r.code) && <option value={r.code}>{byCode.get(r.code)!.name}</option>}
            </select>
            <select aria-label="연도" value={r.year || ''} onChange={e => on({ year: Number(e.target.value) || '' })} className={c('year', !r.year)}>
                <option value="">연도</option>
                {Array.from({ length: thisYear - REPORT_MIN_YEAR + 1 }, (_, i) => thisYear - i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select aria-label="학년" value={r.grade || ''} onChange={e => on({ grade: Number(e.target.value) || '' })} className={c('grade', !r.grade)}>
                <option value="">학년</option>{[1, 2, 3].map(g => <option key={g} value={g}>고{g}</option>)}
            </select>
            <select aria-label="학기·시험" value={r.semester && r.examType ? `${r.semester}-${r.examType}` : ''} onChange={e => { const [s, t] = e.target.value.split('-'); on({ semester: Number(s) || '', examType: t || '' }); }} className={c('semester', !r.semester || !r.examType)}>
                <option value="">학기·시험</option>
                {[1, 2].flatMap(s => ['중간고사', '기말고사'].map(t => <option key={`${s}-${t}`} value={`${s}-${t}`}>{s}학기 {t.slice(0, 2)}</option>))}
            </select>
            <select aria-label="과목" value={r.subject || ''} onChange={e => on({ subject: e.target.value })} className={c('subject', !r.subject)}>
                <option value="">과목</option>
                {(r.year && r.grade ? [...(CURRICULA.find(c => c.id === curriculumOf(Number(r.year), Number(r.grade)))?.subjects || [])] : ALL_SUBJECTS).map(s => <option key={s} value={s}>{s}</option>)}<option value="모름">모르겠어요</option>
            </select>
        </div>;
    };

    return <>
        <div className="rd-modal-body space-y-6">
            {top}
            <section className="space-y-3">
                <h3 className={h3}>1. 학교들이 있는 지역 <span className="font-normal text-[#5F6B78]">(한 번만 고르면 돼요)</span></h3>
                <div className="grid grid-cols-2 gap-2">
                    <select aria-label="시도" value={region} onChange={e => { setRegion(e.target.value); setDistrict(''); }} className={sel + ' py-3 text-[16px]'} disabled={sending}>
                        <option value="">시도 선택</option>{regions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select aria-label="구군" value={district} onChange={e => setDistrict(e.target.value)} className={sel + ' py-3 text-[16px]'} disabled={!region || sending}>
                        <option value="">구·군 전체</option>{districts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
            </section>

            <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                    <h3 className={h3}>2. 시험지 파일 한꺼번에</h3>
                    <span className="shrink-0 text-[14px] text-[#5F6B78] tabular-nums">{fileCount} / {MAX}개</span>
                </div>
                <p className="m-0 text-[14px] leading-[1.6] text-[#5F6B78]">
                    파일 이름과 PDF 첫 쪽을 읽어 학교·시험을 채워 드려요. <b className="text-[#1B7E7A]">초록 칸</b>은 자동으로 채운 칸, <b className="text-[#C0392B]">빨간 칸</b>은 직접 골라야 하는 칸이에요.
                    {' '}사진 여러 장이 시험지 하나면 체크하고 <b className="text-[#17202C]">합치기</b>를 눌러 주세요.
                </p>
                <button type="button" onClick={() => pickRef.current?.click()} disabled={!region || sending}
                    className="w-full flex items-center justify-center gap-2 min-h-[56px] rounded-[14px] border-2 border-dashed border-[#1B7E7A]/40 bg-[#E8F6F5] text-[#1B7E7A] font-bold text-[15px] disabled:opacity-50">
                    <Upload size={18} /> {region ? 'PDF·사진 여러 개 고르기' : '먼저 지역을 골라 주세요'}
                </button>
                <input ref={pickRef} type="file" accept={ACCEPT} multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />

                {selected.length > 0 && !sending && (
                    <div className="sticky top-0 z-10 space-y-2 rounded-[14px] bg-[#17202C] p-3 text-white">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                            <b>{selected.length}개 골랐어요 — 아래 값을 고르면 한꺼번에 바뀌어요</b>
                            <div className="flex gap-1.5 whitespace-nowrap">
                                {selected.length > 1 && <button type="button" onClick={merge} className="flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 font-bold" style={barBtn}><Merge size={14} /> 한 시험지로 합치기</button>}
                                <button type="button" onClick={() => setChecked(new Set())} className="rounded-[8px] px-2.5 py-1.5" style={barBtn}>선택 해제</button>
                            </div>
                        </div>
                        {fields({}, selected.map(r => r.key))}
                    </div>
                )}

                {rows.length > 0 && <div className="flex items-center justify-between text-[14px] text-[#5F6B78]">
                    <label className="flex items-center gap-2"><input type="checkbox" className="w-4 h-4 accent-[#1B7E7A]" checked={pending.length > 0 && pending.every(r => checked.has(r.key))} onChange={e => setChecked(e.target.checked ? new Set(pending.map(r => r.key)) : new Set())} disabled={sending} /> 전체 선택</label>
                    <span>보낼 수 있는 시험지 <b className="text-[#17202C]">{ready.length}</b> / {pending.length}</span>
                </div>}
                <ul className="m-0 p-0 list-none space-y-2">
                    {rows.map(r => {
                        const st = stateOf(r), miss = missing(r), dup = dupKeys.has(r.key);
                        return <li key={r.key} className={`rounded-[14px] border p-2.5 space-y-2 ${r.status === 'done' ? 'border-[#1B7E7A]/30 bg-[#F4FBFA]' : r.status === 'error' || st || dup ? 'border-[#E5484D]/40' : 'border-[#E5E8EB]'}`}>
                            <div className="flex items-center gap-2">
                                {r.status !== 'done' && <input type="checkbox" aria-label={`${r.files[0].name} 고르기`} className="w-4 h-4 shrink-0 accent-[#1B7E7A]" checked={checked.has(r.key)} onChange={() => toggle(r.key)} disabled={sending} />}
                                <FileText size={15} className="shrink-0 text-[#8B95A1]" />
                                <span className="min-w-0 flex-1 truncate text-[13px] text-[#4E5968]" title={r.files.map(f => f.name).join(', ')}>{r.files[0].name}{r.files.length > 1 ? ` 외 ${r.files.length - 1}장` : ''}</span>
                                {r.status === 'done' ? <span className="flex items-center gap-1 text-[13px] font-bold text-[#1B7E7A]"><CheckCircle2 size={14} /> 접수됨</span>
                                    : r.status === 'sending' ? <span className="text-[13px] text-[#5F6B78]">보내는 중…</span>
                                    : <button type="button" aria-label="이 줄 빼기" onClick={() => remove(r.key)} disabled={sending} className="w-8 h-8 shrink-0 flex items-center justify-center text-[#8B95A1] hover:text-[#C0392B]"><Trash2 size={15} /></button>}
                            </div>
                            {r.status === 'done'
                                ? <p className="m-0 text-[13px] text-[#4E5968]">{byCode.get(r.code)?.name} {r.year} 고{r.grade} {r.semester}학기 {String(r.examType).slice(0, 2)} {r.subject}</p>
                                : fields(r, [r.key])}
                            {r.status === 'error' && <p className="m-0 text-[13px] text-[#C0392B]">{r.msg}</p>}
                            {r.status !== 'done' && (st === 'owned' ? <p className="m-0 text-[13px] text-[#C0392B]">이 시험은 이미 수학ETF에 있어요 — 빼고 보내요.</p>
                                : st === 'pending' ? <p className="m-0 text-[13px] text-[#C0392B]">같은 시험 제보가 이미 접수돼 있어요 — 빼고 보내요.</p>
                                : dup ? <p className="m-0 text-[13px] text-[#C0392B]">위 줄과 같은 시험이에요. 사진이면 합치기를, 아니면 정보를 고쳐 주세요.</p>
                                : miss.length > 0 && <p className="m-0 text-[13px] text-[#C0392B]">{miss.join('·')}을(를) 골라 주세요.</p>)}
                        </li>;
                    })}
                </ul>
            </section>

            {notifySection}

            {error && <div role="alert" className="flex items-start gap-2 rounded-[14px] bg-[#FDECEC] px-[14px] py-3 text-[15px] text-[#C0392B]"><AlertCircle size={16} className="shrink-0 mt-[3px]" />{error}</div>}
        </div>
        <div className="rd-modal-foot">
            <button type="button" onClick={submit} disabled={sending || !ready.length} className="rd-btn rd-btn-primary" style={{ flex: '1 1 0' }}>
                {busy || (ready.length ? `시험지 ${ready.length}개 제보하기 (회차마다 ${REPORT_REWARD_LABEL})` : '빨간 칸을 채우면 보낼 수 있어요')}
            </button>
        </div>
    </>;
}
