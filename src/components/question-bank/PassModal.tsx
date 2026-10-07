"use client";

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { payOrder } from '@/lib/payments/client';
import { QB_PASS } from '@/lib/qbPassConfig';
import RefundPolicyModal from '@/components/RefundPolicyModal';
import { createClient } from '@/utils/supabase/client';

export type PassInfo = { unlimited: boolean; passUntil: string | null; freePerWeek: number; usedThisWeek: number; freeLeft: number; resetsAt: string; viewers?: number | null };

const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };

/** 하단 바·마이페이지에 쓰는 한 줄 (10/7) */
export function passLine(p: PassInfo | null): string {
    if (!p) return '';
    if (p.passUntil) return `이용권 ${md(p.passUntil)}까지`;
    if (p.unlimited) return '';
    return p.freeLeft > 0 ? `이번 주 무료 ${p.freeLeft}회 남음` : `이번 주 무료 다 씀 · ${md(p.resetsAt)}에 다시 ${p.freePerWeek}회`;
}

/**
 * 시험지 만들기 이용권 결제 창 (10/7). 무료 횟수를 다 쓰고 저장하려 할 때, 또는 직접 열 때.
 * 결제는 장바구니와 같은 payOrder(서버 주문 → 포트원 → 서버 확인). 모바일은 결제 후 /payments/return 으로 돌아온다.
 */
export default function PassModal({ user, info, onClose, onPaid }: { user: any; info: PassInfo | null; onClose: () => void; onPaid: () => void }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    // [10/7] 환불 불가 동의 — 사용자 결정(사용 0회여도 환불 안 함). 동의해야 결제 버튼이 눌린다.
    const [agree, setAgree] = useState(false);
    const [showRefund, setShowRefund] = useState(false);
    // [10/8] 휴대폰 번호가 없는 계정(회원 1,319명 중 6명, 예전 가입) — 포트원 카드 결제가 전화번호를 필수로 요구한다
    const needPhone = !(user?.user_metadata?.phone || user?.phone);
    const [phone, setPhone] = useState('');
    const phoneOk = !needPhone || /^01[016789]\d{7,8}$/.test(phone.replace(/[^0-9]/g, ''));
    const buy = async () => {
        if (busy || !agree || !phoneOk) return;
        setBusy(true); setErr('');
        try {
            const digits = phone.replace(/[^0-9]/g, '');
            if (needPhone) await createClient().auth.updateUser({ data: { phone: digits } }).catch(() => null);   // 다음 결제부터는 묻지 않게
            await payOrder(user, { kind: 'cart', items: [{ item_id: QB_PASS.itemId }], usedPoints: 0 }, needPhone ? digits : undefined); onPaid();
        }
        catch (e: any) { setErr(e?.message || '결제를 마치지 못했습니다.'); }
        setBusy(false);
    };
    const out = info && !info.unlimited && info.freeLeft <= 0;
    return (
        <div className="rd rd-overlay" style={{ zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="rd-modal rd-modal-sm rd-pass" role="dialog" aria-modal="true" aria-labelledby="pass-title">
                <div className="rd-sheet-handle" aria-hidden="true" />
                <div className="rd-modal-head">
                    <h2 id="pass-title" className="rd-modal-title">{out ? '이번 주 무료 시험지를 다 쓰셨어요' : '시험지 만들기 이용권'}</h2>
                    <button type="button" className="rd-modal-x" aria-label="닫기" onClick={onClose}><X size={20} /></button>
                </div>
                <p className="rd-modal-text">
                    {out ? <>무료로는 한 주에 {QB_PASS.freePerWeek}개까지 만들 수 있어요. {info && <>{md(info.resetsAt)} 월요일에 다시 {QB_PASS.freePerWeek}개가 생깁니다.</>}</>
                        : <>이용권이 있으면 기간 동안 시험지를 횟수 제한 없이 만들 수 있어요.</>}
                </p>
                <div className="rd-pass-card">
                    {/* [10/8] 최근 30분 이용자 수 — 사실 그대로의 문구, 3명 미만이면 서버가 null(숨김) */}
                    {info?.viewers ? <p className="rd-pass-bubble" role="status"><span className="rd-pass-dot" aria-hidden="true" />최근 30분 동안 <b>{info.viewers}명</b>이 시험지 만들기를 이용했어요</p> : null}
                    <p className="rd-pass-name">{QB_PASS.days}일 이용권</p>
                    <p className="rd-pass-price"><b>{QB_PASS.salePrice.toLocaleString()}</b>원</p>
                    <ul>
                        <li><Check size={16} aria-hidden="true" /> 시험지 만들기 횟수 제한 없음</li>
                        <li><Check size={16} aria-hidden="true" /> 결제한 날부터 {QB_PASS.days}일, 자동 결제 없음</li>
                        <li><Check size={16} aria-hidden="true" /> 기간 중에 다시 사면 끝나는 날에 {QB_PASS.days}일이 이어 붙어요</li>
                    </ul>
                </div>
                {needPhone && <label className="rd-pass-phone">
                    <span>결제에 쓸 휴대폰 번호 <small>카드 결제에 꼭 필요해요</small></span>
                    <input type="tel" inputMode="numeric" autoComplete="tel" placeholder="01012345678" value={phone} onChange={e => setPhone(e.target.value)} className="rd-input" />
                </label>}
                <label className="rd-pass-agree">
                    <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
                    <span>이용권은 결제 즉시 이용이 시작되어, <b>결제 후에는 사용하지 않았더라도 환불되지 않는다</b>는 데 동의합니다. <button type="button" onClick={() => setShowRefund(true)}>환불 정책 보기</button></span>
                </label>
                {err && <p className="rd-pass-err" role="alert">{err}</p>}
                <div className="rd-modal-actions">
                    <button type="button" className="rd-btn rd-btn-primary rd-btn-block" onClick={buy} disabled={busy || !agree || !phoneOk}>{busy ? '결제 진행 중…' : `${QB_PASS.salePrice.toLocaleString()}원 결제하기`}</button>
                    <button type="button" className="rd-btn rd-btn-gray rd-btn-block" onClick={onClose}>{out ? '다음 주에 할게요' : '닫기'}</button>
                </div>
                <p className="rd-pass-fine">담아 둔 문항은 그대로 남아 있어요. 결제 후 다시 저장을 누르면 됩니다.</p>
            </div>
            {showRefund && <div style={{ position: 'relative', zIndex: 310 }}><RefundPolicyModal isOpen onClose={() => setShowRefund(false)} /></div>}
        </div>
    );
}
