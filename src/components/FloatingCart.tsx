"use client";

import React from 'react';
import { useCart } from '@/components/providers/CartProvider';
import { ShoppingCart, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function FloatingCart() {
    const { cartCount, totalPrice } = useCart();
    const pathname = usePathname();

    // Do not show the floating cart if the user is already on the cart page
    // or if the cart is empty
    if (cartCount === 0 || pathname === '/cart') {
        return null;
    }

    return (
        <div className="rd fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300" style={{ background: 'transparent' }}>
            <Link href="/cart" className="flex items-center gap-4 bg-[#17202C] text-white rounded-[20px] shadow-[0_20px_60px_rgba(23,32,44,0.28)] p-3 pr-4 hover:bg-[#232e3c] transition-colors no-underline">
                <div className="relative">
                    <div className="w-12 h-12 bg-[#1B7E7A] rounded-[14px] flex items-center justify-center">
                        <ShoppingCart size={22} className="text-white" />
                    </div>
                    <div className="absolute -top-1.5 -right-1.5 bg-white text-[#1B7E7A] min-w-[24px] h-6 px-1 rounded-full flex items-center justify-center text-[13px] font-extrabold tabular-nums">
                        {cartCount}
                    </div>
                </div>

                <div className="flex flex-col">
                    <span className="text-[14px] text-[#B0B8C1] font-semibold mb-1">장바구니 결제하기</span>
                    <span className="font-extrabold text-[18px] leading-none">{totalPrice.toLocaleString()}원</span>
                </div>

                <ChevronRight size={20} className="text-[#B0B8C1]" />
            </Link>
        </div>
    );
}
