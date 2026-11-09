'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { profilePersona, type ProfilePersona } from './role-cta';

/** 본인 프로필만 조회하며 브라우저에 저장된 역할은 판단에 쓰지 않는다. */
export function useProfilePersona(enabled: boolean) {
    const [state, setState] = useState<{ persona: ProfilePersona; ready: boolean }>({ persona: 'unknown', ready: false });
    useEffect(() => {
        if (!enabled) return;
        const sb = createClient();
        let active = true, generation = 0;
        const load = async () => {
            const request = ++generation;
            setState({ persona: 'unknown', ready: false });
            let persona: ProfilePersona = 'unknown';
            try {
                const { data: { user }, error } = await sb.auth.getUser();
                if (user && !error) {
                    const result = await sb.from('profiles').select('persona').eq('id', user.id).maybeSingle();
                    if (!result.error) persona = profilePersona(result.data?.persona);
                }
            } catch { /* 비로그인·조회 실패는 공통형으로 표시한다. */ }
            if (active && generation === request) setState({ persona, ready: true });
        };
        void load();
        const { data: { subscription } } = sb.auth.onAuthStateChange(() => {
            // 인증 콜백 안에서 getUser를 기다리면 인증 잠금이 풀리지 않을 수 있다.
            window.setTimeout(() => { if (active) void load(); }, 0);
        });
        return () => { active = false; generation++; subscription.unsubscribe(); };
    }, [enabled]);
    return state;
}
