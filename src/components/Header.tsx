"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { Upload, Coins, User as UserIcon, ShoppingCart, Menu, X, LogOut, ChevronDown, Camera, Database } from 'lucide-react';
import dynamic from 'next/dynamic';

// [2026-10-05] 회원 원본 시험지 제보 — 눌렀을 때만 불러온다
const OriginalReportModal = dynamic(() => import('@/components/OriginalReportModal'), { ssr: false });
const DbRequestModal = dynamic(() => import('@/components/DbRequestModal'), { ssr: false });

import { useRouter, usePathname } from 'next/navigation';
import { useCart } from '@/components/providers/CartProvider';
import { REPORT_REWARD_LABEL } from '@/lib/report-reward';

function YoutubeIcon({ size }: { size: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <rect x="1" y="4" width="22" height="16" rx="5" fill="#FF0000" />
        <path d="M10 8.5L16 12L10 15.5Z" fill="#FFFFFF" />
    </svg>;
}

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
    let activePath=pathname;try{activePath=decodeURIComponent(pathname);}catch{}
    activePath=activePath.replace(/^\/mock(?=\/|$)/,'/모의고사');
    const [authNext,setAuthNext] = useState('');
    useEffect(()=>{const query=new URLSearchParams(window.location.search);if(pathname==='/question-bank')query.set('resume','1');setAuthNext(encodeURIComponent(pathname+(query.toString()?'?'+query.toString():'')));},[pathname]);

    const { cartCount } = useCart();
    const isAdmin = user?.email === 'mathofhy@naver.com';

    useEffect(()=>{if(!mobileMenuOpen)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){setMobileMenuOpen(false);document.querySelector<HTMLButtonElement>('[aria-controls="mobile-navigation"]')?.focus();}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[mobileMenuOpen]);
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
            } else if (propUser && propPurchased === undefined) {
                // [10/6] 예전엔 state 의 user 로 확인했는데, 공지·건의사항처럼 페이지가 user 를 null → 로그인 정보로
                //   늦게 넘기면 이 시점 state 가 아직 null 이라 포인트를 안 불러 0 으로 보였다(사용자 지적). 받은 값으로 부른다.
                fetchPoints(propUser.id);
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

    // [2026-10-05] 원본 시험지 제보: 로그인 회원 누구나. 비로그인은 로그인 후 돌아오게.
    //   다른 화면(학교 페이지 등)에서도 window.dispatchEvent(new Event('open-original-report')) 로 열 수 있다.
    const [reportOpen, setReportOpen] = useState(false);
    const [reportSchool, setReportSchool] = useState<string | undefined>(undefined);   // 학교 페이지에서 열면 그 학교 코드
    const openReport = (code?: string) => { if (!user) { router.push(`/login?next=${authNext}`); return; } setReportSchool(code); setReportOpen(true); setMobileMenuOpen(false); };
    // [10/6] 개인DB 요청 — 회원이 개인DB로 만들고 싶은 자료(시중 교재 등)를 운영자에게 보낸다
    const [dbRequestOpen, setDbRequestOpen] = useState(false);
    const openDbRequest = () => { if (!user) { router.push(`/login?next=${authNext}`); return; } setDbRequestOpen(true); setMobileMenuOpen(false); };
    useEffect(() => { const h = (e: Event) => openReport((e as CustomEvent).detail?.code); window.addEventListener('open-original-report', h); return () => window.removeEventListener('open-original-report', h); });

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
            // [2026-09-08] '시험지 출제' 자식을 뺐다 — 부모와 같은 /question-bank 라 한 화면에
            //   같은 곳으로 가는 링크가 두 줄이었다(외부 감사 지적). 부모는 데스크톱·모바일 모두
            //   실제 Link 라 도달성 손실은 없다.
            href: '/question-bank', label: '시험지 만들기', children: [
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
            <header className="site-header bg-white border-b border-slate-200 sticky top-0 z-50">
                <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between gap-4">
                    {/* Logo */}
                    <div className="flex items-center gap-6 min-w-0">
                        <Link href="/" className="flex items-center gap-2 shrink-0">
                            <Image src="/icon.svg" alt="" width={32} height={32} className="h-8 w-8 shrink-0" />
                            <span className="text-2xl font-bold text-brand-600 tracking-tight whitespace-nowrap">수학ETF</span>
                        </Link>
                        {/* Desktop Nav */}
                        <nav className="hidden lg:flex items-center gap-1 text-sm font-bold text-slate-600">
                            {navItems.map(item => item.children ? (
                                <div key={item.href} className="relative group">
                                    <Link href={item.href} aria-current={(item.href==='/'?pathname==='/':activePath.startsWith(item.href))?'page':undefined} className="px-2 py-2 rounded-lg hover:text-brand-600 transition-colors whitespace-nowrap flex items-center gap-1">
                                        {item.label}
                                        {item.badge && <span className="text-[9px] font-extrabold text-white bg-[#2E9E5B] px-1 py-0.5 rounded">{item.badge}</span>}
                                        <ChevronDown size={13} className="text-slate-400 transition-transform duration-200 group-hover:rotate-180" />
                                    </Link>
                                    {/* 드롭다운 (호버) — pt-1 로 트리거와 패널 사이 틈 없이 연결 */}
                                    <div className="absolute left-0 top-full pt-2 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 transition-all duration-150 z-50">
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
                                <Link key={item.href} href={item.href} aria-current={(item.href==='/'?pathname==='/':activePath.startsWith(item.href))?'page':undefined} className="px-2 py-2 rounded-lg hover:text-brand-600 transition-colors whitespace-nowrap flex items-center gap-1">
                                    {item.label}
                                    {item.badge && <span className="text-[9px] font-extrabold text-white bg-[#2E9E5B] px-1 py-0.5 rounded">{item.badge}</span>}
                                </Link>
                            ))}
                            {/* 사용법 안내 */}
                            <a href="/guide"
                                className="px-2 py-2 rounded-lg text-slate-600 hover:text-brand-600 hover:bg-slate-50 transition-colors whitespace-nowrap flex items-center gap-1.5">
                                <YoutubeIcon size={20} /> 사용법
                            </a>
                            {isAdmin && (
                                <Link href="/admin/inventory" className="px-2 py-2 text-purple-600 hover:text-purple-700 transition-colors flex items-center gap-1">🎯 현황판</Link>
                            )}
                        </nav>
                    </div>

                    {/* Right Side */}
                    <div className="flex items-center gap-2 md:gap-4 shrink-0">
                        {/* Upload button - show only if logged in, desktop only */}
                        {/* 자료등록은 이제 사용자가 쓰지 않는다(운영자가 스크립트로 등록). 일반 계정에선
                            유튜브 '사용법' 버튼과 맞닿아 겹쳐 보이기까지 해서 관리자에게만 남긴다. */}
                        {user && isAdmin && !hideUploadButton && (
                            <button onClick={handleDefaultUploadClick} className="hidden lg:flex px-4 py-1.5 bg-brand-600 text-white rounded text-sm font-medium hover:bg-brand-700 items-center gap-2 whitespace-nowrap">
                                <Upload size={14} /> 자료등록
                            </button>
                        )}

                        {/* 원본 시험지 제보 (회원 누구나) — 운영자는 아래 자료등록을 쓴다 */}
                        {!isAdmin && (
                            <button type="button" onClick={() => openReport()} title="원본 제보" aria-label="원본 제보" className="hidden lg:flex px-2.5 min-[1400px]:px-3 py-1.5 border border-brand-200 text-brand-700 bg-white rounded text-sm font-bold hover:bg-brand-50 items-center gap-1.5 whitespace-nowrap">
                                {/* 1400px 아래에선 아이콘만 — 두 버튼이 메뉴(사용법)를 덮었다(10/6 1024·1280 실측) */}
                                <Camera size={14} /> <span className="hidden min-[1400px]:inline">원본 제보</span>
                            </button>
                        )}
                        {!isAdmin && (
                            <button type="button" onClick={openDbRequest} title="개인DB 요청" aria-label="개인DB 요청" className="hidden lg:flex px-2.5 min-[1400px]:px-3 py-1.5 border border-brand-200 text-brand-700 bg-white rounded text-sm font-bold hover:bg-brand-50 items-center gap-1.5 whitespace-nowrap">
                                <Database size={14} /> <span className="hidden min-[1400px]:inline">개인DB 요청</span>
                            </button>
                        )}

                        {/* Shopping Cart Icon */}
                        {user && (
                            <Link aria-label="장바구니" href="/cart" className="relative p-2 text-slate-600 hover:text-brand-600 transition-colors">
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
                                    className="flex items-center gap-1 px-3 py-1.5 border-l border-slate-200 text-slate-500 hover:text-red-500 hover:bg-slate-50 transition-colors"
                                    title="로그아웃"
                                >
                                    <LogOut size={14} />
                                    <span className="hidden lg:inline text-xs">로그아웃</span>
                                </button>
                            </div>
                        ) : (
                            !mobileMenuOpen && !['/login', '/signup'].includes(pathname) && (
                                <div className="hidden lg:flex items-center gap-2">
                                    <Link href={`/login?next=${authNext}`} className="px-4 py-1.5 text-slate-600 font-bold text-sm hover:bg-slate-50 border border-slate-200 rounded">로그인</Link>
                                    <Link href={`/signup?next=${authNext}`} className="px-4 py-1.5 bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 rounded">회원가입</Link>
                                </div>
                            )
                        )}

                        {/* 비로그인 모바일: 무료 시작 버튼 상시 노출 */}
                        {!user && !mobileMenuOpen && !['login', 'signup'].some(p => pathname.includes(p)) && (
                            <Link
                                href={`/signup?next=${authNext}`}
                                className="lg:hidden px-3 py-3 sm:py-1.5 bg-brand-600 text-white font-bold text-xs rounded-lg hover:bg-brand-700 transition-colors whitespace-nowrap"
                            >
                                무료 시작 →
                            </Link>
                        )}

                        {/* Hamburger Button - Mobile Only */}
                        <button
                            className="lg:hidden p-3 sm:p-2 rounded-lg hover:bg-slate-100 transition-colors"
                            onClick={() => setMobileMenuOpen(prev => !prev)}
                            aria-label={mobileMenuOpen?'메뉴 닫기':'메뉴 열기'} aria-controls="mobile-navigation" aria-expanded={mobileMenuOpen}
                        >
                            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu Dropdown */}
                <div id="mobile-navigation" hidden={!mobileMenuOpen} className={`mobile-navigation lg:hidden overflow-hidden transition-all duration-300 ease-in-out ${mobileMenuOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="bg-white border-t border-slate-100 px-4 py-3 space-y-1 shadow-lg">
                        {/* Nav Links */}
                        {navItems.map(item => (
                            <div key={item.href}>
                                <Link
                                    href={item.href} aria-current={(item.href==='/'?pathname==='/':activePath.startsWith(item.href))?'page':undefined}
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
                        {/* 사용법 안내 */}
                        <a href="/guide"
                            onClick={() => setMobileMenuOpen(false)}
                            className="flex items-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                            <YoutubeIcon size={22} /> 사용법 가이드
                            <span className="text-[10px] text-slate-400 font-semibold ml-auto">이용 안내</span>
                        </a>
                        {isAdmin && (
                            <Link href="/admin/inventory" className="block py-3 px-4 rounded-xl text-sm font-bold text-purple-600 hover:bg-purple-50">
                                🎯 현황판
                            </Link>
                        )}
                        {!isAdmin && (
                            <button type="button" onClick={() => openReport()} className="w-full flex items-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-brand-700 hover:bg-brand-50 transition-colors">
                                <Camera size={20} /> 원본 시험지 제보
                                <span className="text-[10px] text-slate-400 font-semibold ml-auto">채택 시 {REPORT_REWARD_LABEL}</span>
                            </button>
                        )}
                        {!isAdmin && (
                            <button type="button" onClick={openDbRequest} className="w-full flex items-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-brand-700 hover:bg-brand-50 transition-colors">
                                <Database size={20} /> 개인DB 요청
                            </button>
                        )}

                        {/* Divider */}
                        <div className="border-t border-slate-100 my-2" />

                        {/* User Section */}
                        {user ? (
                            <>
                                {isAdmin && !hideUploadButton && (
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
                                <button onClick={()=>supabase.auth.signOut().then(()=>window.location.reload())} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50"><LogOut size={17}/>로그아웃</button>
                            </>
                        ) : (
                            !['/login', '/signup'].includes(pathname) && (
                                <div className="flex gap-2 pt-1">
                                    <Link href={`/login?next=${authNext}`} className="flex-1 py-3 text-center text-slate-600 font-bold text-sm border border-slate-200 rounded-xl hover:bg-slate-50">로그인</Link>
                                    <Link href={`/signup?next=${authNext}`} className="flex-1 py-3 text-center bg-brand-600 text-white font-bold text-sm rounded-xl hover:bg-brand-700">회원가입</Link>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </header>
            {dbRequestOpen && <DbRequestModal open={dbRequestOpen} onClose={() => setDbRequestOpen(false)} />}
            {reportOpen && <OriginalReportModal open={reportOpen} initialCode={reportSchool} onClose={() => setReportOpen(false)} />}
        </>
    );
}
