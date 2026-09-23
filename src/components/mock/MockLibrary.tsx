"use client";
import {useMemo,useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight,Search} from 'lucide-react';
import MockExamCard,{MockExam,MockCategory,MOCK_CATEGORIES} from './MockExamCard';
const ORDER:MockCategory[]=['수능','평가원','전국연합','경찰대','사관학교'];
export default function MockLibrary({exams}:{exams:MockExam[]}){
 const [category,setCategory]=useState('전체');const [grade,setGrade]=useState('');const [year,setYear]=useState('');const [query,setQuery]=useState('');
 const years=useMemo(()=>[...new Set(exams.map(e=>e.year))].sort((a,b)=>b-a),[exams]);
 const grades=useMemo(()=>[...new Set(exams.map(e=>e.grade).filter(Boolean))].sort(),[exams]);
 const filtered=useMemo(()=>exams.filter(e=>(category==='전체'||e.category===category)&&(!grade||e.grade===grade)&&(!year||String(e.year)===year)&&(!query.trim()||e.title.includes(query.trim()))).sort((a,b)=>b.year-a.year||b.month-a.month),[exams,category,grade,year,query]);
 return <><nav className="mock-collections" aria-label="모의고사 종류">{ORDER.map((key,i)=><button key={key} aria-pressed={category===key} onClick={()=>setCategory(category===key?'전체':key)}><span className="mock-collection-top">0{i+1}<ArrowUpRight size={17}/></span><span className="mock-collection-symbol" aria-hidden="true">{MOCK_CATEGORIES[key].glyph}</span><strong>{MOCK_CATEGORIES[key].label}</strong><small>{exams.filter(e=>e.category===key).length}회차</small></button>)}</nav>
 <section className="mock-browser" aria-label="모의고사 찾기"><div className="mock-browser-heading"><div><p className="suite-eyebrow">BROWSE BY EXAM</p><h2>나에게 맞는 회차 찾기.</h2></div><button className="suite-reset" onClick={()=>{setCategory('전체');setGrade('');setYear('');setQuery('');}}>조건 초기화</button></div>
 <div className="mock-filter"><label><Search size={17}/><input aria-label="모의고사 제목 검색" placeholder="시험 이름이나 월로 검색" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="모의고사 학년" value={grade} onChange={e=>setGrade(e.target.value)}><option value="">모든 학년</option>{grades.map(g=><option key={g}>{g}</option>)}</select><select aria-label="모의고사 연도" value={year} onChange={e=>setYear(e.target.value)}><option value="">모든 연도</option>{years.map(y=><option key={y} value={y}>{y}년</option>)}</select></div>
 <div className="mock-count" role="status"><span>{category} · {filtered.length}회차</span>{category!=='전체'&&<Link href={`/모의고사/${category}`}>{category} 출제 경향과 자료 <ArrowUpRight size={13}/></Link>}</div>
 {filtered.length?<div className="mock-result-grid">{filtered.map(exam=><MockExamCard key={exam.slug} exam={exam}/>)}</div>:<div className="suite-empty"><h3>조건에 맞는 회차가 없습니다.</h3><p>학년이나 연도를 바꾸거나 조건을 초기화해 주세요.</p></div>}
 </section></>;
}
