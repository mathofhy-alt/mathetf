'use client';
import { BUNDLE_KEEP_DAYS } from '@/lib/qbPassConfig';

import { useEffect, useState } from 'react';
import { downloadPrintBundle } from '@/lib/pdfDownload';

type Bundle = { id: string; title: string; createdAt: string; expiresAt: string; questions: number | null };
export default function PrintBundles() {
    const [bundles, setBundles] = useState<Bundle[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState('');
    const [status, setStatus] = useState('');
    const load = async () => {
        setLoading(true); setError('');
        try {
            const r = await fetch('/api/print/bundles', { cache: 'no-store' });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || '묶음을 불러오지 못했어요.');
            setBundles(j.bundles || []);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { void load(); }, []);
    // 열린 화면에서도 만료된 묶음이 목록에 남지 않는다. 서버도 모든 받기 경로에서 재검사한다.
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
    const receive = async (b: Bundle, format: 'pdf' | 'hwp') => {
        setBusy(b.id); setError('');
        try {
            if (format === 'pdf') await downloadPrintBundle(b.id, setStatus);
            else {
                const r = await fetch('/api/predict/hwp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: b.id }) });
                if (!r.ok) { const j = await r.json(); throw new Error(j.error || '한글을 받지 못했어요.'); }
                const url = URL.createObjectURL(await r.blob());
                const a = document.createElement('a'); a.href = url; a.download = `${b.title}.hml`;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 40_000);
            }
        } catch (e: any) { setError(e.message); }
        finally { setBusy(''); setStatus(''); }
    };
    return <section className="rd-my-reqsec" aria-labelledby="my-print-bundles">
        <h2 id="my-print-bundles" className="rd-my-sec-title">프린트 변형 다시 받기</h2>
        <p>유료로 만든 묶음은 만든 시각부터 {BUNDLE_KEEP_DAYS}일 동안 PDF·한글을 추가 차감 없이 받을 수 있어요.</p>
        {loading && <p role="status">묶음을 불러오는 중…</p>}
        {error && <p role="alert">{error} <button className="rd-btn rd-btn-gray" onClick={() => void load()}>목록 새로고침</button></p>}
        {status && <p role="status">{status}</p>}
        {!loading && !error && !bundles.some(b => Date.parse(b.expiresAt) > now) && <p>보관 중인 프린트 변형 묶음이 없어요.</p>}
        <ul>{bundles.filter(b => Date.parse(b.expiresAt) > now).map(b => <li key={b.id} style={{ padding: '16px 0', borderBottom: '1px solid var(--rd-line, #ddd)' }}>
            <b>{b.title}</b>{b.questions != null && <span> · {b.questions}문항</span>}
            <p>{new Date(b.createdAt).toLocaleString('ko-KR')} 생성 · {new Date(b.expiresAt).toLocaleString('ko-KR')}까지</p>
            <div style={{ display: 'flex', gap: 8 }}>
                <button className="rd-btn rd-btn-primary" disabled={!!busy} onClick={() => void receive(b, 'pdf')}>PDF 다시 받기</button>
                <button className="rd-btn rd-btn-gray" disabled={!!busy} onClick={() => void receive(b, 'hwp')}>한글 다시 받기</button>
            </div>
        </li>)}</ul>
    </section>;
}
