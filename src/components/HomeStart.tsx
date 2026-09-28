"use client";

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Search, Plus, School2, FileText } from 'lucide-react';
import AccessPolicy from './AccessPolicy';
import { examSeason, questionBankHref } from '@/lib/discovery';
import ThisWeekUploads from './ThisWeekUploads';
import type { WeeklyUpload } from '@/lib/home-weekly-uploads';

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

export default function HomeStart({ onSearch, onFindFreePdf, thisWeekUploads }: { onSearch: (keyword: string) => void; onFindFreePdf: () => void; thisWeekUploads: WeeklyUpload }) {
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
      <h1 id="atelier-title" className="home-service-title">고등학교 수학 기출문제 검색·시험지 만들기</h1>
      <div className="launch-board">
        <span className="launch-board-kicker">MATH ETF · PERSONAL QUESTION BANK</span>
        <div className="launch-board-message"><span className="launch-board-title">개인 DB 시험지 출제 기능</span><span className="launch-board-hello">런칭 기념 무료</span></div>
        <p>실제 학교 기출 문항을 골라 나만의 시험지를 만드세요.</p>
        <Link className="launch-board-action" href="/question-bank?demo=1&origin=home">무료로 출제 시작 <ArrowUpRight size={16}/></Link>
      </div>
      <ThisWeekUploads week={thisWeekUploads}/>
      <p className="atelier-lead">우리 학교 기출을 찾으시나요? 학교명을 입력해 전체 시험지를 확인하세요.</p>
      <form onSubmit={submit} className="atelier-search" role="search" aria-label="홈 학교 검색">
        <Search size={20} aria-hidden="true"/>
        <input aria-label="찾고 싶은 학교" value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="학교명 입력 (예: 휘문고)" autoComplete="off" maxLength={80}/>
        <button type="submit" aria-label="학교 기출 찾기"><ArrowRight size={21}/></button>
      </form>
      <div className="atelier-start-paths launch-start-paths" aria-label="원하는 작업으로 바로 시작">
        <Link href="/schools" className="atelier-start-path">
          <span className="atelier-start-icon"><School2 size={19}/></span>
          <span><strong>우리 학교 시험 찾기</strong><small>학교·학년·회차별 기출</small></span>
          <ArrowUpRight size={17} className="atelier-start-arrow"/>
        </Link>
        <button type="button" onClick={onFindFreePdf} className="atelier-start-path atelier-start-path-secondary">
          <span className="atelier-start-icon"><FileText size={19}/></span>
          <span><strong>무료 문제 PDF 찾기</strong><small>전체 문제·해설 제외·회원 무료</small></span>
          <ArrowUpRight size={17} className="atelier-start-arrow"/>
        </button>
      </div>
      <div className="atelier-opening-links"><Link href="/guide">처음이라면, 이용 가이드 <ArrowRight size={14}/></Link></div>
      {season && <Link className="atelier-season" href={questionBankHref({semester:season.semester,exam:season.exam,origin:'home'})} aria-label={`${season.label} 문항 찾기`}><span>이번 시험 준비</span><strong>{season.label}</strong><ArrowUpRight size={15}/></Link>}
    </section>
  </>;
}

export function HomeExplore() {
  return <>
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
