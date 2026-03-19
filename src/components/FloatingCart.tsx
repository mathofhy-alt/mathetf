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
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
            <Link href="/cart" className="flex items-center gap-4 bg-slate-900 text-white rounded-2xl shadow-2xl p-4 pr-5 hover:bg-slate-800 transition-all hover:scale-[1.02] active:scale-95 border border-slate-700">
                <div className="relative">
                    <div className="w-12 h-12 bg-brand-500 rounded-xl flex items-center justify-center">
                        <ShoppingCart size={24} className="text-white" />
                    </div>
                    <div className="absolute -top-2 -right-2 bg-rose-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 border-slate-900 shadow-sm">
                        {cartCount}
                    </div>
                </div>

                <div className="flex flex-col">
                    <span className="text-xs text-slate-400 font-medium tracking-tight mb-0.5">장바구니 결제하기</span>
                    <span className="font-extrabold text-lg leading-none">{totalPrice.toLocaleString()}원</span>
                </div>

                <div className="ml-2 pl-4 border-l border-slate-700/50 flex items-center justify-center">
                    <ChevronRight size={20} className="text-slate-500" />
                </div>
            </Link>
        </div>
    );
}
