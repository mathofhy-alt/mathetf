"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { Upload, Coins, User as UserIcon, ShoppingCart, Menu, X } from 'lucide-react';
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
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const supabase = createClient();
    const router = useRouter();
    const pathname = usePathname();
    const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
    const { cartCount } = useCart();

    // Close mobile menu on route change
    useEffect(() => {
        setMobileMenuOpen(false);
    }, [pathname]);

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
        const init = async () => {
            if (propUser === undefined) {
                const { data: { user } } = await supabase.auth.getUser();
                setUser(user);
                if (user && propPurchased === undefined) {
                    fetchPoints(user.id);
                }
            } else if (user && propPurchased === undefined) {
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
            router.push('/');
        }
    };

    const navLinks = [
        { href: '/', label: '내신기출' },
        { href: '/question-bank', label: '시험지출제' },
        { href: '/notice', label: '공지사항' },
        { href: '/suggestion', label: '건의사항' },
    ];

    return (
        <>
            <header className="bg-white border-b border-slate-200 relative z-40">
                <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
                    {/* Logo */}
                    <div className="flex items-center gap-8">
                        <Link href="/" className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-brand-600 rounded flex items-center justify-center text-white font-bold text-xl">∑</div>
                            <span className="text-2xl font-bold text-brand-600 tracking-tight">수학ETF</span>
                        </Link>
                        {/* Desktop Nav */}
                        <nav className="hidden md:flex gap-6 text-sm font-bold text-slate-600">
                            {navLinks.map(link => (
                                <Link key={link.href} href={link.href} className="hover:text-brand-600 transition-colors">{link.label}</Link>
                            ))}
                            {user?.email === 'mathofhy@naver.com' && (
                                <Link href="/admin/inventory" className="text-purple-600 hover:text-purple-700 transition-colors flex items-center gap-1">🎯 현황판</Link>
                            )}
                        </nav>
                    </div>

                    {/* Right Side */}
                    <div className="flex items-center gap-2 md:gap-4">
                        {/* Upload button - show only if logged in, desktop only */}
                        {user && !hideUploadButton && (
                            <button onClick={handleDefaultUploadClick} className="hidden sm:flex px-4 py-1.5 bg-brand-600 text-white rounded text-sm font-medium hover:bg-brand-700 items-center gap-2">
                                <Upload size={14} /> 자료등록
                            </button>
                        )}

                        {/* Shopping Cart Icon */}
                        {user && (
                            <Link href="/cart" className="relative p-2 text-slate-600 hover:text-brand-600 transition-colors">
                                <ShoppingCart size={20} />
                                {cartCount > 0 && (
                                    <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center justify-center translate-x-1/4 -translate-y-1/4">
                                        {cartCount}
                                    </span>
                                )}
                            </Link>
                        )}

                        {/* Desktop: User Info or Login */}
                        {user ? (
                            <div className="hidden sm:flex items-center text-sm font-medium text-slate-600 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors cursor-pointer overflow-hidden">
                                <Link href="/mypage" className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-200 transition-colors">
                                    <Coins size={14} className="text-yellow-500" />
                                    <span className="hidden lg:inline">{earnedPoints.toLocaleString()} P (수익)</span>
                                    <span className="w-px h-3 bg-slate-300 mx-1 hidden lg:block"></span>
                                    <UserIcon size={14} />
                                    <span>마이페이지</span>
                                </Link>
                            </div>
                        ) : (
                            !mobileMenuOpen && !['/login', '/signup', '/'].includes(pathname) && (
                                <div className="hidden sm:flex items-center gap-2">
                                    <Link href="/login" className="px-4 py-1.5 text-slate-600 font-bold text-sm hover:bg-slate-50 border border-slate-200 rounded">로그인</Link>
                                    <Link href="/signup" className="px-4 py-1.5 bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 rounded">회원가입</Link>
                                </div>
                            )
                        )}

                        {/* Hamburger Button - Mobile Only */}
                        <button
                            className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
                            onClick={() => setMobileMenuOpen(prev => !prev)}
                            aria-label="메뉴 열기"
                        >
                            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu Dropdown */}
                <div className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${mobileMenuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="bg-white border-t border-slate-100 px-4 py-3 space-y-1 shadow-lg">
                        {/* Nav Links */}
                        {navLinks.map(link => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`block py-3 px-4 rounded-xl text-sm font-bold transition-colors ${pathname === link.href ? 'bg-brand-50 text-brand-600' : 'text-slate-700 hover:bg-slate-50'}`}
                            >
                                {link.label}
                            </Link>
                        ))}
                        {user?.email === 'mathofhy@naver.com' && (
                            <Link href="/admin/inventory" className="block py-3 px-4 rounded-xl text-sm font-bold text-purple-600 hover:bg-purple-50">
                                🎯 현황판
                            </Link>
                        )}

                        {/* Divider */}
                        <div className="border-t border-slate-100 my-2" />

                        {/* User Section */}
                        {user ? (
                            <>
                                {!hideUploadButton && (
                                    <button
                                        onClick={() => { handleDefaultUploadClick(); setMobileMenuOpen(false); }}
                                        className="w-full py-3 px-4 bg-brand-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 justify-center hover:bg-brand-700 transition-colors"
                                    >
                                        <Upload size={14} /> 자료등록
                                    </button>
                                )}
                                <Link href="/mypage" className="flex items-center gap-3 py-3 px-4 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">
                                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                                        <UserIcon size={15} className="text-slate-500" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-slate-400">{user.email}</div>
                                        <div className="text-sm font-bold text-slate-700">마이페이지 · {earnedPoints.toLocaleString()}P</div>
                                    </div>
                                </Link>
                            </>
                        ) : (
                            !['/login', '/signup'].includes(pathname) && (
                                <div className="flex gap-2 pt-1">
                                    <Link href="/login" className="flex-1 py-3 text-center text-slate-600 font-bold text-sm border border-slate-200 rounded-xl hover:bg-slate-50">로그인</Link>
                                    <Link href="/signup" className="flex-1 py-3 text-center bg-brand-600 text-white font-bold text-sm rounded-xl hover:bg-brand-700">회원가입</Link>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </header>
            <DepositModal
                isOpen={isDepositModalOpen}
                onClose={() => setIsDepositModalOpen(false)}
                user={user}
                onSuccess={(addedPoints) => {
                    setPurchasedPoints(prev => prev + addedPoints);
                }}
            />
        </>
    );
}
