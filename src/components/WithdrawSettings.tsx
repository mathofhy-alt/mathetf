'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { UserX } from 'lucide-react';

/**
 * [2026-11-25] 마이페이지 > 설정 — 회원 탈퇴(대표 지시). 비밀번호 재확인 + 「탈퇴」 입력.
 * 탈퇴하면 같은 휴대폰 번호로 7일 동안 다시 가입할 수 없다.
 */
export default function WithdrawSettings() {
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setMsg(null);
        if (confirm.trim() !== '탈퇴') return setMsg('확인 칸에 「탈퇴」를 입력해 주세요.');
        setBusy(true);
        try {
            const res = await fetch('/api/auth/withdraw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, confirm: confirm.trim() }) });
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.ok) throw new Error(j.message || '탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요.');
            await createClient().auth.signOut().catch(() => {});
            window.location.href = '/?withdrawn=1';
            return;
        } catch (err: any) {
            setMsg(err?.message || '탈퇴하지 못했어요.');
        }
        setBusy(false);
    };

    return (
        <section className="rd-my-card">
            <h3 className="rd-my-card-title">
                <span className="rd-my-card-icon"><UserX size={18} /></span> 회원 탈퇴
            </h3>
            <p className="rd-my-card-text">
                탈퇴하면 계정과 저장한 시험지·폴더·이용 기록이 삭제되고, 남은 포인트와 구매한 자료의 다운로드 권한은 사라집니다.
                결제 기록은 관계 법령에 따라 정해진 기간 동안 보관됩니다. <b>탈퇴한 휴대폰 번호로는 7일 동안 다시 가입할 수 없어요.</b>
            </p>
            {!open ? (
                <button type="button" className="rd-btn rd-my-form-submit" onClick={() => setOpen(true)}>탈퇴하기</button>
            ) : (
                <form onSubmit={submit} className="rd-my-form">
                    <label className="rd-my-label">현재 비밀번호
                        <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="rd-input" />
                    </label>
                    <label className="rd-my-label"><span>확인 <span className="rd-my-label-sub">(「탈퇴」라고 입력)</span></span>
                        <input type="text" required value={confirm} onChange={e => setConfirm(e.target.value)} className="rd-input" placeholder="탈퇴" />
                    </label>
                    {msg && <p role="alert" className="rd-auth-error rd-my-form-msg">{msg}</p>}
                    <button type="submit" disabled={busy} className="rd-btn rd-btn-primary rd-my-form-submit">{busy ? '처리 중…' : '탈퇴 확정'}</button>
                    <button type="button" disabled={busy} className="rd-btn rd-my-form-submit" onClick={() => { setOpen(false); setPassword(''); setConfirm(''); setMsg(null); }}>취소</button>
                </form>
            )}
        </section>
    );
}
