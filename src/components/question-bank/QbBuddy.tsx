'use client';

import { useEffect, useState } from 'react';

/**
 * 시험지출제 AI 시험지 도우미 '시그'(Σ) (10/11) — 화면 오른쪽 아래 캐릭터. 누르면 대화창이 열린다.
 * 그림: Gemini 이미지로 그린 같은 캐릭터(public/qb-buddy/*.webp, 240px). 표정 3장(idle·think·happy) + 자판기 장면 5장(vend0~4).
 *
 * 움직임(사용자 요청 10/11 2차): 시험지 자판기 앞에서 → 빨간 버튼을 누르면 → 자판기가 덜컹이며 시험지를 뱉고 → 받아 들고 신남 → 들고 서 있기, 반복.
 *   (1차 '놀기→30점→공부→100점' 이야기에서 바꿈)
 *  - 장면 바꾸기는 JS 타이머가 아니라 CSS 애니메이션(장면 6장을 겹쳐 두고 차례로 보이기, 한 바퀴 14.4초).
 *    (처음 JS 타이머 판은 '동작 줄이기'면 멈추게 짜 둬서 사장님 Chrome 에서 가만히 있었다 — 10/11)
 *  - "동작 줄이기" 설정이어도 움직인다(globals.css 의 .01ms 규칙을 이 캐릭터만 되돌림 — redesign.css). 사장님 Chrome 이 이 설정이었다.
 *  - 대화창이 열리면 이야기 대신 상태를 보여 준다: 문항 고르는 중 = 생각, 다 담음 = 신남(잠깐), 그 밖 = 기본.
 */
export type BuddyMood = 'idle' | 'busy' | 'done';

const SRC = (n: string) => `/qb-buddy/${n}.webp`;
const STORY = ['vend0', 'vend1', 'vend2', 'vend3', 'vend4'];
const MOOD_IMG: Record<BuddyMood, string> = { idle: 'idle', busy: 'think', done: 'happy' };         // 대화창 작은 얼굴
const BUTTON_MOOD: Record<BuddyMood, string> = { idle: 'vend0', busy: 'vend2', done: 'vend3' };     // 대화창 열렸을 때 버튼: 고르는 중 = 자판기가 시험지를 뱉는 중

/** 대화창 머리·답글 옆 작은 얼굴 */
export function BuddyAvatar({ size = 36, mood = 'idle' }: { size?: number; mood?: BuddyMood }) {
    return <span className={`qbb-ava is-${mood}`} style={{ width: size, height: size }} aria-hidden="true"><img src={SRC(MOOD_IMG[mood])} alt="" /></span>;
}

export default function QbBuddy({ open, onToggle, mood = 'idle' }: { open: boolean; onToggle: () => void; mood?: BuddyMood }) {
    const [hint, setHint] = useState(false);

    // 처음 몇 번만 무엇을 하는 아이인지 말풍선으로(이 브라우저에서 3번)
    useEffect(() => {
        let n = 0;
        try { n = Number(localStorage.getItem('qb_buddy_hint') || 0); } catch { }
        if (n >= 3) return;
        const show = setTimeout(() => setHint(true), 2500), hide = setTimeout(() => setHint(false), 11000);
        try { localStorage.setItem('qb_buddy_hint', String(n + 1)); } catch { }
        return () => { clearTimeout(show); clearTimeout(hide); };
    }, []);

    return (
        <div className={`qbb${open ? ' is-open' : ''}`}>
            {hint && !open && (
                <button type="button" className="qbb-bubble" onClick={() => { setHint(false); onToggle(); }}>
                    말로 시험지 만들어 드릴게요!<small>“삼차함수 비율 30문항, 쉬운 것부터”</small>
                </button>
            )}
            <button type="button" className="qbb-btn" onClick={() => { setHint(false); onToggle(); }}
                aria-label={open ? 'AI 시험지 도우미 닫기' : 'AI 시험지 도우미 열기 — 말로 시험지 만들기'} aria-expanded={open}>
                {open
                    ? <span className={`qbb-stage is-mood-${mood}`} key={mood}><img src={SRC(BUTTON_MOOD[mood])} alt="" draggable={false} /></span>
                    : <span className="qbb-stage qbb-story">
                        {STORY.map((n, i) => (
                            <span key={n} className={`qbb-scene qbb-scene-${i}`}><img src={SRC(n)} alt="" draggable={false} /></span>
                        ))}
                    </span>}
            </button>
        </div>
    );
}
