'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, FileText, Play, Search, SlidersHorizontal } from 'lucide-react';
import styles from './TeacherWorkflow.module.css';

const steps = [
    { title: '학교 기출 찾기', label: '학교와 회차를 정하세요.', description: '출제 자료에서 원하는 학교와 시험 회차를 선택하세요. 단원·난이도를 더하면 필요한 문제만 좁혀 볼 수 있습니다.', image: 'find.png', width: 1264, height: 458, alt: '휘문고 2025년 고1 1학기 중간고사 실제 20문항이 검색된 출제 화면', icon: Search, caption: '출제 자료 1개 · 실제 기출 20문항 검색', tip: '여러 학교의 자료를 함께 선택할 수도 있어요.' },
    { title: '필요한 문항 담기', label: '문항 카드를 누르면 선택됩니다.', description: '문제를 읽고 필요한 카드만 누르세요. 상세보기로 크게 확인하고, 해설보기로 풀이를 살펴볼 수 있습니다.', image: 'select.png', width: 994, height: 428, alt: '휘문고 실제 기출 1번부터 3번까지 선택한 화면', icon: Check, caption: '20문항 중 3문항 선택 · 테두리와 체크로 선택 표시', tip: '선택한 카드를 다시 누르면 선택이 해제됩니다.' },
    { title: '시험지 구성 확인', label: '내 수업에 맞게 구성을 다듬으세요.', description: '시험지 생성 버튼을 누르면 고른 문항만 모입니다. 순서를 조정하거나 다른 학교의 문항을 더한 뒤 최종 생성으로 넘어가세요.', image: 'review.png', width: 1280, height: 496, alt: '선택한 실제 기출 3문항을 모아 검토하는 시험지 구성 화면', icon: SlidersHorizontal, caption: '선택한 3문항의 저장 전 검토 화면', tip: '로그인 후 시험지를 저장하고 편집용 HML로 받을 수 있어요.' },
];

export default function TeacherWorkflow() {
    const [active, setActive] = useState(0);
    return <section className={styles.workflow} aria-labelledby="workflow-title">
        <div className={styles.heading}>
            <div><p className={styles.eyebrow}>실제 화면으로 미리 보기</p><h2 id="workflow-title">이렇게 골라서, 내 시험지로.</h2></div>
            <p>휘문고 · 2025년 고1 · 1학기 중간고사<br/>실제 기출에서 3문항을 선택한 과정입니다.</p>
        </div>
        <div className={styles.steps} aria-label="출제 과정 선택">
            {steps.map((item, index) => <button key={item.title} type="button" aria-pressed={active === index} aria-controls={`workflow-preview-${index}`} onClick={() => setActive(index)} className={active === index ? styles.active : ''}>
                <span className={styles.number}>0{index + 1}</span><item.icon size={17} aria-hidden="true"/><span>{item.title}</span>
            </button>)}
        </div>
        {steps.map((step, index) => <div key={step.title} id={`workflow-preview-${index}`} hidden={active !== index}>
        <div className={styles.preview}>
            <div className={styles.previewTop}><span><i/>수학ETF · 시험지 편집실</span><span>실제 서비스 화면</span></div>
            <a href={`/teacher-walkthrough/${step.image}`} target="_blank" rel="noopener noreferrer" aria-label={`${step.title} 실제 화면 원본 크게 보기`} className={styles.imageLink}>
                {/* Native image keeps the source capture directly accessible at its original resolution. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img loading={index === 0 ? 'eager' : 'lazy'} src={`/teacher-walkthrough/${step.image}`} width={step.width} height={step.height} alt={step.alt}/>
                <span className={styles.enlarge}>화면 크게 보기 <ArrowUpRight size={14}/></span>
            </a>
            <div className={styles.caption}>{step.caption}</div>
        </div>
        <div className={styles.explanation} aria-live="polite">
            <div><h3>{step.label}</h3><p>{step.description}</p></div>
            <p className={styles.tip}><Check size={17} aria-hidden="true"/>{step.tip}</p>
        </div>
        </div>)}
        <div className={styles.output}>
            <div className={styles.fileIcon}><FileText size={28}/><span>HML</span></div>
            <div><h3>내려받은 뒤에도, 한글에서 편집하세요.</h3><p>로그인 후 저장·다운로드 → 한글에서 열기 → 줄바꿈과 페이지 배치를 다듬어 인쇄</p><span>직접 만든 시험지의 다운로드 형식은 HML입니다. PDF가 필요하면 한글에서 저장하세요.</span></div>
        </div>
        <div className={styles.actions}>
            <Link href="/question-bank?material=6542d7df-a737-4a68-bf88-ac5de6956d84&origin=teacher-preview" className={styles.primary}>이 기출로 직접 만들어보기 <ArrowUpRight size={18}/></Link>
            <a href="https://www.youtube.com/watch?v=2Yt94Ps8rk8&t=5s" target="_blank" rel="noopener noreferrer" className={styles.secondary}><Play size={15}/> 기존 사용법 영상 보기</a>
        </div>
        <p className={styles.access}>문항 검색·선택은 로그인 전에도 가능합니다. 시험지 저장·다운로드는 로그인 후 이용하세요.</p>
    </section>;
}
