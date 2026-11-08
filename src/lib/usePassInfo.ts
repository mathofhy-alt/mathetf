"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PassInfo } from '@/components/question-bank/PassModal';

/** 새 탭 결제 후 현재 작업을 유지한 채 권한만 갱신한다. 늦게 온 옛 응답은 버린다. */
export function usePassInfo(enabled = true) {
    const [info, setInfo] = useState<PassInfo | null>(null);
    const generation = useRef(0);
    const mounted = useRef(false);
    const refresh = useCallback(async () => {
        const current = ++generation.current;
        if (!enabled) return;
        try {
            const response = await fetch('/api/qb-pass', { cache: 'no-store' });
            const data = await response.json();
            if (mounted.current && current === generation.current && response.ok && !data.error)
                setInfo(data.loggedIn ? data : null);
        } catch { /* 일시적 조회 실패에는 마지막으로 확인한 상태를 유지한다. */ }
    }, [enabled]);
    useEffect(() => {
        mounted.current = true;
        if (!enabled) setInfo(null);
        void refresh();
        const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
        window.addEventListener('focus', resume);
        document.addEventListener('visibilitychange', resume);
        return () => {
            mounted.current = false;
            generation.current++;
            window.removeEventListener('focus', resume);
            document.removeEventListener('visibilitychange', resume);
        };
    }, [enabled, refresh]);
    return { info, setInfo, refresh };
}
