'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { useCart } from '@/components/providers/CartProvider';

type Material = { id: string; type: 'PDF' | 'HWP'; price: number };

export default function PaidMaterialChoice({ examId, title, materials }: { examId: string; title: string; materials: Material[] }) {
  const router = useRouter();
  const { addToCart } = useCart();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(materials[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const selected = materials.find(item => item.id === selectedId) || materials[0];

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('material');
    if (requested && materials.some(item => item.id === requested)) {
      setSelectedId(requested);
      setOpen(true);
    }
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

  return <div className="rounded-2xl border border-[#E4DDCE] bg-[#FBF8F0] p-4">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="block w-full text-left">
      <span className="block text-[11px] font-extrabold tracking-[0.1em] text-[#9C7A4B]">해설이 필요하다면</span>
      <strong className="mt-1 block text-sm text-[#4F493E]">문제+해설 PDF·HWP 보기 {open ? '⌃' : '→'}</strong>
      <span className="mt-1 block text-xs leading-5 text-[#847A68]">결제 완료 후 즉시 다운로드 · 30일간 이용</span>
    </button>
    {open && <div className="mt-4 border-t border-[#E9DFCB] pt-4">
      <p className="text-xs font-bold leading-5 text-[#5D5547]">{title}</p>
      <fieldset className="mt-3 space-y-2"><legend className="mb-2 text-xs text-[#756B59]">필요한 파일을 선택하세요</legend>
        {materials.map(item => <label key={item.id} className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-3 text-sm ${selected?.id === item.id ? 'border-[#9D835C] bg-white font-bold text-[#3E3A32]' : 'border-[#E6DCC8] text-[#665F54]'}`}>
          <span className="flex items-center gap-2"><input type="radio" name={`paid-material-${examId}`} checked={selected?.id === item.id} onChange={() => setSelectedId(item.id)} />문제+해설 {item.type}</span>
          <strong>{item.price.toLocaleString()}원</strong>
        </label>)}
      </fieldset>
      <p className="mt-3 text-xs leading-5 text-[#756B59]">선택한 파일을 확인한 뒤 장바구니에서 결제합니다. 결제 완료 후 즉시 다운로드할 수 있습니다.</p>
      {notice && <p role="alert" className="mt-2 text-xs text-red-700">{notice}</p>}
      <button type="button" onClick={continueToCart} disabled={busy || !selected} className="mt-4 w-full rounded-xl bg-[#193740] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? '확인 중…' : '선택한 파일 장바구니에 담기 →'}</button>
      <Link href="/guide#access" className="mt-3 block text-center text-xs text-[#766A55] underline">다운로드·이용 범위 안내</Link>
    </div>}
  </div>;
}
