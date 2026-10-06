import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import Header from '@/components/Header';
import RdAccessPolicy from '@/components/RdAccessPolicy';

export const metadata: Metadata = { title: '수학 시험지 만들기 사용법·무료 범위·파일 형식 | 수학ETF', description: '기출 5문항 체험부터 범위 선택, 문항 편집, HML 저장과 다운로드까지. 학생의 오답 연습과 교사의 수업용 출제를 안내합니다.', alternates: { canonical: '/guide' } };

// 2026-10 새 디자인(.rd) — 스타일은 src/app/redesign.css 의 .rd .rd-gd-* / .rd-tc-*.
// /guide#access, /guide#format, #student, #teacher 는 다른 화면에서 링크하므로 id 를 유지한다.
const STEPS = [
    { no: '01', name: '찾기', title: '배운 범위를 고르세요.', body: '학교와 시험 회차, 과목과 단원을 선택하세요. 자동 출제도 선택한 자료 안에서 문항을 찾습니다. 원래 시험의 과목과 현재 문항 분류는 다를 수 있으니 단원을 함께 확인하세요.', href: '/schools', link: '학교 이름으로 찾아보기' },
    { no: '02', name: '담기', title: '필요한 문제만 담으세요.', body: '문항 카드를 누르면 선택됩니다. 상세보기에서 수식과 그림을, 해설보기에서 풀이를 확인하세요. 담은 문항은 순서를 바꾸거나 빼면서 시험지를 다듬을 수 있습니다.', href: '/question-bank?demo=1&origin=guide', link: '편집 화면 직접 살펴보기' },
    { no: '03', name: '받기', title: '나만의 시험지로 받으세요.', body: '로그인 후 제목과 열당 문제 수를 정하고 저장하세요. 완료 화면에서 HML 파일을 받으면 됩니다. 한글에서 편집하고 인쇄할 수 있고, PDF로도 저장할 수 있습니다.', href: '#format', link: '파일 형식 알아보기' },
];

const FAQ: { id?: string; q: string; a: string }[] = [
    { id: 'format', q: '시험지는 어떤 파일로 받나요?', a: '직접 만든 시험지는 한글에서 편집할 수 있는 HML 파일입니다. 완성된 PDF를 바로 내려받는 기능과는 다릅니다. PDF가 필요하면 한글에서 HML을 연 뒤 ‘PDF로 저장’을 이용하세요.' },
    { q: '요청한 문항 수보다 적게 만들어졌어요.', a: '선택한 자료, 단원, 난이도와 중복 제외 조건을 모두 만족하는 문항이 부족한 경우입니다. 범위를 임의로 넓히지 않습니다. 안내된 문항을 먼저 확인하고 조건을 조정하거나 다른 자료를 선택하세요.' },
    { q: '같은 범위로 재출제하면 어떤 점이 달라지나요?', a: '이전 시험지에 사용한 문항을 제외합니다. 같은 유형의 유사문항을 보장하는 기능은 아니며, 선택 자료의 단원과 난이도 조건에 맞춰 새로 구성합니다. 설정 도중 취소하면 현재 작업은 유지됩니다.' },
    { q: '로그인하거나 새로고침하면 담은 문제가 없어지나요?', a: '같은 브라우저에서는 최근 7일 이내의 초안을 이어서 만들 수 있습니다. 저장 전 초안은 다른 기기로 옮겨지지 않으므로, 완성한 시험지는 로그인 후 보관함에 저장해주세요.' },
    { q: '무료 자료와 유료 자료는 어떻게 구분하나요?', a: '출제용 자료의 무료 이용 범위와 무료 문제 PDF의 일일 한도는 위 이용 안내에 표시됩니다. 완성된 해설 PDF와 HWP의 구매는 별도입니다. 자료별 제공 형식과 가격을 확인하세요.' },
];

export default function GuidePage() {
    return (
        <div className="rd rd-x rd-gd">
            <Header />
            <div>
                {/* 첫 화면 */}
                <section className="rd-wrap rd-tc-hero rd-gd-hero" aria-labelledby="guide-title">
                    <p className="rd-kicker">시험지 만들기 사용법</p>
                    <h1 id="guide-title" className="rd-tc-h1 rd-gd-h1">고르는 순간부터,<br />시험지를 받는 순간까지.</h1>
                    <p className="rd-lead">우리 학교 시험지를 찾거나, 기출 5문항으로 먼저 체험하세요. 필요한 문항을 담아 나만의 시험지로 만들 수 있습니다.</p>
                    <p className="rd-gd-note">시험지 전체 미리보기는 비회원도 볼 수 있습니다. 회원은 제공 회차의 <strong>해설 없는 전체 문제 PDF</strong>를 무료로 받을 수 있고, <strong>문제+해설 원본 PDF와 HWP</strong>는 별도 구매입니다. 직접 만든 시험지는 편집용 <strong>HML</strong>로 받습니다.</p>
                    <div className="rd-tc-actions">
                        <Link className="rd-btn rd-btn-primary" href="/question-bank?demo=1&origin=guide">기출 5문항으로 시작</Link>
                        <Link className="rd-btn rd-btn-gray" href="/schools">우리 학교 기출 찾기</Link>
                    </div>
                    <div className="rd-hero-links rd-gd-video">
                        <a href="https://www.youtube.com/watch?v=2Yt94Ps8rk8&t=5s" target="_blank" rel="noopener noreferrer">사용법 영상 보기</a>
                        <a href="https://www.youtube.com/@mathetf" target="_blank" rel="noopener noreferrer">유튜브 채널</a>
                    </div>
                </section>

                <section className="rd-wrap" aria-label="실제 서비스 화면">
                    <div className="rd-showcase">
                        <div className="rd-showcase-head">
                            <span>실제 서비스 화면</span>
                            <span className="rd-pill">문항 카드를 누르면 담깁니다</span>
                        </div>
                        <Image src="/home/cards.webp" alt="문항 카드에 단원과 난이도가 표시된 시험지 만들기 화면" width={1800} height={343} priority sizes="(max-width: 1160px) 100vw, 1048px" />
                    </div>
                </section>

                {/* 순서 */}
                <section aria-label="시험지 만드는 순서" className="rd-wrap rd-tc-sec">
                    <ol className="rd-gd-steps">
                        {STEPS.map((s) => (
                            <li key={s.no}>
                                <p className="rd-tc-no">{s.no} {s.name}</p>
                                <h2>{s.title}</h2>
                                <p className="rd-gd-body">{s.body}</p>
                                <Link href={s.href} className="rd-gd-steplink">{s.link}</Link>
                            </li>
                        ))}
                    </ol>
                </section>

                {/* 학생·교사 */}
                <section className="rd-wrap rd-tc-sec rd-gd-roles" aria-label="쓰는 사람별 안내">
                    <article id="student">
                        <p className="rd-tc-no">학생이라면</p>
                        <h2>틀린 문제, 한 번 더.</h2>
                        <p>최근 시험지에서 ‘불러와 수정’을 누르세요. 맞힌 문제를 빼고, 다시 풀 문제만 남겨 새 시험지로 저장할 수 있습니다. 원래 시험지는 그대로 보관됩니다.</p>
                        <Link className="rd-btn rd-btn-gray" href="/question-bank?demo=1&origin=student-guide">내 연습지 만들기</Link>
                    </article>
                    <article id="teacher">
                        <p className="rd-tc-no">교사라면</p>
                        <h2>같은 범위, 새로운 구성.</h2>
                        <p>‘같은 범위로 재출제’는 이전 문항을 제외하고 같은 자료에서 다시 고릅니다. 단원과 난이도를 조절한 뒤 새 문항을 확인하세요. 특정 문항과 닮은 문제는 편집 화면의 ‘유사’로 찾을 수 있습니다.</p>
                        <Link className="rd-btn rd-btn-gray" href="/question-bank?demo=1&origin=teacher-guide">수업용 시험지 만들기</Link>
                    </article>
                </section>

                {/* 이용 범위 — /guide#access 로 다른 화면에서 들어온다 */}
                <section id="access" className="rd-wrap rd-tc-sec rd-gd-anchor" aria-labelledby="guide-access">
                    <RdAccessPolicy headingId="guide-access" />
                </section>

                {/* 자주 묻는 질문 */}
                <section className="rd-tc-faqzone" aria-labelledby="guide-faq">
                    <div className="rd-wrap">
                        <h2 id="guide-faq" className="rd-x-h2">궁금한 점을 먼저 정리했어요.</h2>
                        <div className="rd-gd-faq">
                            {FAQ.map((f) => (
                                <details key={f.q} id={f.id} className="rd-gd-anchor" open={f.id === 'format' || undefined}>
                                    <summary><span>{f.q}</span><ChevronDown size={22} aria-hidden="true" /></summary>
                                    <p>{f.a}</p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>

                {/* 마무리 */}
                <section className="rd-wrap rd-finale rd-tc-finale" aria-labelledby="guide-finale">
                    <h2 id="guide-finale" className="rd-h2">기출 5문항으로<br />먼저 만들어 보세요</h2>
                    <Link href="/question-bank?demo=1&origin=guide" className="rd-btn rd-btn-primary">기출 5문항으로 시작</Link>
                </section>
            </div>
        </div>
    );
}
