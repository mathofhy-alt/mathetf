'use client';

import { useState } from 'react';
import Link from 'next/link';
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
    if (!exams.length) return <section id="subject-exams" aria-labelledby="subject-exams-title" className="mb-8 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <h2 id="subject-exams-title" className="text-xl font-bold text-slate-900">{subject} 기출 찾기</h2>
        <p role="status" className="mt-3 text-sm leading-7 text-slate-600">학교·회차별로 제공하는 내신 시험지는 아직 없습니다. 등록된 개별 문항은 시험지 만들기에서 찾아볼 수 있습니다.</p>
        <Link href={questionBankHref({subject, origin:'subject'})} className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">{subject} 문항 찾아 출제하기 →</Link>
    </section>;
    return <section id="subject-exams" className="mb-8 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7" aria-labelledby="subject-exams-title">
        <p className="text-xs font-bold text-blue-700">학교별 시험지 모아보기</p>
        <h2 id="subject-exams-title" className="mt-2 text-xl font-bold text-slate-900">{subject} 내신 기출 찾기</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">같은 과목도 학교마다 시험 범위가 다릅니다. 회차를 고른 뒤 원본 미리보기에서 범위를 확인하세요.</p><p className="mt-1 text-xs leading-6 text-slate-500">등록된 과목 분류 기준입니다. 과거 연도 자료는 현재 분류로 연결되어 있을 수 있으므로 당시 과목·범위는 원본을 확인하세요.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <label className="text-xs font-semibold text-slate-600">학교 검색<input value={school} onChange={e=>setSchool(e.target.value)} placeholder="예: 휘문고, 숙명여고" className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"/></label>
            <label className="text-xs font-semibold text-slate-600">연도<select aria-label="연도" value={year} onChange={e=>setYear(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">전체 연도</option>{years.map(y=><option key={y} value={y}>{y}년</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">학년<select aria-label="학년" value={grade} onChange={e=>setGrade(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">전체 학년</option>{grades.map(g=><option key={g} value={g}>{g}학년</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">시험<select aria-label="시험" value={scope} onChange={e=>setScope(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">중간·기말 전체</option>{scopes.map(s=><option key={s} value={s}>{s.replace('|','학기 ')}</option>)}</select></label>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 border-b border-slate-200 pb-3"><p role="status" className="text-sm font-bold text-slate-800">조건에 맞는 자료 {filtered.length}개</p>{(scope||year||school||grade)&&<button type="button" onClick={()=>{setScope('');setYear('');setSchool('');setGrade('');}} className="text-xs font-semibold text-blue-700 underline underline-offset-4">조건 초기화</button>}</div>
        <div role="region" aria-label="시험지 검색 결과 목록" tabIndex={0} className="max-h-[680px] overflow-y-auto divide-y divide-slate-100 pr-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">{filtered.map(exam=><article key={exam.id} className="flex flex-col justify-between gap-3 py-5 sm:flex-row sm:items-center">
            <div><p className="text-xs text-slate-500">{[exam.region,exam.district].filter(Boolean).join(' ')}</p><h3 className="mt-1 text-base font-bold text-slate-900"><Link href={`/exam/${exam.id}`} className="hover:underline">{exam.school}</Link></h3><p className="mt-1 text-sm text-slate-600">{exam.year}년 {exam.grade}학년 {exam.semester}학기 {exam.examType} · {subject}</p><p className="mt-2 text-xs text-slate-500">{exam.hasFreePdf?'전체 문제 PDF 회원 무료 · 해설 제외':'무료 문제 PDF 준비 중'}{exam.hasPreview?' · 미리보기 공개':''}</p></div>
            <Link href={`/exam/${exam.id}`} className="shrink-0 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-700 hover:bg-blue-100">{exam.hasPreview?'미리보기·자료 보기':'자료 확인'} →</Link>
        </article>)}</div>
        {!filtered.length&&<p className="py-8 text-center text-sm text-slate-500">이 조건의 자료는 아직 없습니다. 학교명이나 시험 조건을 바꿔보세요.</p>}
        <p className="mt-3 border-t border-slate-100 pt-4 text-xs leading-6 text-slate-500">문제 미리보기는 로그인 없이 볼 수 있습니다. 제공 회차의 전체 문제 PDF는 회원 무료이며, 문제+해설 PDF·HWP는 별도 구매입니다. 시험지 상세 페이지에서 문항을 골라 출제로 이어갈 수 있습니다.</p>
    </section>;
}
