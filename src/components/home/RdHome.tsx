"use client";

/**
 * 2026-10 디자인 개편 — 홈 새 화면 조각들. 디자인: 캔버스 'A안 다듬기'(A2.dc.html) + 디자인 규칙(Rules.dc.html).
 * 스타일은 src/app/redesign.css 의 .rd 아래 클래스. 기능(학교 검색·무료 PDF 찾기)은 예전 HomeStart 와 같은 콜백을 쓴다.
 */
import OpenEventButton from './OpenEventButton';
import { REPORT_REWARD_LABEL } from '@/lib/report-reward';
import Link from 'next/link';
import Image from 'next/image';
import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';

/** [10/8] 홈 맨 위 안내 띠 — 유료화 공지(10/13 0시). 10/20 지나면 저절로 숨는다 */
export function RdAnnounce() {
    if (Date.now() > new Date('2026-10-20T00:00:00+09:00').getTime()) return null;
    return <Link href="/notice/change-2026-10" className="rd-announce">10월 13일(월)부터 시험지 만들기 무료는 주 2회로 바뀝니다. 시험지 원본을 보내 주시면 포인트를 드려요<b>자세히 →</b></Link>;
}

export function RdHomeHero({ onSearch, onFindFreePdf }: { onSearch: (keyword: string) => void; onFindFreePdf: () => void }) {
    const [keyword, setKeyword] = useState('');
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        onSearch(keyword.trim());
    }
    return (
        <section className="rd-hero rd-wrap" aria-labelledby="rd-home-title">
            <p className="rd-kicker">고등학교 수학 기출문제 검색과 시험지 만들기</p>
            <h1 id="rd-home-title" className="rd-h1">우리 학교 기출로<br />시험지를 만드세요</h1>
            <p className="rd-lead">전국 고등학교가 실제로 출제한 내신 문항에서 필요한 것만 골라, 한글 파일로 받아 바로 수업에 쓰세요.</p>
            <form onSubmit={submit} className="rd-search" role="search" aria-label="학교 기출 검색">
                <Search size={22} color="#B0B8C1" aria-hidden="true" />
                <input aria-label="학교 이름" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="학교 이름" autoComplete="off" maxLength={80} />
                <button type="submit" className="rd-btn rd-btn-primary">기출 찾기</button>
            </form>
            <div className="rd-hero-links">
                <Link href="/schools">학교별로 찾기</Link>
                <button type="button" onClick={onFindFreePdf}>무료 문제 PDF</button>
                <Link href="/question-bank?demo=1&origin=home">시험지 만들기 체험</Link>
            </div>
        </section>
    );
}

export function RdHomeShowcase() {
    return (
        <section className="rd-wrap" aria-label="실제 서비스 화면">
            <div className="rd-showcase">
                <div className="rd-showcase-head">
                    <span>실제 서비스 화면, 고1 1학기 중간고사 기출</span>
                    <span className="rd-pill">20문항을 담은 검토 화면</span>
                </div>
                <Image src="/home/review.webp" alt="학교 기출 20문항을 담아 검토하는 시험지 만들기 화면" width={2200} height={653} priority sizes="(max-width: 1160px) 100vw, 1048px" />
            </div>
        </section>
    );
}

// [10/7] 사용자 요청: 보유 문항 수 · 최근 7일 업로드 문항 수 · 전국연합·평가원·수능 (학교 수는 뺌)
export function RdHomeStats({ questionCount, recentCount }: { questionCount: number; recentCount: number }) {
    return (
        <section className="rd-wrap rd-stats" aria-label="수학ETF 자료 규모">
            <div className="rd-stat"><b>{questionCount.toLocaleString()}</b><span>보유 문항 수</span></div>
            <div className="rd-stat"><b>{recentCount.toLocaleString()}</b><span>최근 7일간 업로드된 문항 수</span></div>
            <div className="rd-stat"><b>2006–2026</b><span>전국연합, 평가원, 수능</span></div>
        </section>
    );
}

export function RdHomeFeatures() {
    return (
        <>
            <section className="rd-feature rd-zone">
                <div className="rd-wrap rd-stack">
                    <div className="rd-txt">
                        <p className="rd-kicker">시험지 만들기</p>
                        <h2 className="rd-h2">카드를 누르면 문항이 담깁니다</h2>
                        <p className="rd-lead">학교와 회차를 고르고, 필요한 문항 카드만 누르세요. 단원과 난이도로 좁혀 볼 수도 있어요.</p>
                    </div>
                    <div className="rd-pic"><Image src="/home/cards.webp" alt="문항 카드에 단원과 난이도가 표시된 시험지 만들기 화면" width={1800} height={343} sizes="(max-width: 1160px) 100vw, 1112px" /></div>
                </div>
            </section>
            <section className="rd-feature">
                <div className="rd-wrap rd-split rd-reverse">
                    <div className="rd-txt">
                        <p className="rd-kicker">한글 파일로 받기</p>
                        <h2 className="rd-h2">받은 뒤에도<br />한글에서 편집하세요</h2>
                        <p className="rd-lead">정답과 해설이 미주로 들어간 편집용 HML 파일로 받아요. 줄바꿈만 다듬어 바로 인쇄하면 됩니다.</p>
                    </div>
                    <div className="rd-pic"><div className="rd-paper"><Image src="/home/paper-2.webp" alt="한글에서 만든 시험지 첫 쪽" width={1200} height={1052} sizes="(max-width: 900px) 80vw, 520px" /></div></div>
                </div>
            </section>
            {/* [10/7] 수업 사다리 홍보(사용자 요청) — 강사가 수업을 짤 때 쓰는 기능 */}
            <section className="rd-feature rd-zone">
                <div className="rd-wrap rd-split">
                    <div className="rd-txt">
                        <p className="rd-kicker">수업 사다리</p>
                        <h2 className="rd-h2">어려운 한 문제로<br />수업 하나를 짜세요</h2>
                        <p className="rd-lead">목표 문항을 고르면 같은 개념의 쉬운 문항부터 비슷한 유형, 목표 문항까지 올라가는 순서로 찾아 줘요. 단계별 문항 수를 고르고, 마음에 안 드는 문항은 바꿔서 한 번에 담으세요.</p>
                        <Link href="/question-bank" className="rd-btn rd-btn-primary rd-feature-cta">시험지 만들기에서 써 보기</Link>
                    </div>
                    <div className="rd-pic"><div className="rd-paper rd-paper-modal rd-paper-fade"><Image src="/home/ladder.webp" alt="기초·유형·목표 순서로 문항을 보여 주고 단계별 문항 수를 고르는 수업 사다리 창" width={1092} height={1560} sizes="(max-width: 900px) 80vw, 520px" /></div></div>
                </div>
            </section>
            {/* [10/7] 헤더 버튼으로만 있던 두 기능 설명(사용자 제안) */}
            <section className="rd-feature">
                <div className="rd-wrap rd-split rd-reverse">
                    <div className="rd-txt">
                        <p className="rd-kicker">무료 타이핑</p>
                        <h2 className="rd-h2">시험지 사진만 보내면<br />한글 파일로 만들어 드려요</h2>
                        <p className="rd-lead">학교에서 받은 수학 시험지를 스캔 PDF나 휴대폰 사진으로 보내 주세요. 채택되면 수식과 그림까지 타이핑한 한글 파일을 마이페이지로 보내 드리고, {REPORT_REWARD_LABEL}도 드려요.</p>
                        <OpenEventButton event="open-original-report" className="rd-btn rd-btn-primary rd-feature-cta">무료 타이핑 신청</OpenEventButton>
                    </div>
                    <div className="rd-pic"><div className="rd-paper rd-paper-modal"><Image src="/home/report-2.webp" alt="학교와 시험을 고르고 시험지 사진을 올리는 무료 타이핑 신청 창" width={1200} height={1360} sizes="(max-width: 900px) 80vw, 520px" /></div></div>
                </div>
            </section>
            <section className="rd-feature rd-zone">
                <div className="rd-wrap rd-split">
                    <div className="rd-txt">
                        <p className="rd-kicker">개인DB 요청</p>
                        <h2 className="rd-h2">내가 가진 자료도<br />시험지 재료로</h2>
                        <p className="rd-lead">수업에 쓰는 프린트나 자료를 올려 주시면 문항 DB로 만들어 회원님의 시험지 만들기에만 넣어 드려요. 다른 회원에게는 보이지 않고, 처리 결과는 마이페이지에서 안내해 드려요.</p>
                        <OpenEventButton event="open-db-request" className="rd-btn rd-btn-primary rd-feature-cta">개인DB 요청하기</OpenEventButton>
                    </div>
                    <div className="rd-pic"><div className="rd-paper rd-paper-modal"><Image src="/home/dbreq-3.webp" alt="자료 파일을 올리고 필요한 범위를 적는 개인DB 요청 창" width={1120} height={1036} sizes="(max-width: 900px) 80vw, 520px" /></div></div>
                </div>
            </section>
        </>
    );
}

export function RdHomeMore() {
    return (
        <section className="rd-wrap rd-cards" aria-label="더 볼 수 있는 자료">
            <Link href="/guide#access" className="rd-card"><p>회원 무료</p><h3>해설 없는 전체 문제 PDF</h3><p>제공 회차의 문제 PDF를 회원이면 무료로 받을 수 있어요.</p></Link>
            <Link href="/모의고사" className="rd-card"><p>모의고사</p><h3>전국연합, 평가원, 수능</h3><p>2006년부터 2026년까지 회차별로 골라 담을 수 있어요.</p></Link>
            <Link href="/모의고사/사관학교" className="rd-card"><p>입학시험</p><h3>사관학교와 경찰대</h3><p>입학시험 수학 기출을 같은 방식으로 출제해요.</p></Link>
        </section>
    );
}

export function RdHomeFinale() {
    return (
        <section className="rd-wrap rd-finale" aria-label="시험지 만들기 시작">
            <h2 className="rd-h2">우리 학교 기출로<br />첫 시험지를 만들어 보세요</h2>
            <Link href="/question-bank?demo=1&origin=home" className="rd-btn rd-btn-primary">지금 시작하기</Link>
        </section>
    );
}
