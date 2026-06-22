"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { Upload, Coins, User as UserIcon, ShoppingCart, Menu, X, LogOut, ChevronDown } from 'lucide-react';
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

    type NavChild = { href: string; label: string; badge?: string };
    type NavItem = { href: string; label: string; badge?: string; children?: NavChild[] };
    const navItems: NavItem[] = [
        { href: '/', label: '내신기출' },
        {
            href: '/question-bank', label: '10초 시험지제작', children: [
                { href: '/question-bank', label: '시험지 출제' },
                { href: '/predict', label: '예상문제 뽑기' },
                { href: '/print-transform', label: '학교프린트 변형', badge: 'NEW' },
            ]
        },
        {
            href: '/모의고사', label: '모의고사', badge: 'NEW', children: [
                { href: '/모의고사/전국연합', label: '전국연합학력평가' },
                { href: '/모의고사/경찰대', label: '경찰대' },
                { href: '/모의고사/사관학교', label: '사관학교' },
            ]
        },
        { href: '/notice', label: '공지사항' },
        { href: '/suggestion', label: '건의사항' },
    ];

    return (
        <>
            <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
                <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
                    {/* Logo */}
                    <div className="flex items-center gap-6 min-w-0">
                        <Link href="/" className="flex items-center gap-2 shrink-0">
                            <div className="w-8 h-8 bg-brand-600 rounded flex items-center justify-center text-white font-bold text-xl">∑</div>
                            <span className="text-2xl font-bold text-brand-600 tracking-tight whitespace-nowrap">수학ETF</span>
                        </Link>
                        {/* Desktop Nav */}
                        <nav className="hidden lg:flex items-center gap-1 text-sm font-bold text-slate-600">
                            {navItems.map(item => item.children ? (
                                <div key={item.href} className="relative group">
                                    <Link href={item.href} className="px-2 py-2 rounded-lg hover:text-brand-600 transition-colors whitespace-nowrap flex items-center gap-1">
                                        {item.label}
                                        {item.badge && <span className="text-[9px] font-extrabold text-white bg-[#2E9E5B] px-1 py-0.5 rounded">{item.badge}</span>}
                                        <ChevronDown size={13} className="text-slate-400 transition-transform duration-200 group-hover:rotate-180" />
                                    </Link>
                                    {/* 드롭다운 (호버) — pt-1 로 트리거와 패널 사이 틈 없이 연결 */}
                                    <div className="absolute left-0 top-full pt-2 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-150 z-50">
                                        <div className="min-w-[180px] bg-white border border-slate-200 rounded-xl shadow-xl ring-1 ring-black/5 py-1.5">
                                            {item.children.map(c => (
                                                <Link key={c.href} href={c.href} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-600 transition-colors whitespace-nowrap">
                                                    {c.label}
                                                    {c.badge && <span className="text-[9px] font-extrabold text-white bg-[#2E9E5B] px-1 py-0.5 rounded">{c.badge}</span>}
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <Link key={item.href} href={item.href} className="px-2 py-2 rounded-lg hover:text-brand-600 transition-colors whitespace-nowrap flex items-center gap-1">
                                    {item.label}
                                    {item.badge && <span className="text-[9px] font-extrabold text-white bg-[#2E9E5B] px-1 py-0.5 rounded">{item.badge}</span>}
                                </Link>
                            ))}
                            {user?.email === 'mathofhy@naver.com' && (
                                <Link href="/admin/inventory" className="px-2 py-2 text-purple-600 hover:text-purple-700 transition-colors flex items-center gap-1">🎯 현황판</Link>
                            )}
                        </nav>
                    </div>

                    {/* Right Side */}
                    <div className="flex items-center gap-2 md:gap-4">
                        {/* Upload button - show only if logged in, desktop only */}
                        {user && !hideUploadButton && (
                            <button onClick={handleDefaultUploadClick} className="hidden lg:flex px-4 py-1.5 bg-brand-600 text-white rounded text-sm font-medium hover:bg-brand-700 items-center gap-2 whitespace-nowrap">
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
                            <div className="hidden lg:flex items-center text-sm font-medium text-slate-600 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors cursor-pointer overflow-hidden whitespace-nowrap">
                                <Link href="/mypage" className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-200 transition-colors">
                                    <Coins size={14} className="text-yellow-500" />
                                    <span className="hidden xl:inline">{earnedPoints.toLocaleString()} P (수익)</span>
                                    <span className="w-px h-3 bg-slate-300 mx-1 hidden xl:block"></span>
                                    <UserIcon size={14} />
                                    <span>마이페이지</span>
                                </Link>
                                <button
                                    onClick={() => supabase.auth.signOut().then(() => window.location.reload())}
                                    className="flex items-center gap-1 px-3 py-1.5 border-l border-slate-200 text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors"
                                    title="로그아웃"
                                >
                                    <LogOut size={14} />
                                    <span className="hidden lg:inline text-xs">로그아웃</span>
                                </button>
                            </div>
                        ) : (
                            !mobileMenuOpen && !['/login', '/signup'].includes(pathname) && (
                                <div className="hidden lg:flex items-center gap-2">
                                    <Link href="/login" className="px-4 py-1.5 text-slate-600 font-bold text-sm hover:bg-slate-50 border border-slate-200 rounded">로그인</Link>
                                    <Link href="/signup" className="px-4 py-1.5 bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 rounded">회원가입</Link>
                                </div>
                            )
                        )}

                        {/* 비로그인 모바일: 무료 시작 버튼 상시 노출 */}
                        {!user && !mobileMenuOpen && !['login', 'signup'].some(p => pathname.includes(p)) && (
                            <Link
                                href="/signup"
                                className="lg:hidden px-3 py-1.5 bg-brand-600 text-white font-bold text-xs rounded-lg hover:bg-brand-700 transition-colors whitespace-nowrap"
                            >
                                무료 시작 →
                            </Link>
                        )}

                        {/* Hamburger Button - Mobile Only */}
                        <button
                            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
                            onClick={() => setMobileMenuOpen(prev => !prev)}
                            aria-label="메뉴 열기"
                        >
                            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu Dropdown */}
                <div className={`lg:hidden overflow-hidden transition-all duration-300 ease-in-out ${mobileMenuOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="bg-white border-t border-slate-100 px-4 py-3 space-y-1 shadow-lg">
                        {/* Nav Links */}
                        {navItems.map(item => (
                            <div key={item.href}>
                                <Link
                                    href={item.href}
                                    className={`flex items-center gap-1.5 py-3 px-4 rounded-xl text-sm font-bold transition-colors ${pathname === item.href ? 'bg-brand-50 text-brand-600' : 'text-slate-700 hover:bg-slate-50'}`}
                                >
                                    {item.label}
                                    {item.badge && <span className="text-[9px] font-extrabold text-white bg-[#2E9E5B] px-1 py-0.5 rounded">{item.badge}</span>}
                                </Link>
                                {item.children && (
                                    <div className="ml-3 pl-3 border-l border-slate-100 space-y-0.5">
                                        {item.children.map(c => (
                                            <Link
                                                key={c.href}
                                                href={c.href}
                                                className={`flex items-center gap-1.5 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors ${pathname === c.href ? 'bg-brand-50 text-brand-600' : 'text-slate-500 hover:bg-slate-50'}`}
                                            >
                                                {c.label}
                                                {c.badge && <span className="text-[9px] font-extrabold text-white bg-[#2E9E5B] px-1 py-0.5 rounded">{c.badge}</span>}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
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
