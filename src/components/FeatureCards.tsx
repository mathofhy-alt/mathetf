"use client";
import React from 'react';
import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import { Search, Wand2, Sparkles, School, Gift, Crop, ArrowRight } from 'lucide-react';

/**
 * 홈 히어로 아래 "무엇을 하는 서비스인지" 한눈에 보여주는 기능 카드.
 * 카드마다 다른 색(컬러 그라데이션). 기존 기출 카탈로그는 이 섹션 아래에 그대로 유지 → SEO 영향 없음.
 */
export default function FeatureCards({ user }: { user: User | null }) {
    const cards = [
        {
            icon: Search, title: '내신기출 검색·다운로드', badge: '미리보기 무료',
            desc: '전국 학교 기출을 찾아 문제·해설 PDF·HWP로. 미리보기는 무료예요.',
            href: '#main-list', grad: 'from-[#3F72B5] to-[#5B93D6]',
        },
        {
            icon: Wand2, title: '시험지 출제', badge: '핵심',
            desc: '전국 기출 DB에서 문제를 골라 나만의 시험지를 직접 만들어요.',
            href: '/question-bank', grad: 'from-[#463F86] to-[#6E5FB5]',
        },
        {
            icon: Sparkles, title: '예상문제 뽑아보기', badge: 'HOT',
            desc: '조건과 유형이 맞는 기존 기출문항을 추천받아 시험지에 담습니다.',
            href: '/predict', grad: 'from-[#23837F] to-[#33A39E]',
        },
        {
            icon: School, title: '학교별 기출 모음', badge: '',
            desc: '우리 학교 수학 기출을 학교별로 한 곳에 모아 정리했어요.',
            href: '/schools', grad: 'from-[#C94E7E] to-[#E36C9C]',
        },
        {
            icon: Gift, title: '가입하면 문제 PDF 무료', badge: '무료',
            desc: '제공되는 회차의 문제 PDF는 회원당 하루 10회 무료입니다. 해설 파일은 별도 구매입니다.',
            href: user ? '#main-list' : '/signup', grad: 'from-[#BE7A1C] to-[#D89328]',
        },
        {
            icon: Crop, title: '프린트와 비슷한 기출 찾기', badge: 'NEW',
            desc: '학교에서 받은 프린트를 올리고 문제를 잘라내면, 같은 유형의 기존 기출문제를 찾아드립니다.',
            href: '/print-transform', grad: 'from-[#23864A] to-[#33AC63]',
        },
    ];

    return (
        <section className="max-w-[1200px] mx-auto px-5 md:px-6 mb-8">
            <div className="text-center mb-5">
                <h2 className="text-xl md:text-2xl font-extrabold text-[#294437] break-keep">
                    기출 검색만 하고 끝내지 마세요
                </h2>
                <p className="text-slate-500 text-sm mt-1.5 break-keep">
                    전국 내신 기출로 <strong className="text-[#5B53A0]">나만의 시험지</strong>까지 — 수학ETF가 하는 일이에요.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {cards.map((c) => {
                    const Icon = c.icon;
                    const inner = (
                        <div className={`group h-full rounded-2xl p-5 text-white bg-gradient-to-br ${c.grad} shadow-md transition-all hover:shadow-xl hover:-translate-y-0.5`}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                                    <Icon size={22} className="text-white" />
                                </div>
                                {c.badge && (
                                    <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-white/25 text-white border border-white/30">
                                        {c.badge}
                                    </span>
                                )}
                            </div>
                            <h3 className="text-base font-extrabold mb-1.5 flex items-center gap-1 text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.28)' }}>
                                {c.title}
                                <ArrowRight size={15} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                            </h3>
                            <p className="text-[13px] leading-relaxed break-keep text-white font-medium" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.22)' }}>
                                {c.desc}
                            </p>
                        </div>
                    );
                    return c.href.startsWith('#')
                        ? <a key={c.title} href={c.href} className="block h-full">{inner}</a>
                        : <Link key={c.title} href={c.href} className="block h-full">{inner}</Link>;
                })}
            </div>
        </section>
    );
}
