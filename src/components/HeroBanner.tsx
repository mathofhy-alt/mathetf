import React from 'react';
import { Download, FileText, Coins, User as UserIcon } from 'lucide-react';
import { User } from '@supabase/supabase-js';

export default function HeroBanner({ user, purchasedPoints, earnedPoints }: { user: User | null, purchasedPoints: number, earnedPoints: number }) {
    return (
        <div className="w-full bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 mb-6">
            <div className="max-w-[1200px] mx-auto px-4 py-8 md:py-10 flex items-center justify-between relative overflow-hidden">

                {/* Left Text Content */}
                <div className="z-10 max-w-lg">
                    <h1 className="text-3xl font-bold text-slate-800 mb-2 whitespace-nowrap">
                        <span className="text-brand-600">수학기출문제</span>를 공유하고 다운받으세요!
                    </h1>
                    <p className="text-slate-600 text-lg mb-6">
                        기출문제 등록 시, 일정 수익을 포인트로 적립받을 수 있습니다.
                    </p>

                    {/* Stats Bar (Floating look) */}
                    <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-6 min-w-[340px] flex flex-col gap-5">
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

                {/* Right Illustration Area (Abstract shapes) */}
                <div className="absolute right-0 bottom-0 top-0 w-1/2 bg-[url('https://as2.ftcdn.net/v2/jpg/03/04/54/22/1000_F_304542234_P5iA4tXgI0qg5t5b5k5c5d5e5f5g5h5.jpg')] bg-contain bg-no-repeat bg-right-bottom opacity-10 pointer-events-none">
                    {/* Placeholder for actual illustration */}
                </div>
                <div className="absolute right-20 top-1/2 -translate-y-1/2 hidden lg:block">
                    {/* SVG Illustration Representation */}
                    <div className="w-64 h-48 relative">
                        <div className="absolute right-4 bottom-4 w-32 h-40 bg-blue-600 rounded-lg transform rotate-3 opacity-20"></div>
                        <div className="absolute right-0 bottom-0 w-32 h-40 bg-white border-2 border-slate-200 rounded-lg shadow-xl flex flex-col items-center justify-center p-4">
                            <div className="w-16 h-16 bg-blue-100 rounded-full mb-3 flex items-center justify-center">
                                <FileText className="text-blue-500" size={32} />
                            </div>
                            <div className="w-20 h-2 bg-slate-100 rounded mb-2"></div>
                            <div className="w-16 h-2 bg-slate-100 rounded"></div>
                        </div>
                        <div className="absolute left-0 top-4">
                            <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg animate-bounce">
                                <Coins className="text-white" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
