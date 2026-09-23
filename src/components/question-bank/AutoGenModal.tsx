'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import {logQuestionBankEvent} from '@/lib/analytics/question-bank';
import { questionBankLoginUrl } from '@/lib/auth-return';

export default function AutoGenModal({
    onClose,
    onGenerate,
    initialFilters, sourceName, initialCount=20, ignoreSavedDraft=false, maxCount = 50, selectedDbs = [], excludedQuestionIds = [], includeOffCurriculum = false
}: {
    onClose: () => void,
    onGenerate: (criteria: any, notice?:string) => void
    /** 장바구니 남은 자리. 이걸 안 넘기면 생성분이 기존 문항과 합쳐져 상한을 넘고
     *  저장할 때야 에러가 나 작업이 통째로 날아간다(8/29 92문항 요청 실패 사례). */
    initialFilters?: any;
    sourceName?: string;
    initialCount?: number;
    ignoreSavedDraft?: boolean;
    maxCount?: number;
    selectedDbs?: any[];
    excludedQuestionIds?: string[];
    includeOffCurriculum?: boolean;
}) {
    const requestRef=useRef<AbortController|null>(null);
    useEffect(()=>()=>requestRef.current?.abort(),[]);
    const [authNeeded,setAuthNeeded]=useState(false);
    const [message,setMessage]=useState('');
    const [subject, setSubject] = useState<string>(initialFilters?.subjects?.[0]||'');
    const [selectedUnits, setSelectedUnits] = useState<string[]>(initialFilters?.units||[]);
    const [count, setCount] = useState(Math.min(initialCount, Math.max(1, maxCount)));
    const initialDifficulties=(initialFilters?.difficulty||[]).map(Number).filter((n:number)=>Number.isInteger(n)&&n>=1&&n<=10);
    const [minDiff, setMinDiff] = useState(initialDifficulties.length?Math.min(...initialDifficulties):1);
    const [maxDiff, setMaxDiff] = useState(initialDifficulties.length?Math.max(...initialDifficulties):10);
    const [generating, setGenerating] = useState(false);
    const [facets,setFacets] = useState<{subject:string;unit:string}[]>([]);
    const [facetsLoading,setFacetsLoading] = useState(true);
    const [facetsError,setFacetsError] = useState('');
    const selectionKey = selectedDbs.map(db=>typeof db==='string'?db:db.id).join(',')+'|'+(initialFilters?.mockSlug||'');
    useEffect(()=>{
        const controller=new AbortController();setFacetsLoading(true);setFacetsError('');
        fetch('/api/questions/facets',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({selectedDbs,includeOffCurriculum,mockSlug:initialFilters?.mockSlug})})
          .then(async res=>{const data=await res.json();if(!res.ok||!data.success)throw new Error('출제 가능한 단원을 불러오지 못했습니다.');setFacets(data.data||[]);})
          .catch(e=>{if(e.name!=='AbortError')setFacetsError(e.message);})
          .finally(()=>{if(!controller.signal.aborted)setFacetsLoading(false);});
        return ()=>controller.abort();
    },[selectionKey,includeOffCurriculum]);
    const subjects=Array.from(new Set(facets.map(f=>f.subject).filter(Boolean)));
    const units=Array.from(new Set(facets.filter(f=>!subject||f.subject===subject).map(f=>f.unit).filter(Boolean)));


    useEffect(() => {
        if(ignoreSavedDraft)return;
        try {
            const raw = sessionStorage.getItem('mathetf_autogen_draft');
            const d = raw ? JSON.parse(raw) : null;
            if (d && d.scopeKey===selectionKey) { setSubject(d.subject); setSelectedUnits(d.unit || []); setCount(Math.min(d.count, maxCount)); setMinDiff(d.minDifficulty); setMaxDiff(d.maxDifficulty); }
        } catch { }
    }, [maxCount,selectionKey,ignoreSavedDraft]);

    const toggleUnit = (u: string) => {
        if (selectedUnits.includes(u)) {
            setSelectedUnits(prev => prev.filter(item => item !== u));
        } else {
            setSelectedUnits(prev => [...prev, u]);
        }
    };

    const handleSubmit = async () => {
        if(requestRef.current&&!requestRef.current.signal.aborted)return;
        const request=new AbortController();requestRef.current=request;
        setGenerating(true);setMessage('');setAuthNeeded(false);
        try {
            const criteria = {
                scopeKey:selectionKey, mockSlug:initialFilters?.mockSlug, subject,
                unit: selectedUnits.length > 0 ? selectedUnits : undefined,
                minDifficulty: minDiff,
                maxDifficulty: maxDiff,
                count, selectedDbs, excludedQuestionIds, includeOffCurriculum
            };

            try { sessionStorage.setItem('mathetf_autogen_draft', JSON.stringify(criteria)); } catch { }
            const res = await fetch('/api/pro/auto-generate', {
                method: 'POST', signal:request.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(criteria),
            });

            // 미로그인 → 회원가입 페이지로 이동
            if (res.status === 401) {
                setAuthNeeded(true);logQuestionBankEvent('qb_auth_request');
                return;
            }

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || '생성 실패');
            if (data.questions && data.questions.length > 0) {
                const detail=await fetch('/api/questions/by-ids',{method:'POST',signal:request.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:data.questions.map((q:any)=>q.id)})});
                const loaded=await detail.json();if(!detail.ok||loaded.data?.length!==data.questions.length)throw Error('문항 원본을 불러오지 못했습니다. 기존 시험지는 유지됩니다. 다시 시도해주세요.');
                if(request.signal.aborted)return;
                const byId=new Map(loaded.data.map((q:any)=>[q.id,q]));
                const complete=data.questions.map((q:any)=>byId.get(q.id));
                logQuestionBankEvent('qb_auto_generate',{question_count:data.questions.length});
                onGenerate(complete,data.questions.length<count?`조건에 맞는 ${data.questions.length}문항을 담았습니다. 요청한 ${count}문항보다 적으며 선택 범위는 유지했습니다.`:undefined);
                onClose();
            } else {
                setMessage('조건에 맞는 문항이 없습니다. 자료·단원·난이도 또는 중복 제외 조건을 조정해주세요.');
            }
        } catch (e) {
            if(request.signal.aborted)return;
            console.error(e);
            setMessage(e instanceof Error ? e.message : '생성 실패');
        } finally {
            requestRef.current=null;setGenerating(false);
        }
    };

    const hasUnits = units.length>0;

    return (
        <div role="dialog" aria-modal="true" aria-label="자동 출제 설정"
            className="product-modal fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center animate-in fade-in duration-200"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white w-full sm:w-[440px] sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90dvh] sm:max-h-[90vh]">
                {/* 모바일 드래그 핸들 */}
                <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
                    <div className="w-10 h-1 rounded-full bg-slate-300" />
                </div>

                {/* 헤더 */}
                <div className="flex items-center justify-between px-6 pt-4 pb-2 flex-shrink-0">
                    <h3 className="font-bold text-xl flex items-center gap-2 text-slate-800">

                        범위에 맞춰 자동 출제
                    </h3>
                    <button
                        aria-label="자동 출제 설정 닫기" onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors text-xl font-bold"
                    >
                        ×
                    </button>
                </div>

                {/* 스크롤 가능한 본문 */}
                <div className="overflow-y-auto flex-1 px-6 pb-2">
                    <div className="space-y-5 pt-2 pb-4">
                        <p className="text-sm text-slate-600">{sourceName?`‘${sourceName}’과 같은 자료 ${selectedDbs.length}개에서 이전 문항 ${excludedQuestionIds.length}개를 제외합니다. 취소하면 현재 시험지가 유지됩니다.`:`선택한 자료 ${selectedDbs.length}개 안에서 출제합니다. 이미 담은 문항은 제외합니다.`}</p>
                        {facetsLoading && <p role="status" className="text-sm text-slate-500">출제 가능한 단원을 확인하고 있습니다.</p>}{facetsError && <p role="alert" className="text-sm text-red-600">{facetsError}</p>}
                        {message&&<p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm">{message}</p>}{authNeeded&&<div role="status" className="rounded-lg bg-brand-50 p-3 text-sm"><p>고른 조건은 보관했습니다. 로그인 후 이 화면에서 이어서 출제할 수 있습니다.</p><a className="mt-2 block font-bold underline" href={questionBankLoginUrl()}>로그인하고 계속하기</a></div>}
                        {/* Subject Selection */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">과목</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['',...subjects].map(sub => (
                                    <button
                                        key={sub}
                                        onClick={() => { setSubject(sub); setSelectedUnits([]); }}
                                        className={`p-2 text-sm rounded-lg border transition-all font-medium ${subject === sub
                                            ? 'bg-brand-600 text-white border-brand-600 ring-2 ring-brand-200'
                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                            }`}
                                    >
                                        {sub || '선택 자료의 모든 과목'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Conditional Unit Selection (Multi-select) */}
                        {hasUnits && (
                            <div className="animate-in slide-in-from-top-2 duration-200">
                                <label className="block text-sm font-bold text-slate-700 mb-2 flex justify-between items-center">
                                    <span>단원 (중복 선택 가능)</span>
                                    <span className="text-xs font-normal text-brand-600">
                                        {selectedUnits.length > 0 ? `${selectedUnits.length}개 선택됨` : '전체'}
                                    </span>
                                </label>

                                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl max-h-[120px] overflow-y-auto custom-scrollbar">
                                    {units.map(u => {
                                        const isSelected = selectedUnits.includes(u);
                                        return (
                                            <button
                                                key={u}
                                                onClick={() => toggleUnit(u)}
                                                className={`px-3 py-1.5 text-xs rounded-full border transition-all font-bold ${isSelected
                                                    ? 'bg-brand-100 text-brand-700 border-brand-300'
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-brand-200 hover:text-brand-600'
                                                    }`}
                                            >
                                                {u}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Difficulty Range (1-10) */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                난이도 범위 <span className="text-brand-600 font-normal ml-1">({minDiff} ~ {maxDiff})</span>
                            </label>
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <label className="text-xs text-slate-500 block mb-1">최소</label>
                                    <select
                                        aria-label="최소 난이도" value={minDiff}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            setMinDiff(val);
                                            if (val > maxDiff) setMaxDiff(val);
                                        }}
                                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-center font-bold focus:ring-2 focus:ring-brand-500 outline-none"
                                    >
                                        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                                            <option key={n} value={n}>{n}</option>
                                        ))}
                                    </select>
                                </div>
                                <span className="text-slate-300 mt-4">~</span>
                                <div className="flex-1">
                                    <label className="text-xs text-slate-500 block mb-1">최대</label>
                                    <select
                                        aria-label="최대 난이도" value={maxDiff}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            setMaxDiff(val);
                                            if (val < minDiff) setMinDiff(val);
                                        }}
                                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-center font-bold focus:ring-2 focus:ring-brand-500 outline-none"
                                    >
                                        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                                            <option key={n} value={n}>{n}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Question Count */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                문항 수 <span className="text-slate-400 font-normal ml-1">(최대 {maxCount}문제)</span>
                            </label>
                            <input
                                aria-label="출제 문항 수" type="number"
                                min="1"
                                max={maxCount}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-brand-500 outline-none"
                                value={count}
                                onChange={e => {
                                    const val = Number(e.target.value);
                                    if (val > maxCount) setCount(maxCount);
                                    else if (val < 0) setCount(0);
                                    else setCount(val);
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* 하단 버튼 - 항상 고정 */}
                <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                    <button
                        aria-label="자동 출제 설정 닫기" onClick={onClose}
                        className="flex-1 py-3 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl font-bold transition-colors border border-slate-200"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={facetsLoading || !!facetsError || generating || count < 1 || count > maxCount || !Number.isInteger(count) || selectedDbs.length === 0}
                        className="flex-1 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                        {generating && <Loader2 size={16} className="animate-spin" />}
                        {generating ? '생성 중...' : '생성하기'}
                    </button>
                </div>
            </div>
        </div>
    );
}
