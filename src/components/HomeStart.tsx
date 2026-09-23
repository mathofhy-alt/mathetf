"use client";

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Search, Plus } from 'lucide-react';
import AccessPolicy from './AccessPolicy';
import { examSeason, questionBankHref } from '@/lib/discovery';

const collections = [
  { id: 'school', number: '01', href: '/schools', title: <>우리 학교의<br/>지난 시험.</>, label: '학교별 기출', detail: '학교와 지역으로 찾아보기', english: 'THE SCHOOL ARCHIVE', color: 'forest' },
  { id: 'unit', number: '02', href: '/question-bank', title: <>하나의 단원,<br/>깊이 있게.</>, label: '단원별 출제', detail: '단원과 난이도로 문제 고르기', english: 'A STUDY IN MATHEMATICS', color: 'cream' },
  { id: 'mock', number: '03', href: '/모의고사', title: <>더 넓은<br/>수학의 세계.</>, label: '모의고사', detail: '학년과 회차별로 살펴보기', english: 'BEYOND THE CLASSROOM', color: 'clay' },
  { id: 'make', number: '04', href: '/question-bank?demo=1&origin=home', title: <>나의 다음<br/>한 페이지.</>, label: '시험지 만들기', detail: '기출 5문항으로 시작하기', english: 'YOUR NEXT CHAPTER', color: 'lime' },
];

function CoverDrawing({ type }: { type: string }) {
  return <svg viewBox="0 0 200 145" fill="none" className="shelf-cover-art" aria-hidden="true">
    {type === 'school' && <>{Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${32+i*9} 131V${69-i*7}A${68-i*9} ${68-i*9} 0 0 1 ${168-i*9} ${69-i*7}V131`} stroke="currentColor" strokeWidth=".85"/>)}<path d="M20 132H180" stroke="currentColor" strokeWidth=".7"/></>}
    {type === 'unit' && <><path d="M25 120H175M100 134V10" stroke="currentColor" opacity=".35"/>{Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${34+i*3} 18Q100 ${215-i*15} ${166-i*3} 18`} stroke="currentColor" strokeWidth=".8"/>)}<circle cx="100" cy="116" r="3" fill="currentColor"/></>}
    {type === 'mock' && <>{[0,30,60,90,120,150].map(angle=><ellipse key={angle} cx="100" cy="74" rx="69" ry="27" transform={`rotate(${angle} 100 74)`} stroke="currentColor" strokeWidth=".8"/>)}<circle cx="100" cy="74" r="4" fill="currentColor"/></>}
    {type === 'make' && <>{Array.from({ length: 7 },(_,i)=><rect key={i} x={48+i*4} y={21+i*5} width="80" height="99" rx="1" transform={`rotate(${-20+i*5} 100 73)`} fill="none" stroke="currentColor" strokeWidth=".8"/>)}<path d="M91 67H115M103 55V79" stroke="currentColor" strokeWidth="1.4"/></>}
  </svg>;
}

export default function HomeStart({ onSearch }: { onSearch: (keyword: string) => void }) {
  const [keyword, setKeyword] = useState('');
  const [season, setSeason] = useState<ReturnType<typeof examSeason> | null>(null);
  useEffect(() => {
    const update = () => setSeason(examSeason());
    update();
    window.addEventListener('focus', update);
    return () => window.removeEventListener('focus', update);
  }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(keyword.trim());
  }
  return <>
    <section className="atelier-opening" aria-labelledby="atelier-title">
      <div className="atelier-edition"><span>수학을 위한 작은 서재</span><span className="atelier-edition-mark" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1v22M1 12h22M4.2 4.2l15.6 15.6M4.2 19.8 19.8 4.2"/></svg></span><span>THE MATH LIBRARY</span></div>
      <h1 id="atelier-title">고르는 즐거움.<br/><span>완성하는 <i>수학.</i></span></h1>
      <p className="atelier-lead">한 번의 시험부터, 매일의 연습까지.<br className="atelier-mobile-break"/> 좋은 문제를 모아 당신만의 한 장을 만드세요.</p>
      <form onSubmit={submit} className="atelier-search" role="search" aria-label="홈 학교 검색">
        <Search size={20} aria-hidden="true"/>
        <input aria-label="찾고 싶은 학교" value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="어느 학교의 기출을 찾으세요?" autoComplete="off" maxLength={80}/>
        <button type="submit" aria-label="학교 기출 찾기"><ArrowRight size={21}/></button>
      </form>
      <div className="atelier-opening-links"><Link href="/question-bank?demo=1&origin=home">기출 5문항으로 시작 <ArrowUpRight size={15}/></Link><span aria-hidden="true"/><Link href="/guide">처음이라면, 이용 가이드 <ArrowRight size={14}/></Link></div>
      <p className="atelier-no-login">문항 미리보기는 로그인 없이.</p>
      {season && <Link className="atelier-season" href={questionBankHref({semester:season.semester,exam:season.exam,origin:'home'})} aria-label={`${season.label} 문항 찾기`}><span>이번 시험 준비</span><strong>{season.label}</strong><ArrowUpRight size={15}/></Link>}
    </section>
    <section className="shelf-section" aria-label="수학 자료 컬렉션">
      <div className="shelf-caption"><span>THE COLLECTION</span><p>어떤 수학을 펼쳐볼까요?</p><span>01 — 04</span></div>
      <div className="shelf-stage">
        <div className="shelf-books">{collections.map(book=><Link key={book.id} href={book.href} className={`shelf-item shelf-${book.color}`} aria-label={`${book.label} — ${book.detail}`}>
          <div className="shelf-book">
            <div className="shelf-book-cover">
              <div className="shelf-book-top"><span>수학ETF</span><span>VOL. {book.number}</span></div>
              <h2>{book.title}</h2>
              <CoverDrawing type={book.id}/>
              <div className="shelf-book-bottom"><span>{book.english}</span><span>{book.number}</span></div>
            </div>
          </div>
          <div className="shelf-item-label"><span>{book.label}</span><ArrowUpRight size={16}/></div>
          <p>{book.detail}</p>
        </Link>)}</div>
      </div>
    </section>
    <section className="atelier-method" aria-label="시험지 제작 방법">
      <div className="atelier-method-title"><span>당신이 고르면,<br/><strong>한 장이 됩니다.</strong></span><Link href="/question-bank">시험지 바로 만들기 <ArrowUpRight size={16}/></Link></div>
      <ol><li><span>01</span><div><strong>발견하다.</strong><p>학교, 단원, 난이도로<br/>지금 필요한 문제를 찾고.</p></div></li><li><span>02</span><div><strong>엮어내다.</strong><p>마음에 드는 문항을 골라<br/>나만의 순서로 정리하고.</p></div></li><li><span>03</span><div><strong>완성하다.</strong><p>편집 가능한 한글 파일로<br/>수업과 연습을 준비하세요.</p></div></li></ol>
    </section>
    <div className="atelier-access"><Plus size={14}/><AccessPolicy compact/></div>
  </>;
}
