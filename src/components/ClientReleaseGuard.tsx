'use client';

import { useEffect, useState } from 'react';

export default function ClientReleaseGuard() {
    const [stale, setStale] = useState(false);
    useEffect(() => {
        const release = process.env.NEXT_PUBLIC_CLIENT_RELEASE || '20261108-download-v2';
        let active = true;
        const check = async () => {
            if (document.visibilityState === 'hidden') return;
            try {
                const response = await fetch('/api/client-release', { cache: 'no-store' });
                if (!response.ok) return;
                const data = await response.json();
                if (active && typeof data.release === 'string' && data.release !== release) setStale(true);
            } catch { /* A temporary offline state does not invalidate the page. */ }
        };
        void check();
        const timer = window.setInterval(check, 60_000);
        document.addEventListener('visibilitychange', check);
        window.addEventListener('focus', check);
        return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
    }, []);
    if (!stale) return null;
    return <div role="dialog" aria-modal="true" aria-label="사이트 업데이트 안내" style={{ position:'fixed', inset:0, zIndex:2147483647, background:'rgba(15,23,42,.9)', display:'grid', placeItems:'center', padding:24 }}>
        <div style={{ background:'white', color:'#0f172a', borderRadius:16, padding:28, maxWidth:420, lineHeight:1.7 }}>
            <h2>사이트가 업데이트되었습니다.</h2>
            <p>다운로드와 등록을 계속하시려면 새로고침해 주세요. 작성 중인 내용은 먼저 복사해 보관해 주세요.</p>
            <button autoFocus onClick={() => window.location.reload()} style={{ background:'#1d4ed8', color:'white', padding:'10px 18px', borderRadius:8 }}>새로고침</button>
        </div>
    </div>;
}
