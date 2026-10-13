'use client';

import { useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

/**
 * [10/13] Microsoft Clarity 꼬리표 — '강사는 어디서 나가나'를 따로 보려고 세션에 역할·회원·이용권 여부만 붙인다.
 * 이메일·이름 같은 식별 정보는 보내지 않는다. 이용권 확인(/api/qb-pass)은 DB 를 읽으니 브라우저 세션당 한 번만.
 * Clarity 스크립트는 layout.tsx 가 운영 도메인에서만 넣는다 — 없으면 아무것도 안 한다.
 */
const KEY = 'mathetf_clarity_tags';

export default function ClarityTags() {
    useEffect(() => {
        const c = (window as any).clarity;
        if (typeof c !== 'function') return;
        let tags: Record<string, string> | null = null;
        try { tags = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { }
        const apply = (t: Record<string, string>) => { for (const [k, v] of Object.entries(t)) c('set', k, v); };
        if (tags) { apply(tags); return; }
        (async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
            const t: Record<string, string> = { member: user ? 'yes' : 'no', role: 'unknown', pass: 'no' };
            if (user) {
                const { data } = await supabase.from('profiles').select('persona').eq('id', user.id).maybeSingle();
                t.role = data?.persona || 'unknown';
                const p = await fetch('/api/qb-pass').then(r => r.json()).catch(() => null);
                if (p?.passUntil) t.pass = 'yes';
            } else {
                try { t.role = localStorage.getItem('mathetf_role') || 'unknown'; } catch { }
            }
            try { sessionStorage.setItem(KEY, JSON.stringify(t)); } catch { }
            apply(t);
        })();
    }, []);
    return null;
}
