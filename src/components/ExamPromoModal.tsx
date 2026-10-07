'use client';

import { QB_PASS } from '@/lib/qbPassConfig';
import Link from 'next/link';
import { useEffect } from 'react';
import { Save, MousePointerClick, FileEdit, X } from 'lucide-react';
import { getStoredRole } from '@/components/RoleOnboardingModal';

const HIDE_KEY = 'examPromoHideDate';

// 사용자 로컬 기준 오늘 날짜 (YYYY-M-D)
function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 오늘 '보지 않기'를 눌렀는지 — 호출부에서 팝업 표시 전에 확인
export function isExamPromoHidden(): boolean {
    try {
        return localStorage.getItem(HIDE_KEY) === todayKey();
    } catch {
        return false;
    }
}

// 예상문제/변형문제 HWP 다운로드 후 '시험지 출제'로 유도하는 안내 팝업
/**
 * 다운로드 완료 직후 '시험지출제' 를 권하는 모달.
 *
 * [2026-09-07] 무료PDF 경로에 연결하면서 두 가지를 고쳤다.
 *  1) 문구를 '해설' 중심으로. 무료PDF 를 받은 사람의 결핍은 딱 하나 — 답이 없다는 것이다.
 *     그런데 기존 문구는 "맛보기예요 / 직접 골라 담기 / 저장하고 편집" 이라 결핍과 어긋나 있었다.
 *     (전환 경로 전체에 '해설' 이라는 단어가 한 번도 안 나왔다)
 *  2) 버튼을 프리필 링크로. src 를 주면 /question-bank?src= 로 보내 그 회차 문항이 담긴 채 열린다.
 *     src 없이 /question-bank 로 보내면 빈 검색 화면이라 처음부터 다시 골라야 했다.
 */
// [2026-10-06] 무료PDF 경로는 '오늘 하루 보지 않기'와 상관없이 받을 때마다 띄운다(사용자 지시).
//   그래서 그 경로에선 버튼도 숨긴다(allowHideToday=false) — 눌러도 다시 뜨면 거짓 버튼이 된다.
export default function ExamPromoModal({ onClose, src, school, allowHideToday = true }: { onClose: () => void; src?: string; school?: string; allowHideToday?: boolean }) {
    const href = src ? `/question-bank?src=${encodeURIComponent(src)}` : '/question-bank';

    // [2026-09-08] 역할별 문구. 무료PDF 를 받는 사람 273명 중 역할을 밝힌 240명이
    //   학생 179 · 강사 61 이다(강사 25%). 그런데 문구는 '시험지 출제' 라는 강사 도구 이름으로
    //   말하고 있었다. 학생이 원하는 건 방금 받은 그 시험지의 해설 하나다.
    //   미응답도 학생 쪽으로 기운 모수라 기본값을 학생 문구로 둔다.
    const isTeacher = getStoredRole() === 'teacher';
    const variant = src ? (isTeacher ? 'teacher' : 'student') : 'bare';
    const logTitle = src ? `${src}|${variant}` : 'bare';

    // [2026-09-08] 노출 로그. 클릭만 남기고 있어서 "1/55" 가 안 눌렀다는 뜻인지
    //   아예 안 떴다는 뜻인지 구분할 수 없었다(삼자대면 감사). 분모를 남긴다.
    useEffect(() => {
        try {
            fetch('/api/log/feature', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feature: 'promo_view', title: logTitle }),
            });
        } catch { }
    }, [logTitle]);

    // 어느 버튼을 눌렀는지 title 끝에 붙인다(answer / similar1). bare 는 기존 그대로.
    const logClick = (which?: string) => {
        try { fetch('/api/log/feature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'promo_click', title: which ? `${logTitle}|${which}` : logTitle }) }); } catch { }
    };

    const hideToday = () => {
        try { localStorage.setItem(HIDE_KEY, todayKey()); } catch { }
        onClose();
    };
    return (
        <div
            className="rd rd-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="rd-modal rd-modal-sm" role="dialog" aria-modal="true" aria-labelledby="exam-promo-title">
                <div className="rd-sheet-handle" />
                <div className="rd-modal-head">
                    <div>
                        <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: 'var(--rd-ink)' }}>다운로드 완료</p>
                        <h2 id="exam-promo-title" className="rd-modal-title">
                            {!src ? '‘시험지 만들기’도 써보셨어요?'
                                : '정답과 해설이 필요하신가요?'}
                        </h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="닫기" className="rd-modal-x">
                        <X size={20} />
                    </button>
                </div>

                <div className="rd-modal-body" style={{ marginTop: 14 }}>
                    {src ? (
                        // [2026-10-06] 무료PDF 경로 — 사용자 지정 문구 두 줄 + 각 줄 옆 버튼.
                        //   ① 이 회차 문항 전부 담긴 채 시험지출제(?src=) → HML 저장 시 정답·해설 포함(generator 미주)
                        //   ② '유사문제' — 각 문항을 유사 1순위로 바꾼 시험지가 담긴 채(?src=&variant=similar1, api/questions/by-ids)
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, background: 'var(--rd-panel)' }}>
                                <p style={{ flex: 1, margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--rd-sub)' }}>
                                    <strong style={{ color: 'var(--rd-ink)' }}>시험지 만들기</strong>(한 주 {QB_PASS.freePerWeek}회 무료)를 통해 <strong style={{ color: 'var(--rd-text)' }}>정답과 해설</strong>을 받을 수 있습니다.
                                </p>
                                <Link href={href} onClick={() => logClick('answer')}
                                    className="rd-btn rd-btn-primary"
                                    style={{ flex: 'none', fontSize: 15, padding: '12px 16px', minHeight: 44, whiteSpace: 'nowrap' }}>
                                    정답·해설 받기
                                </Link>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, background: 'var(--rd-panel)' }}>
                                <p style={{ flex: 1, margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--rd-sub)' }}>
                                    <strong style={{ color: 'var(--rd-text)' }}>유사문제</strong>까지 자동생성으로 풀 수 있어요.
                                </p>
                                <Link href={`${href}&variant=similar1`} onClick={() => logClick('similar1')}
                                    className="rd-btn"
                                    style={{ flex: 'none', fontSize: 15, padding: '12px 16px', minHeight: 44, whiteSpace: 'nowrap', background: '#fff', color: 'var(--rd-ink)' }}>
                                    유사문제 풀기
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="rd-modal-text" style={{ marginTop: 0 }}>
                                방금 받은 건 <strong style={{ color: 'var(--rd-text)' }}>맛보기</strong>예요. <strong style={{ color: 'var(--rd-ink)' }}>시험지 출제</strong>로 가면
                                훨씬 자유롭게 나만의 시험지를 만들 수 있어요.
                            </p>
                            <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 16, borderRadius: 20, background: 'var(--rd-panel)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 15, lineHeight: 1.5, color: 'var(--rd-text)' }}>
                                    <MousePointerClick size={18} style={{ color: 'var(--rd-ink)', flex: 'none', marginTop: 2 }} />
                                    <span><strong>문제를 직접 골라</strong> 원하는 것만 담기</span>
                                </li>
                                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 15, lineHeight: 1.5, color: 'var(--rd-text)' }}>
                                    <Save size={18} style={{ color: 'var(--rd-ink)', flex: 'none', marginTop: 2 }} />
                                    <span>만든 시험지를 <strong>저장하고 다시 편집</strong></span>
                                </li>
                                <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 15, lineHeight: 1.5, color: 'var(--rd-text)' }}>
                                    <FileEdit size={18} style={{ color: 'var(--rd-ink)', flex: 'none', marginTop: 2 }} />
                                    <span>문항 순서, 난이도, 구성을 바꾸고, PDF는 한글에서 저장</span>
                                </li>
                            </ul>
                        </>
                    )}
                </div>

                <div className="rd-modal-actions" style={{ marginTop: 20 }}>
                    {!src && (
                        <Link
                            href={href}
                            onClick={() => logClick()}
                            className="rd-btn rd-btn-primary rd-btn-block"
                        >
                            시험지 만들기 시작
                        </Link>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: allowHideToday ? 'space-between' : 'flex-end' }}>
                        {allowHideToday && (
                            <button type="button" onClick={hideToday} className="rd-text-btn rd-quiet" style={{ minHeight: 44, fontSize: 14 }}>
                                오늘 하루 보지 않기
                            </button>
                        )}
                        <button type="button" onClick={onClose} className="rd-text-btn" style={{ minHeight: 44 }}>
                            다음에 할게요
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
