"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { usePathname } from "next/navigation"

const TermsModal = dynamic(() => import("./TermsModal"), { ssr: false })
const PrivacyModal = dynamic(() => import("./PrivacyModal"), { ssr: false })
const RefundPolicyModal = dynamic(() => import("./RefundPolicyModal"), { ssr: false })

// 바닥글(10/7 새 디자인) — 사이트 안내 링크 묶음 + 사업자 정보. 모든 페이지에 붙는다(.rd 로 따로 감쌈).
export default function Footer() {
    // [모바일 ⑧] 시험지출제는 100dvh 전체화면 도구라, 그 아래 푸터가 붙으면 문서가 화면보다 길어져
    //   목록 스크롤과 페이지 스크롤이 두 겹이 된다(손가락이 목록 밖에 닿으면 푸터가 올라옴).
    //   폰에서만 숨긴다 — 데스크톱은 그대로.
    const pathname = usePathname();
    const hideOnMobile = pathname === '/question-bank';
    const [isTermsOpen, setIsTermsOpen] = useState(false)
    const [isPrivacyOpen, setIsPrivacyOpen] = useState(false)
    const [isRefundOpen, setIsRefundOpen] = useState(false)

    return (
        <footer className={`rd rd-footer mt-auto ${hideOnMobile ? 'hidden md:block' : ''}`}>
            <div className="rd-wrap">
                <div className="rd-footer-top">
                    <div className="rd-footer-brand">
                        <b>수학ETF</b>
                        <p>전국 고등학교 수학 내신 기출과<br />시험지 만들기</p>
                    </div>
                    <nav className="rd-footer-cols" aria-label="사이트 안내">
                        <div>
                            <p>기출</p>
                            <Link href="/schools">학교별 기출</Link>
                            <Link href="/region">지역별 기출</Link>
                            <Link href="/mock">모의고사·사관·경찰대</Link>
                        </div>
                        <div>
                            <p>시험지 만들기</p>
                            <Link href="/question-bank">시험지 만들기</Link>
                            <Link href="/teacher">선생님 안내</Link>
                            <Link href="/guide">사용법</Link>
                        </div>
                        <div>
                            <p>고객 지원</p>
                            <Link href="/notice">공지사항</Link>
                            <Link href="/suggestion">건의사항</Link>
                            <a href="mailto:mathetf.team@gmail.com">메일 문의</a>
                        </div>
                    </nav>
                </div>
                <div className="rd-footer-legal">
                    <button type="button" onClick={() => setIsTermsOpen(true)}>이용약관</button>
                    <button type="button" onClick={() => setIsPrivacyOpen(true)}><b>개인정보처리방침</b></button>
                    <button type="button" onClick={() => setIsRefundOpen(true)}>취소/환불정책</button>
                </div>
                <div className="rd-footer-biz">
                    <p>수학이티에프(mathETF) | 대표자명: 허연 | 사업자등록번호: 653-71-00575 | 통신판매업 신고번호: 제 2026-인천연수구-0575 호</p>
                    <p>주소: 인천광역시 연수구 컨벤시아대로 165, 755 (송도동, 포스코타워송도)</p>
                    <p>고객센터: 070-7954-4146 (평일 10:00 ~ 17:00, 점심시간 12:00 ~ 13:00, 주말/공휴일 휴무) | 이메일: <a href="mailto:mathetf.team@gmail.com">mathetf.team@gmail.com</a></p>
                    <p className="rd-footer-copy">© 2026 수학이티에프. All rights reserved. 본 사이트의 모든 콘텐츠는 저작권법의 보호를 받습니다.</p>
                </div>
            </div>

            <TermsModal
                isOpen={isTermsOpen}
                onClose={() => setIsTermsOpen(false)}
                readonly
            />
            <PrivacyModal
                isOpen={isPrivacyOpen}
                onClose={() => setIsPrivacyOpen(false)}
                readonly
            />
            <RefundPolicyModal
                isOpen={isRefundOpen}
                onClose={() => setIsRefundOpen(false)}
            />
        </footer>
    )
}
