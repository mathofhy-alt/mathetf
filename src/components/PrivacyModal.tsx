"use client"

interface PrivacyModalProps {
    isOpen: boolean
    onClose: () => void
    onAgree?: () => void
    readonly?: boolean
}

export default function PrivacyModal({ isOpen, onClose, onAgree, readonly = false }: PrivacyModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-6 border-b">
                    <h2 className="text-xl font-bold">개인정보 수집 및 이용 동의</h2>
                </div>

                <div className="p-6 overflow-y-auto flex-1 text-sm leading-relaxed space-y-4">
                    <p className="font-bold mb-4">수학ETF는 서비스 제공을 위해 최소한의 개인정보를 수집하며, 사용자의 권리를 보호합니다.</p>

                    <div className="space-y-6 text-foreground/90">
                        <section>
                            <h3 className="font-bold text-base mb-2">1. 수집하는 개인정보 항목</h3>
                            <ul className="list-disc pl-5 space-y-1">
                                <li><span className="font-bold">회원가입 시:</span> 이메일 주소(ID), 비밀번호, 닉네임.</li>
                                <li><span className="font-bold">유료 서비스 이용 시:</span> 결제 기록, 결제 승인 번호 (포트원 연동 시 발생).</li>
                                <li><span className="font-bold">서비스 이용 과정:</span> 접속 로그, 쿠키, IP 정보.</li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">2. 개인정보의 수집 및 이용 목적</h3>
                            <ul className="list-disc pl-5 space-y-1">
                                <li><span className="font-bold">회원 관리:</span> 회원 식별, 가입 의사 확인, 본인 확인, 불량 회원 부정 이용 방지.</li>
                                <li><span className="font-bold">서비스 제공:</span> 기출자료 다운로드, 포인트 충전 및 결제 서비스 제공, 콘텐츠 구매 내역 관리.</li>
                                <li><span className="font-bold">고객 지원:</span> 서비스 관련 공지사항 전달, 민원 처리 및 고객 상담.</li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">3. 개인정보의 보유 및 이용 기간</h3>
                            <p className="mb-2"><span className="font-bold">원칙:</span> 회원 탈퇴 시까지 보관 후 지체 없이 파기합니다.</p>
                            <p className="mb-2"><span className="font-bold">법적 보관:</span> 단, 관련 법령에 따라 다음 정보는 명시된 기간 동안 보관합니다.</p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래법)</li>
                                <li>대금결제 및 재화 등의 공급에 관한 기록: 5년 (전자상거래법)</li>
                                <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년 (전자상거래법)</li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">4. 동의 거부권 및 불이익</h3>
                            <p>
                                사용자는 개인정보 수집 및 이용에 대한 동의를 거부할 권리가 있습니다. 단, 동의 거부 시 회원가입 및 유료 자료 구매 등 수학ETF의 핵심 서비스 이용이 제한될 수 있습니다.
                            </p>
                        </section>
                    </div>
                </div>

                <div className="p-6 border-t flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-foreground/70 hover:text-foreground transition-colors"
                    >
                        {readonly ? '닫기' : '취소'}
                    </button>
                    {!readonly && onAgree && (
                        <button
                            onClick={onAgree}
                            className="bg-green-700 text-white px-6 py-2 rounded-md hover:bg-green-800 transition-colors font-semibold"
                        >
                            동의하고 가입하기
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
