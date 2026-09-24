'use client';
import {useEffect,useState} from 'react';
import {Copy,RefreshCw,Download,FileText} from 'lucide-react';
import {formatFileSize} from '@/lib/discovery';
export default function RecentExams({refresh,onRestore,onCount}:{refresh:number;onRestore:(item:any,fresh:boolean)=>void|Promise<void>;onCount:(n:number)=>void}){
 const [items,setItems]=useState<any[]>([]),[count,setCount]=useState(0),[limit,setLimit]=useState(20),[error,setError]=useState(''),[busy,setBusy]=useState('');
 useEffect(()=>{let active=true;fetch('/api/questions/saved').then(async r=>{if(r.status===401)return;const d=await r.json();if(!r.ok)throw Error(d.error);if(active){setItems(d.items);setCount(d.count);setLimit(d.limit);onCount(d.count);setError('');}}).catch(()=>{if(active)setError('최근 시험지를 불러오지 못했습니다.');});return()=>{active=false;};},[refresh]);
 const restore=async(id:string,fresh:boolean)=>{setBusy(id);try{const r=await fetch(`/api/questions/saved?id=${encodeURIComponent(id)}`),d=await r.json();if(!r.ok||!d.items?.[0]?.ids?.length)throw Error('시험지 편집 정보를 불러오지 못했습니다.');await onRestore(d.items[0],fresh);}catch(e){setError((e as Error).message);}finally{setBusy('');}};
 return <section aria-label="최근 시험지" className="recent-exams text-sm"><div className="flex justify-between gap-2"><strong>최근 만든 시험지</strong><a href="/mypage" className="underline">보관함 {count}/{limit}</a></div>
 {count>=limit-2&&<p role="status" className="mt-2 text-amber-800">{count>=limit?'보관함이 가득 찼습니다.':'보관함이 곧 가득 찹니다.'} 새로 저장하기 전에 기존 파일을 받은 뒤 보관함을 정리해주세요.</p>}
 {busy&&<p role="status" className="mt-2 text-brand-700">시험지 정보를 불러오고 있습니다…</p>}{error&&<p role="alert">{error}</p>}{!items.length&&!error&&<div className="mt-2 flex flex-wrap items-center gap-2 text-slate-500"><span>완성한 시험지는 여기에 표시됩니다.</span><a href="/question-bank?demo=1&origin=saved-empty" className="font-bold text-[#285CE6] underline">기출 5문항으로 시작 →</a></div>}
 <div className="recent-grid">{items.map(item=><article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
  <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-100 bg-white text-[#426D36]"><FileText size={20} aria-hidden="true"/></span><div className="min-w-0"><p className="truncate font-semibold text-slate-800" title={item.name}>{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.count}문항 · {item.bytes?formatFileSize(item.bytes):'기존 파일'} · {item.createdAt?.slice(0,10)}</p></div></div>
  <div className="mt-4 flex flex-wrap gap-2">
   <button disabled={!!busy} onClick={()=>restore(item.id,false)} title="저장한 문항을 불러와 수정하고 새 시험지로 저장합니다" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#C5D8B5] bg-white px-4 py-2.5 text-sm font-semibold text-[#365F91] shadow-sm transition hover:bg-brand-50 hover:border-[#426D36] active:scale-[0.98] disabled:opacity-50"><Copy size={16} aria-hidden="true"/>불러와 수정</button>
   <button disabled={!!busy} onClick={()=>restore(item.id,true)} title="같은 자료와 조건에서 이전 문항을 제외해 새로 고릅니다" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#426D36] bg-[#426D36] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#31572E] active:scale-[0.98] disabled:opacity-50"><RefreshCw size={16} aria-hidden="true"/>같은 범위로 재출제</button>
   <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 active:scale-[0.98]" href={`/api/storage/download?id=${item.id}`}><Download size={16} aria-hidden="true"/>파일 받기</a>
  </div>
 </article>)}</div>
 </section>;
}
