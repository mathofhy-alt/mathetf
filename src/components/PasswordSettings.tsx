'use client';
import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { KeyRound } from 'lucide-react';

/**
 * [10/5] 마이페이지 > 설정 — 비밀번호 변경.
 * 로그인한 채 자리를 비운 화면에서 남이 바꾸지 못하게 현재 비밀번호를 먼저 확인한다(같은 계정으로 다시 로그인 시도).
 * 비밀번호를 잊었으면 로그아웃 후 '비밀번호 찾기'(이메일 링크) 쪽이다.
 */
export default function PasswordSettings() {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;
        setMsg(null);
        if (next.length < 6) return setMsg({ ok: false, text: '새 비밀번호는 6자 이상으로 정해 주세요.' });
        if (next !== confirm) return setMsg({ ok: false, text: '새 비밀번호 두 칸이 서로 달라요.' });
        if (next === current) return setMsg({ ok: false, text: '지금 쓰는 비밀번호와 다른 비밀번호로 정해 주세요.' });
        setSaving(true);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.email) throw new Error('로그인 정보를 확인할 수 없어요. 다시 로그인해 주세요.');
            const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
            if (authError) throw new Error('현재 비밀번호가 맞지 않아요.');
            const { error } = await supabase.auth.updateUser({ password: next });
            if (error) throw new Error(/different|same/i.test(error.message) ? '지금 쓰는 비밀번호와 다른 비밀번호로 정해 주세요.' : '비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.');
            setCurrent(''); setNext(''); setConfirm('');
            setMsg({ ok: true, text: '비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.' });
        } catch (err: any) {
            setMsg({ ok: false, text: err?.message || '비밀번호를 바꾸지 못했어요.' });
        }
        setSaving(false);
    };

    const input = 'mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:border-[#426D36]';
    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <h3 className="font-extrabold text-[#294437] flex items-center gap-2">
                <KeyRound size={16} className="text-[#426D36]" /> 비밀번호 변경
            </h3>
            <p className="text-sm text-slate-500 mt-1.5 break-keep">현재 비밀번호를 확인한 뒤 새 비밀번호로 바꿉니다. 비밀번호가 기억나지 않으면 로그아웃 후 로그인 화면의 ‘비밀번호 찾기’를 이용하세요.</p>
            <form onSubmit={submit} className="mt-4 grid gap-3 sm:max-w-sm">
                <label className="text-xs font-bold text-slate-600">현재 비밀번호
                    <input type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} className={input} />
                </label>
                <label className="text-xs font-bold text-slate-600">새 비밀번호 <span className="font-normal text-slate-400">(6자 이상)</span>
                    <input type="password" autoComplete="new-password" required minLength={6} value={next} onChange={e => setNext(e.target.value)} className={input} />
                </label>
                <label className="text-xs font-bold text-slate-600">새 비밀번호 확인
                    <input type="password" autoComplete="new-password" required minLength={6} value={confirm} onChange={e => setConfirm(e.target.value)} className={input} />
                </label>
                {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm font-semibold ${msg.ok ? 'text-[#426D36]' : 'text-red-600'}`}>{msg.text}</p>}
                <button type="submit" disabled={saving} className="mt-1 w-fit rounded-xl bg-[#294437] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? '바꾸는 중…' : '비밀번호 바꾸기'}</button>
            </form>
        </div>
    );
}
