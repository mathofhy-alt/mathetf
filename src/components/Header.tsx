"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { Upload, Coins, User as UserIcon, ShoppingCart } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useCart } from '@/components/providers/CartProvider';
import DepositModal from './payments/DepositModal';

interface HeaderProps {
    user?: User | null;
    purchasedPoints?: number;
    earnedPoints?: number;
    onUploadClick?: () => void;
    hideUploadButton?: boolean;
}

export default function Header({ user: propUser, purchasedPoints: propPurchased, earnedPoints: propEarned, onUploadClick, hideUploadButton }: HeaderProps) {
    const [user, setUser] = useState<User | null>(propUser || null);
    const [purchasedPoints, setPurchasedPoints] = useState(propPurchased || 0);
    const [earnedPoints, setEarnedPoints] = useState(propEarned || 0);
    const supabase = createClient();
    const router = useRouter();
    const pathname = usePathname();
    const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
    const { cartCount } = useCart();

    // If props are provided, sync them
    useEffect(() => {
        if (propUser !== undefined) setUser(propUser);
    }, [propUser]);

    useEffect(() => {
        if (propPurchased !== undefined) setPurchasedPoints(propPurchased);
    }, [propPurchased]);

    useEffect(() => {
        if (propEarned !== undefined) setEarnedPoints(propEarned);
    }, [propEarned]);


    // Self-fetch if props are missing (for sub-pages)
    useEffect(() => {
        // Only fetch if props are NOT provided (undefined)
        const init = async () => {
            if (propUser === undefined) {
                const { data: { user } } = await supabase.auth.getUser();
                setUser(user);
                if (user && propPurchased === undefined) {
                    fetchPoints(user.id);
                }
            } else if (user && propPurchased === undefined) {
                // User provided but points not
                fetchPoints(user.id);
            }
        };

        init();
    }, [propUser, propPurchased, supabase]);

    const fetchPoints = async (userId: string) => {
        const { data } = await supabase.from('profiles').select('purchased_points, earned_points').eq('id', userId).single();
        if (data) {
            setPurchasedPoints(data.purchased_points || 0);
            setEarnedPoints(data.earned_points || 0);
        }
    };

    const handleDefaultUploadClick = () => {
        if (onUploadClick) {
            onUploadClick();
        } else {
            // Default behavior for sub-pages: Go to home and maybe trigger upload?
            // For now, just go home.
            router.push('/');
        }
    };

    return (
        <header className="bg-white border-b border-slate-200">
            <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-brand-600 rounded flex items-center justify-center text-white font-bold text-xl">∑</div>
                        <span className="text-2xl font-bold text-brand-600 tracking-tight">수학ETF</span>
                    </Link>
                    <nav className="hidden md:flex gap-6 text-sm font-bold text-slate-600">
                        <Link href="/" className="hover:text-brand-600 transition-colors">내신기출</Link>
                        <Link href="/question-bank" className="hover:text-brand-600 transition-colors">시험지출제</Link>
                        <Link href="/notice" className="hover:text-brand-600 transition-colors">공지사항</Link>
                        <Link href="/suggestion" className="hover:text-brand-600 transition-colors">건의사항</Link>
                        {user?.email === 'mathofhy@naver.com' && (
                            <Link href="/admin/inventory" className="text-purple-600 hover:text-purple-700 transition-colors flex items-center gap-1">🎯 현황판</Link>
                        )}
                    </nav>
                </div>
                <div className="flex items-center gap-4">
                    {/* Upload button - show only if logged in */}
                    {user && !hideUploadButton && (
                        <button onClick={handleDefaultUploadClick} className="px-4 py-1.5 bg-brand-600 text-white rounded text-sm font-medium hover:bg-brand-700 flex items-center gap-2">
                            <Upload size={14} /> 자료등록
                        </button>
                    )}

                    {/* Shopping Cart Icon */}
                    {user && (
                        <Link href="/cart" className="relative p-2 text-slate-600 hover:text-brand-600 transition-colors mr-2">
                            <ShoppingCart size={20} />
                            {cartCount > 0 && (
                                <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center justify-center translate-x-1/4 -translate-y-1/4">
                                    {cartCount}
                                </span>
                            )}
                        </Link>
                    )}

                    {user ? (
                        <div className="flex items-center text-sm font-medium text-slate-600 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors cursor-pointer overflow-hidden">
                            <Link href="/mypage" className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-200 transition-colors">
                                <Coins size={14} className="text-yellow-500" />
                                <span>{earnedPoints.toLocaleString()} P (수익)</span>
                                <span className="w-px h-3 bg-slate-300 mx-1"></span>
                                <UserIcon size={14} />
                                <span>마이페이지</span>
                            </Link>
                        </div>
                    ) : (
                        !['/login', '/signup', '/'].includes(pathname) && (
                            <div className="flex items-center gap-2">
                                <Link href="/login" className="px-4 py-1.5 text-slate-600 font-bold text-sm hover:bg-slate-50 border border-slate-200 rounded">로그인</Link>
                                <Link href="/signup" className="px-4 py-1.5 bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 rounded">회원가입</Link>
                            </div>
                        )
                    )}
                </div>
            </div>
            <DepositModal
                isOpen={isDepositModalOpen}
                onClose={() => setIsDepositModalOpen(false)}
                user={user}
                onSuccess={(addedPoints) => {
                    setPurchasedPoints(prev => prev + addedPoints);
                }}
            />
        </header>
    );
}
