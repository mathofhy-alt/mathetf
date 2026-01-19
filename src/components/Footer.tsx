"use client"

import { useState } from "react"
import TermsModal from "./TermsModal"
import PrivacyModal from "./PrivacyModal"

export default function Footer() {
    const [isTermsOpen, setIsTermsOpen] = useState(false)
    const [isPrivacyOpen, setIsPrivacyOpen] = useState(false)

    return (
        <footer className="w-full py-8 text-center text-sm text-slate-500 border-t mt-auto">
            <div className="flex justify-center gap-6 mb-4">
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
            <p>
                © 2025 수학ETF. All rights reserved.
            </p>

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
