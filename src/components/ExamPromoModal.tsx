'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Save, MousePointerClick, FileEdit } from 'lucide-react';
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
export default function ExamPromoModal({ onClose, src, school }: { onClose: () => void; src?: string; school?: string }) {
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

    const hideToday = () => {
        try { localStorage.setItem(HIDE_KEY, todayKey()); } catch { }
        onClose();
    };
    return (
        <div
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white w-full sm:w-[440px] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
                {/* 헤더 */}
                <div className="relative bg-gradient-to-br from-[#497AB7] to-[#3AADA9] px-6 pt-6 pb-5 text-white text-center">
                    <button
                        onClick={onClose}
                        aria-label="닫기"
                        className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:bg-white/15 text-xl font-bold leading-none"
                    >
                        ×
                    </button>
                    <p className="text-sm font-bold text-white/85 mb-1">다운로드 완료! 🎉</p>
                    <h3 className="text-xl font-black break-keep">
                        {!src ? '‘시험지 출제’ 기능도 써보셨어요?'
                            : isTeacher ? '해설 붙여 시험지로 만드시겠어요?'
                                : '이 시험지 해설, 지금 받으세요'}
                    </h3>
                </div>

                {/* 본문 */}
                <div className="px-6 py-5">
                    <p className="text-slate-600 text-sm leading-relaxed mb-4 break-keep">
                        {src ? (isTeacher ? (
                            <>
                                방금 받으신 건 <strong>문제만</strong> 담긴 PDF예요.{' '}
                                <strong className="text-[#497AB7]">시험지 출제</strong>로 가면 같은{school ? ` ${school}` : ''} 문항을{' '}
                                <strong className="text-[#3AADA9]">해설까지 붙여 한글(HWP)</strong>로 받으실 수 있어요.
                            </>
                        ) : (
                            <>
                                방금 받으신 PDF에는 <strong>답이 없어요</strong>.{' '}
                                같은{school ? ` ${school}` : ''} 문제 그대로{' '}
                                <strong className="text-[#3AADA9]">해설이 붙은 한글파일</strong>을 무료로 받을 수 있어요.
                                <strong className="text-[#497AB7]"> 문제는 이미 담겨 있어요.</strong>
                            </>
                        )) : (
                            <>
                                방금 받은 건 <strong>맛보기</strong>예요. <strong className="text-[#497AB7]">시험지 출제</strong>로 가면
                                훨씬 자유롭게 나만의 시험지를 만들 수 있어요.
                            </>
                        )}
                    </p>
                    <ul className="space-y-2.5 mb-5">
                        <li className="flex items-start gap-2.5 text-sm text-slate-700">
                            <MousePointerClick size={18} className="text-[#3AADA9] shrink-0 mt-0.5" />
                            <span>{src ? <><strong>해설(미주) 포함</strong> 한글파일로 저장</> : <><strong>문제를 직접 골라</strong> 원하는 것만 담기</>}</span>
                        </li>
                        <li className="flex items-start gap-2.5 text-sm text-slate-700">
                            <Save size={18} className="text-[#3AADA9] shrink-0 mt-0.5" />
                            <span>{src ? <>방금 받은 회차가 <strong>이미 담긴 채로</strong> 열려요</> : <>만든 시험지를 <strong>저장하고 다시 편집</strong></>}</span>
                        </li>
                        <li className="flex items-start gap-2.5 text-sm text-slate-700">
                            <FileEdit size={18} className="text-[#3AADA9] shrink-0 mt-0.5" />
                            <span>{!src || isTeacher ? '문항 순서·난이도·구성까지 자유롭게' : '한글이 없으면 PDF로도 받을 수 있어요'}</span>
                        </li>
                    </ul>
                    <div className="flex flex-col gap-2">
                        <Link
                            href={href}
                            onClick={() => { try { fetch('/api/log/feature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature: 'promo_click', title: logTitle }) }); } catch { } }}
                            className="w-full text-center bg-gradient-to-r from-[#497AB7] to-[#3AADA9] text-white font-extrabold py-3 rounded-xl hover:opacity-90 transition-opacity"
                        >
                            {!src ? '시험지 출제 가보기 →' : isTeacher ? '해설 포함 한글파일 만들기 →' : '이 시험지 해설 받기 →'}
                        </Link>
                        <div className="flex items-center justify-between pt-0.5">
                            <button
                                onClick={hideToday}
                                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                오늘 하루 보지 않기
                            </button>
                            <button
                                onClick={onClose}
                                className="text-sm text-slate-500 font-bold hover:text-slate-700 transition-colors"
                            >
                                다음에 할게요
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
