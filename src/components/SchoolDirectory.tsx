'use client';
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {schoolMatches} from '@/lib/discovery';
export default function SchoolDirectory({rows}:{rows:{name:string;region:string;count:number}[]}){
 const [q,setQ]=useState(''),[region,setRegion]=useState('');
 useEffect(()=>{const p=new URLSearchParams(window.location.search);setQ(p.get('q')||'');setRegion(p.get('region')||'');},[]);
 const regions=useMemo(()=>[...new Set(rows.map(s=>s.region.split(' ')[0]).filter(Boolean))].sort(),[rows]);
 const found=rows.filter(s=>schoolMatches(s.name,q)&&(!region||s.region.startsWith(region)));
 const update=(query:string,area:string)=>{setQ(query);setRegion(area);const p=new URLSearchParams();if(query)p.set('q',query);if(area)p.set('region',area);window.history.replaceState(null,'',`/schools${p.size?'?'+p:''}`);};
 return <section className="school-directory mt-6"><div className="grid sm:grid-cols-[1fr_12rem] gap-3"><label className="text-sm">학교명 또는 초성<input value={q} onChange={e=>update(e.target.value,region)} placeholder="예: 하나고 또는 ㅎㄴㄱ" className="mt-1 block w-full p-3 border rounded-xl"/></label><label className="text-sm">지역<select value={region} onChange={e=>update(q,e.target.value)} className="mt-1 block w-full p-3 border rounded-xl"><option value="">전체 지역</option>{regions.map(r=><option key={r}>{r}</option>)}</select></label></div>
 <p className="my-4 text-sm" role="status">자료 보유 {rows.length}개 학교 중 {found.length}개</p>
 <div className="school-grid">{found.map(s=><Link key={s.name} href={`/school/${encodeURIComponent(s.name)}`} className="school-card"><span className="school-monogram" aria-hidden="true">{s.name.slice(0,1)}</span><div><strong>{s.name}</strong><p className="text-sm text-slate-500">{s.region||'지역 정보 확인 중'} · 기출 {s.count}회차</p></div><span className="school-arrow" aria-hidden="true">↗</span></Link>)}</div>
 {!found.length&&<p className="rounded-xl bg-white p-6">일치하는 학교가 없습니다. 검색어나 지역을 바꿔보세요. <button className="underline" onClick={()=>update('','')}>전체 학교 보기</button></p>}</section>;
}
