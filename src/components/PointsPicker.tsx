'use client';

import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

/**
 * 결제 창의 포인트 사용 칸 (2026-10-24 대표) — 예전엔 체크하면 보유 포인트가 전부 들어갔다.
 * 회원이 쓸 만큼 1,000P 단위로 고른다. '최대'는 보유·결제 금액 중 작은 값 그대로(1,000 단위가 아니어도 전액 포인트 결제가 되게).
 * 이용권 결제 창(PassModal)·개인DB 결제 창(MyDbRequests)이 같이 쓴다.
 */
export const POINT_STEP = 1000;

export default function PointsPicker({ points, total, value, onChange }: { points: number; total: number; value: number; onChange: (v: number) => void }) {
    const max = Math.max(0, Math.min(points, total));
    const clamp = (v: number) => (v >= max ? max : Math.max(0, Math.floor(v / POINT_STEP) * POINT_STEP));
    // 직접 적는 중에는 그대로 두고, 칸을 벗어날 때 1,000 단위로 맞춘다(한 글자마다 맞추면 '5000' 을 칠 수가 없다)
    const [draft, setDraft] = useState<string | null>(null);
    useEffect(() => { setDraft(null); }, [value]);
    return (
        <div className="rd-pass-points rd-pts">
            <span>포인트 사용 <small>보유 {points.toLocaleString()}P</small></span>
            {max <= 0 ? <small className="rd-pts-none">{points <= 0 ? '쓸 수 있는 포인트가 없어요' : ''}</small> : (
                <div className="rd-pts-ctl">
                    <button type="button" aria-label="1,000P 줄이기" onClick={() => onChange(clamp(value === max && max % POINT_STEP ? Math.floor(max / POINT_STEP) * POINT_STEP : value - POINT_STEP))} disabled={value <= 0}><Minus size={16} /></button>
                    <input type="text" inputMode="numeric" aria-label="사용할 포인트" value={draft ?? value.toLocaleString()}
                        onFocus={e => e.target.select()}
                        onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
                        onBlur={() => { if (draft !== null) { const v = clamp(Number(draft) || 0); setDraft(null); onChange(v); } }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    <button type="button" aria-label="1,000P 늘리기" onClick={() => onChange(clamp(value + POINT_STEP))} disabled={value >= max}><Plus size={16} /></button>
                    <button type="button" className="rd-pts-max" onClick={() => onChange(max)} disabled={value >= max}>최대</button>
                </div>
            )}
        </div>
    );
}
