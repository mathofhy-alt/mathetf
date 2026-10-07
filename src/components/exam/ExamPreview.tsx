'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

/**
 * 시험지 상세 미리보기(새 디자인). 한 장씩 보여주고 아래 단추로 넘긴다.
 * A4 비율로 틀을 고정해 쪽을 넘겨도 본문이 출렁이지 않는다.
 * [10/7] 비회원은 1쪽만, 회원은 전부(사용자 결정). 페이지 HTML 에는 1쪽 주소만 있고,
 *   로그인한 회원이면 /api/exam-previews/[id] 에서 나머지 쪽 주소를 받아 채운다.
 */
//   모의고사 페이지는 지금처럼 전부 공개 — images 로 다 넘긴다(그러면 회원 확인을 안 한다).
type Props = { label: string } & ({ images: string[]; examId?: undefined; first?: undefined; total?: undefined } | { images?: undefined; examId: string; first: string; total: number });
export default function ExamPreview(props: Props) {
    const { label, examId } = props;
    const first = props.images ? props.images[0] : props.first;
    const total = props.images ? props.images.length : props.total;
    const [i, setI] = useState(0);
    const [images, setImages] = useState<string[]>(props.images || [first]);
    const [member, setMember] = useState<boolean | null>(null);
    useEffect(() => {
        if (!examId || total <= 1) return;
        let alive = true;
        createClient().auth.getSession().then(async ({ data }) => {
            if (!alive) return;
            if (!data.session) { setMember(false); return; }
            setMember(true);
            try {
                const r = await fetch(`/api/exam-previews/${examId}`, { cache: 'no-store' });
                const j = await r.json();
                if (alive && r.ok && Array.isArray(j.urls) && j.urls.length) setImages(j.urls);
            } catch { }
        });
        return () => { alive = false; };
    }, [examId, total]);
    const n = total;
    if (!first || n === 0) return null;
    const locked = i > 0 && !images[i];
    const next = encodeURIComponent(`/exam/${examId}#exam-preview-title`);   // 로그인·가입 뒤 이 시험지로
    return (
        <div>
            <div className="rd-x-stage">
                {images.map((url, idx) => url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={idx} src={url} alt={`${label} 수학 기출문제 미리보기 ${idx + 1}페이지`} loading={idx === 0 ? 'eager' : 'lazy'}
                        style={{ opacity: idx === i ? 1 : 0, pointerEvents: idx === i ? 'auto' : 'none' }} />
                ))}
                {locked && <div className="rd-x-lock" role="note">
                    <span className="rd-x-lock-icon" aria-hidden="true"><Lock size={22} /></span>
                    {member === false ? <>
                        <p><b>2쪽부터는 회원만 볼 수 있어요</b><br />가입하면 {n}쪽 전부와 해설 없는 문제 PDF를 무료로 볼 수 있어요.</p>
                        <div className="rd-x-lock-actions">
                            <Link href={`/signup?next=${next}`} className="rd-btn rd-btn-primary">무료 회원가입</Link>
                            <Link href={`/login?next=${next}`} className="rd-btn rd-btn-gray">로그인</Link>
                        </div>
                    </> : <p>미리보기를 불러오는 중…</p>}
                </div>}
            </div>
            {n > 1 && (
                <div className="rd-x-pager">
                    <button type="button" className="rd-round" aria-label="이전 쪽" onClick={() => setI(p => (p - 1 + n) % n)}><ChevronLeft size={20} aria-hidden="true" /></button>
                    <span aria-live="polite">{i + 1} / {n}쪽{member === false && <small className="rd-x-pager-note"> · 2쪽부터 회원</small>}</span>
                    <button type="button" className="rd-round" aria-label="다음 쪽" onClick={() => setI(p => (p + 1) % n)}><ChevronRight size={20} aria-hidden="true" /></button>
                </div>
            )}
        </div>
    );
}
