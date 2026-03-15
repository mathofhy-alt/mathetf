import React from 'react';
import { Download, FileText, Coins, User as UserIcon, UploadCloud, Target } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, EffectFade } from 'swiper/modules';

import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/effect-fade';

export default function HeroBanner({ user, purchasedPoints, earnedPoints }: { user: User | null, purchasedPoints: number, earnedPoints: number }) {
    return (
        <div className="w-full relative mb-6">
            <Swiper
                modules={[Autoplay, Pagination, EffectFade]}
                effect="fade"
                fadeEffect={{ crossFade: true }}
                spaceBetween={0}
                slidesPerView={1}
                loop={true}
                autoplay={{ delay: 4000, disableOnInteraction: false }}
                pagination={{ clickable: true, dynamicBullets: true }}
                className="w-full h-[400px] md:h-[320px] rounded-bl-3xl rounded-br-3xl overflow-hidden shadow-inner"
            >
                {/* SLIDE 1: Original Design */}
                <SwiperSlide>
                    <div className="w-full h-full bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between px-4 lg:px-20 relative overflow-hidden">
                        <div className="z-10 max-w-lg lg:pl-20 mt-[-40px] md:mt-0 text-center md:text-left">
                            <h1 className="text-3xl font-bold text-slate-800 mb-2 whitespace-nowrap">
                                <span className="text-brand-600">수학기출문제</span>를 공유하고 다운받으세요!
                            </h1>
                            <p className="text-slate-600 text-lg mb-6 break-keep">
                                기출문제 등록 시, 일정 수익을 포인트로 적립받을 수 있습니다.
                            </p>
                        </div>
                        {/* Right Illustration */}
                        <div className="absolute right-0 bottom-0 top-0 w-1/2 bg-[url('https://as2.ftcdn.net/v2/jpg/03/04/54/22/1000_F_304542234_P5iA4tXgI0qg5t5b5k5c5d5e5f5g5h5.jpg')] bg-contain bg-no-repeat bg-right-bottom opacity-10 pointer-events-none"></div>
                        <div className="absolute right-[30%] top-1/2 -translate-y-1/2 hidden lg:block opacity-60">
                            <div className="w-64 h-48 relative">
                                <div className="absolute right-4 bottom-4 w-32 h-40 bg-blue-600 rounded-lg transform rotate-3 opacity-20"></div>
                                <div className="absolute right-0 bottom-0 w-32 h-40 bg-white border-2 border-slate-200 rounded-lg shadow-xl flex flex-col items-center justify-center p-4">
                                    <div className="w-16 h-16 bg-blue-100 rounded-full mb-3 flex items-center justify-center">
                                        <FileText className="text-blue-500" size={32} />
                                    </div>
                                    <div className="w-20 h-2 bg-slate-100 rounded mb-2"></div>
                                    <div className="w-16 h-2 bg-slate-100 rounded"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </SwiperSlide>

                {/* SLIDE 2: Upload AD */}
                <SwiperSlide>
                    <div className="w-full h-full bg-gradient-to-r from-emerald-50 to-teal-50 flex items-center justify-between px-4 lg:px-20 relative overflow-hidden">
                        <div className="z-10 max-w-lg lg:pl-20 mt-[-40px] md:mt-0 text-center md:text-left">
                            <h1 className="text-3xl font-bold text-slate-800 mb-2 break-keep">
                                나만의 <span className="text-emerald-600">고퀄리티 문항</span>으로 수익 창출!
                            </h1>
                            <p className="text-slate-600 text-lg mb-6 break-keep">
                                학원 선생님, 강사님의 소중한 내신 대비 자료를 업로드하고 부수입을 만드세요.
                            </p>
                        </div>
                        <div className="absolute right-[30%] top-1/2 -translate-y-1/2 hidden lg:flex items-center justify-center opacity-60">
                            <div className="w-40 h-40 rounded-full bg-emerald-100 flex items-center justify-center relative animate-pulse">
                                <div className="absolute -top-4 -right-4 w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg animate-bounce">
                                    <Coins className="text-white" size={24} />
                                </div>
                                <UploadCloud className="text-emerald-500" size={64} />
                            </div>
                        </div>
                    </div>
                </SwiperSlide>

                {/* SLIDE 3: Quality AD */}
                <SwiperSlide>
                    <div className="w-full h-full bg-gradient-to-r from-purple-50 to-fuchsia-100 flex items-center justify-between px-4 lg:px-20 relative overflow-hidden">
                        <div className="z-10 max-w-lg lg:pl-20 mt-[-40px] md:mt-0 text-center md:text-left">
                            <h1 className="text-3xl font-bold text-slate-800 mb-2 break-keep">
                                <span className="text-purple-600">대치동 퀄리티</span>의 변형 문제 즉시 제공
                            </h1>
                            <p className="text-slate-600 text-lg mb-6 break-keep">
                                꼼꼼하게 정제된 고품질 한글(HWP) 및 PDF 양식으로 바로 수업에 활용하세요.
                            </p>
                        </div>
                        <div className="absolute right-[30%] top-1/2 -translate-y-1/2 hidden lg:flex items-center justify-center opacity-60">
                            <div className="relative w-48 h-48">
                                <Target className="text-purple-400 absolute inset-0 w-full h-full animate-[spin_10s_linear_infinite]" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Download className="text-purple-600" size={48} />
                                </div>
                            </div>
                        </div>
                    </div>
                </SwiperSlide>
            </Swiper>

            {/* Floating Stats Bar (Absolutely positioned ON TOP of the carousel) */}
            <div className="absolute bottom-6 md:bottom-1/2 md:translate-y-1/2 left-1/2 -translate-x-1/2 md:left-auto md:-translate-x-0 md:right-8 lg:right-40 z-20 w-[90%] md:w-auto">
                <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white p-6 min-w-[340px] flex flex-col gap-5">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                            <UserIcon size={20} className="text-slate-500" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-400 font-medium">환영합니다</span>
                            <span className="text-sm font-bold text-slate-800">
                                {user ? `${user.email?.split('@')[0]}님` : '로그인이 필요합니다'}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Purchased Points */}
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col gap-1 transition-all hover:border-slate-300">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                                충전 포인트
                            </div>
                            <div className="text-lg font-black text-slate-800 tracking-tight text-right">
                                {user ? (purchasedPoints?.toLocaleString() ?? 0) : '0'} <span className="text-xs font-medium text-slate-400">P</span>
                            </div>
                        </div>

                        {/* Earned Points */}
                        <div className="bg-brand-50/50 rounded-xl p-3 border border-brand-100 flex flex-col gap-1 transition-all hover:border-brand-300">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-brand-600 mb-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-brand-500"></div>
                                수익 포인트
                            </div>
                            <div className="text-lg font-black text-brand-700 tracking-tight text-right">
                                {user ? (earnedPoints?.toLocaleString() ?? 0) : '0'} <span className="text-xs font-medium text-brand-400">P</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Global style override for swiper pagination positioning */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .swiper-pagination-bullet-active {
                    background-color: #4f46e5 !important;
                }
                .swiper-pagination {
                    bottom: 15px !important;
                    width: 50% !important;
                    left: 25% !important;
                }
                @media (max-width: 768px) {
                    .swiper-pagination {
                        bottom: auto !important;
                        top: 20px !important;
                    }
                }
            `}} />
        </div>
    );
}
