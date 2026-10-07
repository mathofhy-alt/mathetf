'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { SubjectHub } from '@/lib/subject-hub';
import { questionBankHref } from '@/lib/discovery';
import { matchesCatalogSearch } from '@/lib/catalog-search';

export default function SubjectExamCatalog({ exams, subject }: { exams: SubjectHub['exams']; subject: string }) {
    const [scope, setScope] = useState('');
    const [year, setYear] = useState('');
    const [school, setSchool] = useState('');
    const [grade, setGrade] = useState('');
    const years = [...new Set(exams.map(e => e.year))].sort((a,b)=>b-a);
    const grades = [...new Set(exams.map(e => e.grade))].sort((a,b)=>a-b);
    const scopes = [...new Set(exams.map(e => `${e.semester}|${e.examType}`))].sort();
    const filtered = exams.filter(e => (!scope || scope === `${e.semester}|${e.examType}`)
        && (!year || String(e.year) === year) && (!grade || String(e.grade) === grade)
        && matchesCatalogSearch({school:e.school}, school));
    if (!exams.length) return <section id="subject-exams" aria-labelledby="subject-exams-title" className="rd-wrap rd-ct-cat">
        <div className="rd-ct-empty">
            <h2 id="subject-exams-title" className="rd-s-h2sm">{subject} 기출 찾기</h2>
            <p role="status">학교·회차별로 제공하는 내신 시험지는 아직 없습니다. 등록된 개별 문항은 시험지 만들기에서 찾아볼 수 있습니다.</p>
            <Link href={questionBankHref({subject, origin:'subject'})} className="rd-btn rd-btn-primary">{subject} 문항 찾아 출제하기</Link>
        </div>
    </section>;
    return <section id="subject-exams" className="rd-wrap rd-ct-cat" aria-labelledby="subject-exams-title">
        <p className="rd-kicker">학교별 시험지 모아보기</p>
        <h2 id="subject-exams-title" className="rd-x-h2">{subject} 내신 기출 찾기</h2>
        <p className="rd-ct-catlead">같은 과목도 학교마다 시험 범위가 다릅니다. 회차를 고른 뒤 원본 미리보기에서 범위를 확인하세요.</p>
        <p className="rd-x-note rd-ct-catnote">등록된 과목 분류 기준입니다. 과거 연도 자료는 현재 분류로 연결되어 있을 수 있으므로 당시 과목·범위는 원본을 확인하세요.</p>
        <div className="rd-ct-filters">
            <label className="rd-ct-field is-search"><span>학교 검색</span><span className="rd-cat-search"><Search size={18} aria-hidden="true" /><input value={school} onChange={e=>setSchool(e.target.value)} placeholder="예: 휘문고, 숙명여고" /></span></label>
            <label className="rd-ct-field"><span>연도</span><select aria-label="연도" value={year} onChange={e=>setYear(e.target.value)} className="rd-select"><option value="">전체 연도</option>{years.map(y=><option key={y} value={y}>{y}년</option>)}</select></label>
            <label className="rd-ct-field"><span>학년</span><select aria-label="학년" value={grade} onChange={e=>setGrade(e.target.value)} className="rd-select"><option value="">전체 학년</option>{grades.map(g=><option key={g} value={g}>{g}학년</option>)}</select></label>
            <label className="rd-ct-field"><span>시험</span><select aria-label="시험" value={scope} onChange={e=>setScope(e.target.value)} className="rd-select"><option value="">중간·기말 전체</option>{scopes.map(s=><option key={s} value={s}>{s.replace('|','학기 ')}</option>)}</select></label>
        </div>
        <div className="rd-ct-count"><p role="status">조건에 맞는 자료 <b>{filtered.length}개</b></p>{(scope||year||school||grade)&&<button type="button" onClick={()=>{setScope('');setYear('');setSchool('');setGrade('');}}>조건 초기화</button>}</div>
        <div role="region" aria-label="시험지 검색 결과 목록" tabIndex={0} className="rd-ct-exams">{filtered.map(exam=><article key={exam.id} className="rd-ct-exam">
            <div className="rd-ct-examtxt"><p className="rd-ct-exloc">{[exam.region,exam.district].filter(Boolean).join(' ')}</p><h3><Link href={`/exam/${exam.id}`}>{exam.school}</Link></h3><p className="rd-ct-exmeta">{exam.year}년 {exam.grade}학년 {exam.semester}학기 {exam.examType} · {subject}</p><p className="rd-ct-exfree">{exam.hasFreePdf?<em>전체 문제 PDF 회원 무료 · 해설 제외</em>:'무료 문제 PDF 준비 중'}{exam.hasPreview?' · 미리보기 공개':''}</p></div>
            <Link href={`/exam/${exam.id}`} className="rd-btn rd-btn-gray rd-ct-exbtn">{exam.hasPreview?'미리보기·자료 보기':'자료 확인'}</Link>
        </article>)}
        {!filtered.length&&<p className="rd-ct-none">이 조건의 자료는 아직 없습니다. 학교명이나 시험 조건을 바꿔보세요.</p>}</div>
        <p className="rd-x-note rd-ct-catfoot">문제 미리보기 1쪽은 로그인 없이, 전체 쪽은 회원이 볼 수 있습니다. 제공 회차의 전체 문제 PDF는 회원 무료이며, 문제+해설 PDF·HWP는 별도 구매입니다. 시험지 상세 페이지에서 문항을 골라 출제로 이어갈 수 있습니다.</p>
    </section>;
}
