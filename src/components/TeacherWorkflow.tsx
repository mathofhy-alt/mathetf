import Link from 'next/link';
import Image from 'next/image';

/**
 * 강사 안내(/teacher) 전용 — 실제 화면으로 보는 시험지 만드는 과정.
 * 2026-10 새 디자인: 옛 탭 + 옛 화면 캡처(/teacher-walkthrough) 대신 홈과 같은 새 화면 그림(/home/*.webp)을 세 단계로 펼쳐 보인다.
 * 스타일은 src/app/redesign.css 의 .rd .rd-tc-*.
 */
const STEPS = [
    {
        no: '01',
        title: '학교 기출 찾기',
        label: '학교와 회차를 정하고, 필요한 카드만 담으세요',
        description: '출제 자료에서 원하는 학교와 시험 회차를 선택하세요. 단원과 난이도를 더하면 필요한 문제만 좁혀 볼 수 있습니다. 문항 카드를 누르면 담기고, 다시 누르면 빠집니다.',
        tip: '여러 학교의 자료를 함께 선택할 수도 있어요.',
        image: { src: '/home/cards.webp', width: 1800, height: 343, alt: '고1 1학기 중간고사 실제 기출 문항 카드에 단원과 난이도가 표시된 화면' },
        wide: true,
    },
    {
        no: '02',
        title: '시험지 구성 확인',
        label: '내 수업에 맞게 구성을 다듬으세요',
        description: '시험지 생성 버튼을 누르면 고른 문항만 모입니다. 순서를 조정하거나 다른 학교의 문항을 더한 뒤 최종 생성으로 넘어가세요. 상세보기로 크게 확인하고, 해설보기로 풀이를 살펴볼 수 있습니다.',
        tip: '로그인 후 시험지를 저장하고 편집용 HML로 받을 수 있어요.',
        image: { src: '/home/review.webp', width: 2200, height: 653, alt: '담은 실제 기출 문항을 모아 검토하는 시험지 구성 화면' },
        wide: true,
    },
    {
        no: '03',
        title: '한글에서 편집',
        label: '내려받은 뒤에도, 한글에서 편집하세요',
        description: '로그인 후 저장하고 내려받아 한글에서 여세요. 줄바꿈과 페이지 배치를 다듬어 인쇄하면 됩니다. 직접 만든 시험지의 다운로드 형식은 HML이고, PDF가 필요하면 한글에서 저장하세요.',
        tip: '수식과 그림, 페이지 배치는 출력 전에 한 번 확인하세요.',
        image: { src: '/home/paper.webp', width: 1200, height: 1052, alt: '한글에서 연 시험지 첫 쪽' },
        wide: false,
    },
];

export default function TeacherWorkflow() {
    return (
        <section className="rd-tc-flow" aria-labelledby="workflow-title">
            <div className="rd-wrap">
                <p className="rd-kicker">실제 화면으로 미리 보기</p>
                <h2 id="workflow-title" className="rd-h2">이렇게 골라서,<br />내 시험지로</h2>
                <p className="rd-lead">한 학교의 고1 1학기 중간고사 실제 기출로 시험지를 만든 과정입니다.</p>
            </div>
            {STEPS.map((step) => (
                <div key={step.no} className="rd-tc-step">
                    <div className={`rd-wrap ${step.wide ? 'rd-stack' : 'rd-split rd-reverse'}`}>
                        <div className="rd-txt">
                            <p className="rd-tc-no">{step.no} {step.title}</p>
                            <h3 className="rd-tc-h3">{step.label}</h3>
                            <p className="rd-tc-desc">{step.description}</p>
                            <p className="rd-tc-tip">{step.tip}</p>
                        </div>
                        <div className="rd-pic">
                            {step.wide ? (
                                <Image src={step.image.src} alt={step.image.alt} width={step.image.width} height={step.image.height} sizes="(max-width: 1160px) 100vw, 1112px" />
                            ) : (
                                <div className="rd-paper"><Image src={step.image.src} alt={step.image.alt} width={step.image.width} height={step.image.height} sizes="(max-width: 900px) 80vw, 520px" /></div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
            <div className="rd-wrap"><div className="rd-tc-try">
                <div>
                    <h3 className="rd-tc-h3">같은 기출로 직접 만들어 보세요</h3>
                    <p>문항 검색과 선택은 로그인 전에도 가능합니다. 시험지 저장과 다운로드는 로그인 후 이용하세요.</p>
                </div>
                <div className="rd-tc-try-actions">
                    <Link href="/question-bank?material=6542d7df-a737-4a68-bf88-ac5de6956d84&origin=teacher-preview" className="rd-btn rd-btn-primary">이 기출로 직접 만들어보기</Link>
                    <a href="https://www.youtube.com/watch?v=2Yt94Ps8rk8&t=5s" target="_blank" rel="noopener noreferrer" className="rd-link">사용법 영상 보기</a>
                </div>
            </div></div>
        </section>
    );
}
