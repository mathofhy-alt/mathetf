'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Bell, Check } from 'lucide-react';

/**
 * [수신설정] 마케팅 정보 수신 동의 켜기/끄기.
 *
 * 왜 만들었나: 2026-09-05 에 배포한 마케팅 동의문이 "마이페이지 > 설정에서 수신 동의를 끄시거나"
 * 라고 안내하는데 **그런 화면이 없었다.** 없는 걸 있다고 적어둔 상태였다.
 * 정보통신망법이 요구하는 '수신 거부 방법'이기도 하다.
 *
 * ⚠ 매체(이메일/문자)를 나눠 받지는 않는다 — 지금 동의문이 둘을 묶어 고지하고 있어
 *   화면만 쪼개면 문구와 어긋난다. 나눌 거면 동의문부터 고쳐야 한다.
 */
export default function MarketingSettings() {
    const [agreed, setAgreed] = useState<boolean | null>(null);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        createClient().auth.getUser()
            .then(({ data }) => setAgreed(!!data.user?.user_metadata?.marketing_agreed))
            .catch(() => setAgreed(false));
    }, []);

    const toggle = async () => {
        if (agreed === null || saving) return;
        const next = !agreed;
        setSaving(true); setMsg(null);
        try {
            const r = await fetch('/api/marketing-consent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agreed: next }),
            });
            if (!r.ok) throw new Error();
            setAgreed(next);
            setMsg(next ? '이제 새 기출 소식을 보내드릴게요.' : '수신거부 처리됐어요.');
        } catch {
            setMsg('처리에 실패했어요. 잠시 후 다시 시도해 주세요.');
        }
        setSaving(false);
    };

    return (
        <section className="rd-my-card">
            <div className="rd-my-set-row">
                <div className="rd-my-set-txt">
                    <h3 className="rd-my-card-title">
                        <span className="rd-my-card-icon"><Bell size={18} /></span> 새 기출 알림 받기
                    </h3>
                    <p className="rd-my-card-text">
                        관심 학교에 새 기출이 올라오면 <strong>이메일·문자</strong>로 알려드려요.
                    </p>
                    <p className="rd-my-card-hint">야간(21~08시)에는 보내지 않습니다. 언제든 끄실 수 있어요.</p>
                </div>
                <button
                    type="button"
                    onClick={toggle}
                    disabled={agreed === null || saving}
                    aria-pressed={!!agreed}
                    aria-label="새 기출 알림 받기"
                    className={`rd-my-switch${agreed ? ' is-on' : ''}`}
                >
                    <span className="rd-my-switch-knob">
                        {agreed && <Check size={14} />}
                    </span>
                </button>
            </div>
            {msg && <p className="rd-my-card-msg" role="status">{msg}</p>}
        </section>
    );
}
