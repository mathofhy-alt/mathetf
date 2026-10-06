"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import PersonaAsk from '@/components/PersonaAsk';
import NotifyOptIn from '@/components/NotifyOptIn';
import ExamPromoModal from '@/components/ExamPromoModal';
import { logAnon } from '@/lib/anon-log';

/**
 * 시험지 상세페이지의 '무료 문제 PDF' CTA.
 * - 비로그인/크롤러(기본): 혜택 강조 + 회원가입 CTA (전환 유도).
 * - 로그인: 워터마크 없는 문제 PDF 즉시 다운로드.
 * 페이지는 ISR 정적 캐시라 로그인 여부는 클라이언트에서 판별한다.
 */
export default function FreeProblemCTA({ examId, filename, sourceKey, school }: { examId: string; filename: string; sourceKey?: string | null; school?: string; compact?: boolean }) {
    const [authed, setAuthed] = useState<boolean | null>(null);
    const [marketingAgreed, setMarketingAgreed] = useState(true); // 기본 true → 확인 전엔 배너 안 뜸
    const [showNotify, setShowNotify] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [resumeDownload, setResumeDownload] = useState(false);
    // [2026-09-07] 다운로드 직후 '해설 포함 한글파일' 안내. 예상문제·프린트변형엔 붙어 있었는데
    //   무료PDF 에만 연결이 없어서, 무료PDF 를 받은 308명은 이 안내를 한 번도 못 봤다.
    const [showPromo, setShowPromo] = useState(false);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('download') === 'free') {
            setResumeDownload(true);
            window.setTimeout(() => document.getElementById('free-problem-pdf')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            setAuthed(!!data.user);
            setMarketingAgreed(!!data.user?.user_metadata?.marketing_agreed);
        }).catch(() => setAuthed(false));
    }, []);

    const [askPersona, setAskPersona] = useState(false);

    // [익명 계측] 비로그인에게 가입 유도 배너가 실제로 보인 시점.
    // authed === false 로 확정된 뒤에만 — null(판정 전)에 쏘면 로그인 사용자까지 섞인다.
    useEffect(() => {
        if (authed === false) logAnon('anon_cta_view', examId);
    }, [authed, examId]);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            // [2026-09-02] URL 을 서버에서 발급받는다. 하루 상한(10건)을 서버에서 걸기 위함 —
            // 예전엔 free_pdf_url 을 그대로 넘겨받아 받았기 때문에 상한을 걸 자리가 없었다.
            const issued = await fetch('/api/free-pdf', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: examId, title: filename }),
            });
            const issuedJson = await issued.json();
            if (!issued.ok) throw new Error(issuedJson?.error || '무료 PDF를 준비 중입니다.');
            const res = await fetch(issuedJson.url as string);
            if (!res.ok) throw new Error(`status ${res.status}`);
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.setAttribute('download', filename);
            document.body.appendChild(a);
            a.click();
            a.remove();
            setResumeDownload(false);
            if (new URLSearchParams(window.location.search).get('download') === 'free') {
                const nextUrl = new URL(window.location.href);
                nextUrl.searchParams.delete('download');
                window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
            }
            // [수정] 즉시 revoke하면 다운로드 시작 전에 URL이 폐기돼 간헐 실패 → 40초 뒤 정리
            setTimeout(() => window.URL.revokeObjectURL(url), 40_000);
            // 로그는 /api/free-pdf 가 발급 시점에 남긴다(상한 계산의 근거라 누락되면 안 됨).
            // ⚠ 순서: 해설 안내(모달)를 먼저 띄우고, 역할 묻기는 그 뒤로 미룬다.
            //   받은 사람의 결핍은 '답이 없다' 하나다. 그 순간에 알림 신청·역할부터 물으면
            //   정작 필요한 안내가 묻힌다.
            // [2026-09-08] 한 번에 하나만 띄운다. 그전엔 프로모 모달과 알림 배너가 **동시에** 떴다
            //   (알림은 마케팅 미동의자용인데, 무료PDF 를 받는 사람 대부분이 미동의자다).
            //   순서: 프로모 → 역할 묻기 → 알림 옵트인.
            const promo = !!sourceKey;   // [10/6] '오늘 하루 보지 않기' 무시 — 받을 때마다 띄운다
            if (promo) setShowPromo(true);
            // [persona] 회원 613명 중 301명(49%)이 역할 미응답이다. 온보딩 모달은 홈에서만 뜨는데
            // 유입은 네이버 검색으로 이 페이지에 곧장 떨어져 물어볼 기회가 없었다.
            // 자료를 받은 직후 여기서 한 번만 묻는다(다운로드는 안 막는다).
            if (!promo) setAskPersona(true);   // 프로모가 뜨면 닫힌 뒤에 묻는다
        } catch (e: any) {
            // 상한 안내는 서버 문구를 그대로 — '준비 중' 으로 뭉뚱그리면 왜 안 되는지 모른다.
            alert(e?.message || '무료 문제 PDF를 준비 중입니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div id="free-problem-pdf" className="rd-get-card">
            {resumeDownload && authed && <p role="status" className="rd-get-status">로그인했습니다. 아래 버튼을 누르면 바로 받을 수 있어요.</p>}
            <p className="rd-get-kicker">회원 무료</p>
            <h2 className="rd-get-title">문제 전체 PDF</h2>
            <p className="rd-get-text">워터마크 없는 깨끗한 문제지예요. 하루 10회까지 받을 수 있고, 해설은 없습니다.</p>
            {authed ? (
                <button type="button" onClick={handleDownload} disabled={downloading} className="rd-btn rd-btn-primary rd-btn-block">
                    <Download size={18} aria-hidden="true" /> {downloading ? '받는 중' : '무료로 받기'}
                </button>
            ) : (
                <>
                    <Link href={`/signup?next=${encodeURIComponent(`/exam/${examId}?download=free`)}`} onClick={() => logAnon('anon_cta_click', examId)} className="rd-btn rd-btn-primary rd-btn-block">
                        무료로 받기
                    </Link>
                    <p className="rd-get-foot">회원가입 후 바로 받아요. 이미 회원이면 <Link href={`/login?next=${encodeURIComponent(`/exam/${examId}?download=free`)}`}>로그인</Link></p>
                </>
            )}
            {showPromo && (
                <ExamPromoModal
                    src={sourceKey || undefined}
                    school={school}
                    allowHideToday={false}
                    onClose={() => { setShowPromo(false); setAskPersona(true); }}
                />
            )}
            <NotifyOptIn school={filename.split('_')[0] || ''} visible={showNotify} onClose={() => setShowNotify(false)} />
            <PersonaAsk visible={askPersona} onDone={() => { setAskPersona(false); if (!marketingAgreed) setShowNotify(true); }} />
        </div>
    );
}
