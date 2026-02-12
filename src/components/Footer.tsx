"use client"

import { useState } from "react"
import TermsModal from "./TermsModal"
import PrivacyModal from "./PrivacyModal"

export default function Footer() {
    const [isTermsOpen, setIsTermsOpen] = useState(false)
    const [isPrivacyOpen, setIsPrivacyOpen] = useState(false)

    return (
        <footer className="w-full py-10 bg-slate-50 text-slate-500 border-t mt-auto">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 border-b pb-8">
                    <div className="text-left">
                        <h3 className="text-lg font-bold text-slate-800 mb-2">수학이티에프(mathETF)</h3>
                        <p className="text-xs leading-6">
                            대표자명: 허연 | 사업자등록번호: 653-71-00575<br />
                            주소: 인천광역시 연수구 컨벤시아대로 165, 755 (송도동, 포스코타워송도)<br />
                            문의: <a href="mailto:mathetf.team@gmail.com" className="hover:text-blue-600 transition-colors">mathetf.team@gmail.com</a>
                        </p>
                    </div>
                    <div className="flex gap-6 text-xs font-medium">
                        <button
                            onClick={() => setIsTermsOpen(true)}
                            className="hover:text-slate-800 transition-colors"
                        >
                            이용약관
                        </button>
                        <button
                            onClick={() => setIsPrivacyOpen(true)}
                            className="hover:text-slate-800 transition-colors font-bold"
                        >
                            개인정보처리방침
                        </button>
                    </div>
                </div>
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-slate-400">
                    <p>© 2025 수학이티에프. All rights reserved.</p>
                    <p>본 사이트의 모든 콘텐츠는 저작권법의 보호를 받습니다.</p>
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
        </footer>
    )
}
