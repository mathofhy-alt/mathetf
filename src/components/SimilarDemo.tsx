"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, Wand2, CheckCircle2 } from 'lucide-react';

// ── 실제 유사문제 매칭 엔진(match_questions) 결과를 그대로 캡쳐한 데이터 ──
// 소스: 오금고 2025 · 공통수학1 · 이차함수(제한된 범위에서의 최대·최소)
const SOURCE = {
    subject: '공통수학1',
    unit: '이차함수',
    difficulty: 4,
    school: '오금고등학교',
    year: 2025,
    concepts: ['제한된 범위에서의 최대·최소', '이차함수의 최대·최소'],
};

const MATCHES = [
    { school: '진선여자고등학교', year: 2020, similarity: 91, concepts: ['이차함수의 최대·최소', '제한된 범위에서의 최대·최소'] },
    { school: '잠실고등학교', year: 2025, similarity: 90, concepts: ['이차함수의 최대·최소', '제한된 범위에서의 최대·최소'] },
    { school: '진선여자고등학교', year: 2024, similarity: 90, concepts: ['이차함수의 최대·최소', '제한된 범위에서의 최대·최소'] },
    { school: '휘문고등학교', year: 2025, similarity: 89, concepts: ['제한된 범위에서의 최대·최소', '이차함수 최대·최소 활용'] },
    { school: '개포고등학교', year: 2025, similarity: 88, concepts: ['제한된 범위에서의 최대·최소', '조건을 만족하는 이차함수의 최대·최소'] },
];

export default function SimilarDemo() {
    const [revealed, setRevealed] = useState(false);

    return (
        <section className="max-w-[1200px] mx-auto px-4 mb-6">
            <div className="bg-white rounded-2xl border border-[#B7D1EA] shadow-sm overflow-hidden">
                {/* 헤더 */}
                <div className="px-5 md:px-7 pt-5 md:pt-6 pb-4 border-b border-slate-100">
                    <div className="inline-flex items-center gap-1.5 bg-[#5CC6C3]/10 border border-[#5CC6C3]/30 text-[#3AADA9] text-[11px] font-bold px-2.5 py-1 rounded-full mb-2.5">
                        <Sparkles size={11} /> 실시간 유사문제 매칭
                    </div>
                    <h2 className="text-lg md:text-2xl font-extrabold text-[#1E2D4F] break-keep leading-snug">
                        기출 문제 하나로, <span className="text-[#497AB7]">같은 유형 유사문제</span>를 자동으로
                    </h2>
                    <p className="text-slate-500 text-xs md:text-sm mt-1.5 break-keep">
                        아래 기출 문제를 기준으로, 전국 기출에서 같은 유형의 문항을 찾아 시험지에 넣어드립니다.
                    </p>
                </div>

                <div className="p-5 md:p-7 grid md:grid-cols-[300px_1fr] gap-5 md:gap-7 items-start">
                    {/* 왼쪽: 소스 기출 문제 */}
                    <div>
                        <p className="text-[11px] font-bold text-[#AAAAC4] mb-2">① 기준이 되는 기출 문제</p>
                        <div className="rounded-xl border-2 border-[#497AB7] bg-[#F4F8FD] p-4">
                            <div className="flex items-center gap-1.5 flex-wrap mb-2">
                                <span className="text-[11px] font-extrabold text-white bg-[#497AB7] px-2 py-0.5 rounded">{SOURCE.subject}</span>
                                <span className="text-[11px] font-bold text-[#497AB7] bg-white border border-[#B7D1EA] px-2 py-0.5 rounded">{SOURCE.unit}</span>
                                <span className="text-[11px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">Lv.{SOURCE.difficulty}</span>
                            </div>
                            <p className="text-sm font-bold text-[#1E2D4F]">{SOURCE.school} <span className="text-[#AAAAC4] font-medium">{SOURCE.year}</span></p>
                            <div className="flex flex-wrap gap-1 mt-2">
                                {SOURCE.concepts.map((c) => (
                                    <span key={c} className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">#{c}</span>
                                ))}
                            </div>
                        </div>

                        {!revealed && (
                            <button
                                onClick={() => setRevealed(true)}
                                className="mt-3 w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#497AB7] text-white font-extrabold rounded-xl text-sm hover:bg-[#3A6599] transition-colors shadow-md"
                            >
                                <Wand2 size={16} /> 유사문제 자동 찾기
                            </button>
                        )}
                        {revealed && (
                            <div className="mt-3 flex items-center justify-center gap-1.5 text-[#3AADA9] text-xs font-bold py-2">
                                <CheckCircle2 size={14} /> 같은 유형 {MATCHES.length}문항을 찾았어요
                            </div>
                        )}
                    </div>

                    {/* 오른쪽: 매칭 결과 */}
                    <div>
                        <p className="text-[11px] font-bold text-[#AAAAC4] mb-2">② 자동으로 찾은 유사 문항 (실제 매칭 결과)</p>
                        {!revealed ? (
                            <div className="rounded-xl border border-dashed border-[#B7D1EA] bg-[#F8FAFD] h-[220px] flex flex-col items-center justify-center text-center px-6">
                                <Wand2 size={26} className="text-[#B7D1EA] mb-2" />
                                <p className="text-sm text-[#AAAAC4] font-medium break-keep">
                                    왼쪽 <strong className="text-[#497AB7]">‘유사문제 자동 찾기’</strong>를 누르면<br />
                                    같은 유형 문항이 여기에 나타나요.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {MATCHES.map((m, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                                        style={{
                                            animation: `demoFadeUp 0.45s ease ${i * 0.09}s both`,
                                        }}
                                    >
                                        {/* 유사도 */}
                                        <div className="flex flex-col items-center w-14 shrink-0">
                                            <span className="text-base font-black text-[#497AB7] leading-none">{m.similarity}%</span>
                                            <span className="text-[9px] text-[#AAAAC4] font-bold mt-0.5">유사도</span>
                                        </div>
                                        {/* 정보 */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <span className="text-[11px] font-bold text-[#497AB7] bg-[#E8F0FB] px-1.5 py-0.5 rounded">{SOURCE.unit}</span>
                                                <span className="text-[12px] font-bold text-[#1E2D4F] truncate">{m.school} <span className="text-[#AAAAC4] font-medium">{m.year}</span></span>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {m.concepts.slice(0, 2).map((c) => (
                                                    <span key={c} className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">#{c}</span>
                                                ))}
                                            </div>
                                            {/* 유사도 바 */}
                                            <div className="mt-1.5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-[#497AB7] to-[#5CC6C3] rounded-full" style={{ width: `${m.similarity}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 푸터 CTA */}
                <div className="px-5 md:px-7 py-4 bg-[#F4F8FD] border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p className="text-xs text-slate-500 break-keep text-center sm:text-left">
                        검증된 <strong className="text-[#1E2D4F]">실제 기출 문항</strong>으로 매번 새로운 시험지를 만드세요.
                    </p>
                    <Link
                        href="/question-bank"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#497AB7] text-white font-extrabold rounded-full text-sm hover:bg-[#3A6599] transition-colors shadow-sm whitespace-nowrap"
                    >
                        직접 시험지 만들기 <ArrowRight size={15} />
                    </Link>
                </div>
            </div>
        </section>
    );
}
