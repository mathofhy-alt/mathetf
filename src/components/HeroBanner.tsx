"use client";
import React from 'react';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { ArrowRight, BookOpen, Layers, Sparkles } from 'lucide-react';

export default function HeroBanner({ user, earnedPoints }: { user: User | null, earnedPoints: number }) {
    return (
        <div className="w-full relative mb-6 bg-white overflow-hidden shadow-sm" style={{ borderRadius: '0 0 1.5rem 1.5rem' }}>
            {/* Top accent gradient line */}
            <div className="h-1 w-full bg-gradient-to-r from-[#497AB7] via-[#5CC6C3] to-[#B7D1EA]" />

            <div className="max-w-[1200px] mx-auto px-5 py-6 md:px-6 md:py-14">
                <div className="flex flex-col md:flex-row items-center gap-5 md:gap-12">

                    {/* Left: main content */}
                    <div className="flex-1 text-center md:text-left">
                        {/* Badge */}
                        <div className="inline-flex items-center gap-1.5 bg-[#5CC6C3]/10 border border-[#5CC6C3]/30 text-[#3AADA9] text-xs font-bold px-3 py-1.5 rounded-full mb-3 md:mb-5">
                            <Sparkles size={11} />
                            개인DB 전체 무료 공개 중!
                        </div>

                        {/* Headline */}
                        <h1 className="text-2xl md:text-4xl lg:text-[2.75rem] font-extrabold text-[#1E2D4F] leading-tight mb-2 md:mb-3 break-keep">
                            전국 내신 기출문제를{' '}
                            <span className="text-[#497AB7]">한 곳에서</span>
                        </h1>

                        {/* Subtitle - 모바일에서 숨김 */}
                        <p className="hidden md:block text-slate-500 text-sm md:text-base mb-7 break-keep leading-relaxed max-w-md mx-auto md:mx-0">
                            전국 고등학교 내신 기출 자료를 즉시 다운로드하고,<br className="hidden md:block" />
                            나만의 시험지를 1분 만에 만드세요.
                        </p>
                        {/* 모바일 전용 짧은 서브타이틀 */}
                        <p className="md:hidden text-slate-500 text-xs mb-4 break-keep leading-relaxed">
                            내신 기출 즉시 다운로드 · 나만의 시험지 제작
                        </p>

                        {/* CTA Buttons */}
                        <div className="flex flex-wrap gap-2 md:gap-3 justify-center md:justify-start">
                            <Link
                                href="/question-bank"
                                className="inline-flex items-center gap-2 px-5 py-2 md:px-6 md:py-2.5 bg-[#497AB7] text-white font-bold rounded-full text-sm hover:bg-[#3A6599] transition-colors shadow-sm"
                            >
                                시험지 만들기 <ArrowRight size={15} />
                            </Link>
                            <a
                                href="#main-list"
                                className="inline-flex items-center gap-2 px-5 py-2 md:px-6 md:py-2.5 border-2 border-[#497AB7] text-[#497AB7] font-bold rounded-full text-sm hover:bg-[#497AB7]/5 transition-colors"
                            >
                                기출자료 보기
                            </a>
                        </div>
                    </div>

                    {/* Right: stat cards - 모바일에서 숨김 */}
                    <div className="hidden md:flex flex-shrink-0 flex-col gap-3 w-60">
                        <div className="bg-[#F2F3F0] rounded-2xl p-4 border border-[#B7D1EA]/40">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-[#497AB7]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <BookOpen size={20} className="text-[#497AB7]" />
                                </div>
                                <div>
                                    <p className="text-[11px] text-[#AAAAC4] font-medium">기출자료</p>
                                    <p className="text-sm font-extrabold text-[#1E2D4F]">전국 고등학교</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[#F2F3F0] rounded-2xl p-4 border border-[#5CC6C3]/30">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-[#5CC6C3]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <Layers size={20} className="text-[#5CC6C3]" />
                                </div>
                                <div>
                                    <p className="text-[11px] text-[#AAAAC4] font-medium">개인DB</p>
                                    <p className="text-sm font-extrabold text-[#1E2D4F]">지금 무료 이용 중 🎉</p>
                                </div>
                            </div>
                        </div>

                        {user && (
                            <div className="bg-gradient-to-br from-[#497AB7] to-[#5CC6C3] rounded-2xl p-4 text-white">
                                <p className="text-xs text-white/70 font-medium mb-1">누적 수익 포인트</p>
                                <p className="text-2xl font-black">
                                    {earnedPoints?.toLocaleString() ?? 0}
                                    <span className="text-sm font-medium text-white/70 ml-1">P</span>
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
