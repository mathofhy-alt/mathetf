'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useCart } from '@/components/providers/CartProvider';

type Material = { id: string; type: 'PDF' | 'HWP'; price: number };

// 시험지 상세 '문제+해설 원본' 카드(새 디자인). 수익이 나는 버튼이라 접지 않고 늘 펼쳐 둔다.
export default function PaidMaterialChoice({ examId, title, materials }: { examId: string; title: string; materials: Material[] }) {
  const router = useRouter();
  const { addToCart } = useCart();
  const [selectedId, setSelectedId] = useState(materials[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const selected = materials.find(item => item.id === selectedId) || materials[0];

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('material');
    if (requested && materials.some(item => item.id === requested)) setSelectedId(requested);
  }, [materials]);

  const continueToCart = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const { data: { session } } = await createClient().auth.getSession();
      if (!session) {
        router.push(`/login?next=${encodeURIComponent(`/exam/${examId}?material=${selected.id}`)}`);
        return;
      }
      await addToCart({ item_type: selected.type === 'HWP' ? 'HWP_DOC' : 'MOCK_EXAM', item_id: selected.id, title: `${title} · 문제+해설 ${selected.type}`, price: selected.price });
      router.push('/cart');
    } catch (error: any) {
      if (String(error?.message || '').includes('ALREADY_IN_CART')) router.push('/cart');
      else setNotice(error?.message || '자료를 장바구니에 담지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="rd-get-card is-zone">
    <p className="rd-get-kicker is-gray">해설이 필요하다면</p>
    <h2 className="rd-get-title">문제+해설 원본</h2>
    <fieldset className="rd-fmt">
      <legend className="sr-only">파일 형식</legend>
      {materials.map(item => <label key={item.id} className={`rd-fmt-opt ${selected?.id === item.id ? 'is-on' : ''}`}>
        <span><input type="radio" name={`paid-material-${examId}`} checked={selected?.id === item.id} onChange={() => setSelectedId(item.id)} />{item.type === 'HWP' ? '한글 HWP' : 'PDF'}</span>
        <b>{item.price.toLocaleString()}원</b>
      </label>)}
    </fieldset>
    {notice && <p role="alert" className="rd-op-error">{notice}</p>}
    <button type="button" onClick={continueToCart} disabled={busy || !selected} className="rd-cart-btn"><ShoppingCart size={18} aria-hidden="true" />{busy ? '확인하는 중' : '장바구니에 담기'}</button>
    <p className="rd-get-foot">결제 후 바로 내려받고 30일간 이용합니다.</p>
  </div>;
}
