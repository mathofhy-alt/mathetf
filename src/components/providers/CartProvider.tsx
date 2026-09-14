'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { createClient } from '@/utils/supabase/client';

export interface CartItem {
  id: string;
  item_type: string;
  item_id: string;
  title: string;
  price: number;
}

interface CartContextType {
  items: CartItem[];
  cartCount: number;
  totalPrice: number;
  isLoading: boolean;
  addToCart: (item: Omit<CartItem, 'id'>) => Promise<void>;
  removeFromCart: (id: string) => Promise<void>;
  clearCart: () => Promise<void>;
  fetchCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCart = useCallback(async () => {
    setIsLoading(true);
    try {
      // [2026-09-14 전수조사] 비로그인 방문자도 매 페이지뷰마다 /api/cart 를 불러 401 을 받고 있었다
      //   (브라우저 28회 로드 중 28회, 콘솔 오류 1건씩). 기능엔 지장이 없지만 서버리스 호출 1회 + 콘솔 오류가
      //   페이지뷰마다 생긴다. 세션이 없으면 부르지 않는다. 세션 확인은 로컬 쿠키라 네트워크 왕복이 없다.
      const { data: { session } } = await createClient().auth.getSession();
      if (!session) { setItems([]); return; }
      const res = await fetch('/api/cart');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (error) {
      console.error('Failed to fetch cart items:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const addToCart = async (item: Omit<CartItem, 'id'>) => {
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setItems((prev) => [data.item, ...prev]);
        // alert or toast can be handled by the caller component
      } else {
        throw new Error(data.error || 'Failed to add item to cart');
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      throw error;
    }
  };

  const removeFromCart = async (id: string) => {
    try {
      const res = await fetch(`/api/cart?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      } else {
        throw new Error('Failed to remove item');
      }
    } catch (error) {
      console.error('Error removing from cart:', error);
      throw error;
    }
  };

  const clearCart = async () => {
    try {
      const res = await fetch('/api/cart?clear_all=true', { method: 'DELETE' });
      if (res.ok) {
        setItems([]);
      } else {
        throw new Error('Failed to clear cart');
      }
    } catch (error) {
      console.error('Error clearing cart:', error);
      throw error;
    }
  };

  const cartCount = items.length;
  const totalPrice = items.reduce((sum, item) => sum + item.price, 0);

  return (
    <CartContext.Provider 
      value={{ 
        items, 
        cartCount, 
        totalPrice, 
        isLoading, 
        addToCart, 
        removeFromCart, 
        clearCart,
        fetchCart 
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
