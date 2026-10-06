'use client';
import { useEffect, useState, type ReactNode } from 'react';
import ExamOpinions, { type ExamOpinion } from '@/components/ExamOpinions';

/**
 * 시험지 상세 오른쪽 열: [자료 받기][의견 N] 탭.
 * 의견을 미리보기 옆에서 보고 쓰게 하려는 것(10/7 사용자 요청) — 작성도 팝업 대신 같은 자리에서.
 * 두 탭 모두 DOM 에 남겨 둔다(의견 글은 검색엔진에도 보이게).
 */
export default function ExamSide({ children, opinion }: {
    children: ReactNode;
    opinion: { examId: string; questionCount: number; initialOpinions: ExamOpinion[] } | null;
}) {
    const [tab, setTab] = useState<'get' | 'op'>('get');
    const [count, setCount] = useState(opinion?.initialOpinions.length || 0);
    const [writeRequest, setWriteRequest] = useState(0);

    // 로그인하고 돌아오면(#question-difficulty) 의견 탭을 연다
    useEffect(() => {
        const hash = window.location.hash;
        if (hash === '#question-difficulty' || hash === '#opinion-form') {
            setTab('op');
            if (hash === '#opinion-form') setWriteRequest(1);
            window.setTimeout(() => document.getElementById('exam-side')?.scrollIntoView({ block: 'start' }), 50);
        }
    }, []);

    // 오른쪽 열이 화면보다 길면 따라 내려가다가 '아래 끝'이 보이는 자리에서 멈추게 top 을 맞춘다.
    // (안쪽 스크롤로 자르면 '시험지 만들기' 줄이 화면 밖에 숨었다 — 10/7 1440×900 실측)
    useEffect(() => {
        const el = document.getElementById('exam-side');
        if (!el) return;
        const fit = () => { el.style.top = `${Math.min(92, window.innerHeight - el.offsetHeight - 16)}px`; };
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(el);
        window.addEventListener('resize', fit);
        return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
    }, []);

    if (!opinion) return <div className="rd-x-panel no-tabs">{children}</div>;

    return <>
        <div role="tablist" aria-label="자료 받기와 의견" className="rd-tabs">
            <button type="button" role="tab" id="tab-get" aria-controls="panel-get" aria-selected={tab === 'get'} className="rd-tab" onClick={() => setTab('get')}>자료 받기</button>
            <button type="button" role="tab" id="tab-op" aria-controls="question-difficulty" aria-selected={tab === 'op'} className="rd-tab" onClick={() => setTab('op')}>의견 <b>{count}</b></button>
        </div>
        <div className="rd-x-panel">
            <div role="tabpanel" id="panel-get" aria-labelledby="tab-get" hidden={tab !== 'get'}>
                {children}
                <button type="button" className="rd-op-nudge" onClick={() => { setTab('op'); setWriteRequest(r => r + 1); }}>
                    <span>어려웠던 문항이 있었나요?</span><b>의견 +500P</b>
                </button>
            </div>
            <div role="tabpanel" id="question-difficulty" aria-labelledby="tab-op" hidden={tab !== 'op'}>
                <ExamOpinions examId={opinion.examId} questionCount={opinion.questionCount} initialOpinions={opinion.initialOpinions} writeRequest={writeRequest} onCount={setCount} />
            </div>
        </div>
    </>;
}
