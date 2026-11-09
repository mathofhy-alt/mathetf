"use client";

import { payOrder } from '@/lib/payments/client';
import PendingOrderNotice from '@/components/payments/PendingOrderNotice';
import React, { useState, useEffect } from 'react';
import { useCart } from '@/components/providers/CartProvider';
import { ShoppingCart, Trash2, CreditCard } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import Header from '@/components/Header';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';

// 데스크톱 결제 정보는 따라 내려오고, 모바일 결제 정보는 본문 아래에 놓인다.
export default function CartPage() {
    const { items, cartCount, totalPrice, isLoading, removeFromCart, fetchCart } = useCart();
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [earnedPoints, setEarnedPoints] = useState(0);
    const [pointsStatus, setPointsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [pointsRetry, setPointsRetry] = useState(0);
    const [pointsToUse, setPointsToUse] = useState<number | string>('');
    const supabase = createClient();

    const totalPoints = earnedPoints;
    const usedPoints = Math.max(0, Math.min(totalPrice, totalPoints, typeof pointsToUse === 'number' ? pointsToUse : 0));
    const finalAmount = Math.max(0, totalPrice - usedPoints);

    useEffect(() => {
        let cancelled = false;
        setPointsStatus('loading');
        void (async () => {
            try {
                const { data, error } = await supabase.auth.getUser();
                if (cancelled) return;
                setUser(data.user);
                if (error || !data.user) throw new Error('AUTH');
                const { data: profile, error: profileError } = await supabase.from('profiles').select('earned_points').eq('id', data.user.id).maybeSingle();
                if (profileError) throw new Error('POINTS');
                const balance = Number(profile?.earned_points ?? 0);
                if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('POINTS');
                if (!cancelled) { setEarnedPoints(balance); setPointsStatus('ready'); }
            } catch { if (!cancelled) setPointsStatus('error'); }
        })();
        return () => { cancelled = true; };
    }, [supabase, pointsRetry]);

    // 운영본처럼 장바구니에 들어올 때마다 서버 목록을 다시 받는다(다른 탭에서 결제한 상품이 남아 보이지 않게)
    useEffect(() => { fetchCart(); }, [fetchCart]);

    useEffect(() => {
        if (pointsStatus === 'ready') setPointsToUse(value => value === '' ? '' : Math.max(0, Math.min(Number(value), totalPoints, totalPrice)));
    }, [pointsStatus, totalPoints, totalPrice]);

    const handleCheckout = async () => {
        if (!user || cartCount === 0 || pointsStatus !== 'ready' || isCheckingOut) return;
        setIsCheckingOut(true);
        try {
            await payOrder(user, {kind:'cart',items,usedPoints});
            window.location.href='/mypage';
        } catch(e:any) { alert(e.message); }
        finally { setIsCheckingOut(false); }
    };

    if (isLoading) {
        return <div className="rd rd-x rd-cart">
            <Header />
            <p className="rd-cart-loading" role="status">장바구니를 불러오는 중...</p>
        </div>;
    }

    return (
        <div className="rd rd-x rd-cart">
            <Header />
            <section className="rd-wrap rd-x-top rd-cart-top">
                <h1 className="rd-cart-h1">장바구니</h1>
                <p className="rd-cart-lead">필요한 자료를 한곳에 모았습니다. 구매할 항목을 확인해 주세요.</p>
            </section>

            <section className="rd-wrap rd-cart-body">
            <PendingOrderNotice userId={user?.id} kind="cart" />
            {cartCount === 0 ? (
                <div className="rd-cart-empty">
                    <span className="rd-cart-empty-icon" aria-hidden="true"><ShoppingCart size={28} /></span>
                    <p className="rd-cart-empty-title">장바구니가 비어있습니다.</p>
                    <p className="rd-cart-empty-text">기출 시험지를 살펴보고 필요한 파일을 골라주세요.</p>
                    <Link href="/#catalog" className="rd-btn rd-btn-gray rd-cart-empty-btn">출제자료 살펴보기</Link>
                </div>
            ) : (
                <div className="rd-cart-grid">
                    {/* Items List */}
                    <div className="rd-cart-list">
                        <h2 className="rd-cart-h2">담은 자료 <span>{cartCount}개</span></h2>
                        <ul className="rd-cart-items">
                        {items.map(item => (
                            <li key={item.id} className="rd-cart-item">
                                <div className="rd-cart-item-body">
                                    <span className="rd-cart-tag">
                                        {/* item_type 'MOCK_EXAM' 은 옛 이름일 뿐 모든 PDF 자료다(내신 포함) — 화면엔 파일 종류로 보인다(10/7) */}{item.item_type === 'MOCK_EXAM' ? 'PDF' : item.item_type === 'HWP_DOC' ? '한글 HWP' : item.item_type === 'PRIVATE_DB' ? '개인DB' : item.item_type}
                                    </span>
                                    <h3 className="rd-cart-item-title">{item.title}</h3>
                                </div>
                                <span className="rd-cart-item-price">{item.price.toLocaleString()}원</span>
                                <button
                                    onClick={() => removeFromCart(item.id)}
                                    className="rd-cart-del"
                                    title="삭제"
                                    aria-label="삭제"
                                >
                                    <Trash2 size={20} aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                        </ul>
                    </div>

                    {/* Order Summary */}
                    <div className="rd-cart-side">
                        <div className="rd-cart-sum">
                            <h2 className="rd-cart-h2">결제 정보</h2>

                            <dl className="rd-cart-rows" aria-live="polite">
                                <div className="rd-cart-row">
                                    <dt>총 상품 수량</dt>
                                    <dd>{cartCount}개</dd>
                                </div>
                                <div className="rd-cart-row">
                                    <dt>상품 금액</dt>
                                    <dd>{totalPrice.toLocaleString()}원</dd>
                                </div>
                                {usedPoints > 0 && (
                                    <div className="rd-cart-row is-discount">
                                        <dt>포인트 할인</dt>
                                        <dd>-{usedPoints.toLocaleString()}원</dd>
                                    </div>
                                )}
                            </dl>

                            {/* 포인트 사용 UI */}
                            <div className="rd-cart-points">
                                <div className="rd-cart-points-head">
                                    <label htmlFor="rd-cart-points-input">포인트 사용</label>
                                    <span role="status">{pointsStatus === 'loading' ? '포인트 불러오는 중' : pointsStatus === 'error' ? '포인트 조회 실패' : `보유: ${totalPoints.toLocaleString()}P`}</span>
                                </div>
                                <div className="rd-cart-points-row">
                                    <input
                                        id="rd-cart-points-input"
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        disabled={pointsStatus !== 'ready' || isCheckingOut}
                                        value={pointsToUse === '' ? '' : usedPoints}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') {
                                                setPointsToUse('');
                                                return;
                                            }
                                            if (!/^\d+$/.test(val)) return;
                                            let num = Number(val);
                                            if (isNaN(num)) return;
                                            if (num < 0) num = 0;
                                            // 보유 포인트 또는 총 결제 금액을 초과할 수 없음
                                            const maxUsable = Math.min(totalPoints, totalPrice);
                                            if (num > maxUsable) num = maxUsable;
                                            setPointsToUse(num);
                                        }}
                                        placeholder="0"
                                        className="rd-input rd-cart-points-input"
                                    />
                                    <button
                                        type="button"
                                        disabled={pointsStatus !== 'ready' || isCheckingOut}
                                        onClick={() => setPointsToUse(Math.min(totalPoints, totalPrice))}
                                        className="rd-btn rd-btn-gray rd-cart-points-all"
                                    >
                                        {pointsStatus === 'loading' ? '불러오는 중' : '전액사용'}
                                    </button>
                                </div>
                                {pointsStatus === 'error' && <p role="alert">포인트를 불러오지 못했습니다. <button type="button" className="rd-btn rd-btn-gray" onClick={() => { setPointsStatus('loading'); setPointsRetry(v => v + 1); }}>다시 불러오기</button></p>}
                                {usedPoints > 0 && <p role="status">{usedPoints.toLocaleString()}P 적용됨{finalAmount === 0 ? ' · 카드 결제 없이 완료됩니다.' : ''}</p>}
                            </div>

                            <div className="rd-cart-notes">
                                <p><strong>자료 제공</strong>유료 PDF·HWP는 결제 완료 후 즉시 다운로드할 수 있습니다.</p>
                                <p><strong>유의사항</strong>구매하신 문서(PDF/HWP)는 결제일로부터 <b>30일간</b>만 다운로드 가능합니다. (개인DB 제외)</p>
                            </div>
                        </div>

                        <div className="rd-cart-paybar">
                            <div className="rd-cart-total">
                                <span>최종 결제 금액</span>
                                <b>{finalAmount.toLocaleString()}원</b>
                            </div>
                            <button
                                onClick={handleCheckout}
                                disabled={isCheckingOut || pointsStatus !== 'ready' || !user}
                                className="rd-btn rd-btn-primary rd-btn-block rd-cart-pay"
                            >
                                {isCheckingOut ? (
                                    <span role="status"><span className="rd-cart-spin" /> 결제 확인 중</span>
                                ) : (
                                    <>
                                        <CreditCard size={20} aria-hidden="true" />
                                        {pointsStatus === 'loading' ? '포인트 불러오는 중' : finalAmount === 0 ? '포인트로 결제' : '결제 / 결과 확인'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </section>
        </div>
    );
}
