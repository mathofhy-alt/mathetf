"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface Slide { badge: string; emoji: string; glyph: string; title: string; sub: string; cta: string; href: string; grad: string; }

const SLIDES: Slide[] = [
    { badge: 'EVENT', emoji: '🎉', glyph: '∑', title: '런칭 기념 — 전 기출 DB 무료', sub: '지금 가입하면 문제·해설까지 모두 무료로 이용하세요', cta: '무료로 시작', href: '/signup', grad: 'from-[#3A6CAE] via-[#3E8FB0] to-[#3AADA9]' },
    { badge: 'AI', emoji: '✨', glyph: '∫', title: '예상문제 뽑아보기', sub: '우리 학교 출제 스타일로 변형문제를 1분 만에', cta: '예상문제 만들기', href: '/predict', grad: 'from-[#463F86] via-[#5A4FA6] to-[#6E5FB5]' },
    { badge: 'NEW', emoji: '✂️', glyph: 'π', title: '학교프린트 변형만들기', sub: '받은 프린트를 올리고 잘라내면 같은 유형 변형문제 자동 생성', cta: '써보기', href: '/print-transform', grad: 'from-[#1F7A47] via-[#269457] to-[#33AC63]' },
    { badge: '기출', emoji: '📚', glyph: '√', title: '전국 내신 기출 + 유사문제', sub: '검증된 실제 기출로 나만의 시험지를 1분에 완성', cta: '기출 보기', href: '#main-list', grad: 'from-[#2C7FB5] via-[#3597BE] to-[#46B0C7]' },
];

export default function PromoCarousel({ user }: { user: User | null }) {
    const [i, setI] = useState(0);
    const [paused, setPaused] = useState(false);
    const n = SLIDES.length;

    const slides = SLIDES.map((s, idx) =>
        idx === 0 && user
            ? { ...s, title: '런칭 기념 — 전 기출 DB 무료 이용 중', sub: '예상문제·시험지 만들기까지 모두 무료예요', cta: '시험지 만들기', href: '/question-bank' }
            : s
    );

    useEffect(() => {
        if (paused) return;
        const t = setInterval(() => setI((p) => (p + 1) % n), 4000);
        return () => clearInterval(t);
    }, [paused, n, i]);

    const go = (d: number) => setI((p) => (p + d + n) % n);

    return (
        <div className="max-w-[1200px] mx-auto px-4 pt-4 pb-1">
            <h1 className="sr-only">수학ETF — 전국 기출 기반 유사문제·예상문제로 나만의 수학 시험지 제작</h1>
            <div className="group relative overflow-hidden rounded-[1.75rem] shadow-lg ring-1 ring-black/5"
                onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>

                {/* 슬라이드 트랙 */}
                <div className="flex transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ transform: `translateX(-${i * 100}%)` }}>
                    {slides.map((s, k) => (
                        <div key={k} className={`min-w-full relative overflow-hidden bg-gradient-to-br ${s.grad} text-white isolate`}>
                            {/* 데코: 글로우 오브 */}
                            <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-white/20 blur-3xl pointer-events-none" />
                            <div className="absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-black/10 blur-3xl pointer-events-none" />
                            {/* 데코: 큰 수학기호 워터마크 */}
                            <span className="absolute -right-2 -bottom-12 text-[170px] leading-none font-black text-white/10 select-none pointer-events-none italic">{s.glyph}</span>
                            {/* 데코: 미세 격자 */}
                            <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />

                            <div className="relative flex items-center justify-between gap-4 px-6 py-8 md:px-12 md:py-11 min-h-[150px] md:min-h-[190px]">
                                <div className="min-w-0">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold tracking-wide bg-white/20 border border-white/30 backdrop-blur-sm px-2.5 py-1 rounded-full">
                                        {s.badge}
                                    </span>
                                    <h2 className="text-xl sm:text-2xl md:text-[2rem] font-black break-keep mt-2.5 leading-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.22)' }}>
                                        {s.title}
                                    </h2>
                                    <p className="text-white/90 text-sm md:text-base mt-1.5 break-keep" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                                        {s.sub}
                                    </p>
                                    <Link href={s.href} className="inline-flex items-center gap-1.5 mt-4 bg-white text-[#1E2D4F] font-extrabold px-5 py-2.5 rounded-full text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
                                        {s.cta} <ArrowRight size={15} />
                                    </Link>
                                </div>
                                {/* 글래스 아이콘 */}
                                <div className="hidden sm:flex flex-shrink-0 w-20 h-20 md:w-24 md:h-24 rounded-3xl bg-white/15 border border-white/25 backdrop-blur-sm items-center justify-center text-4xl md:text-5xl shadow-inner">
                                    {s.emoji}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* 상단 진행바 */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-white/20">
                    {!paused && <div key={i} className="promo-bar h-full bg-white/80" />}
                </div>

                {/* 좌우 화살표 (호버 시) */}
                <button onClick={() => go(-1)} aria-label="이전"
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/20 hover:bg-black/35 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                    <ChevronLeft size={20} />
                </button>
                <button onClick={() => go(1)} aria-label="다음"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/20 hover:bg-black/35 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                    <ChevronRight size={20} />
                </button>

                {/* 하단 점 */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {slides.map((_, k) => (
                        <button key={k} onClick={() => setI(k)} aria-label={`슬라이드 ${k + 1}`}
                            className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/70'}`} />
                    ))}
                </div>
            </div>
        </div>
    );
}
