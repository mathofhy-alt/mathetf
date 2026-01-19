"use client"

interface MarketingModalProps {
    isOpen: boolean
    onClose: () => void
    onAgree?: () => void
    readonly?: boolean
}

export default function MarketingModal({ isOpen, onClose, onAgree, readonly = false }: MarketingModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-6 border-b">
                    <h2 className="text-xl font-bold">마케팅 정보 수신 동의</h2>
                </div>

                <div className="p-6 overflow-y-auto flex-1 text-sm leading-relaxed space-y-4">
                    <p className="font-bold mb-4">수학ETF가 제공하는 다양한 혜택과 맞춤형 교육 정보를 가장 먼저 받아보세요!</p>

                    <div className="space-y-6 text-foreground/90">
                        <section>
                            <h3 className="font-bold text-base mb-2">1. 수집 및 이용 목적</h3>
                            <ul className="list-disc pl-5 space-y-1">
                                <li><span className="font-bold">신규 콘텐츠 알림:</span> 관심 학교의 최신 기출 자료 업로드 소식 안내.</li>
                                <li><span className="font-bold">혜택 제공:</span> 포인트 충전 이벤트, 할인 쿠폰 발급, 무료 자료 증정 소식 전달.</li>
                                <li><span className="font-bold">서비스 맞춤화:</span> 사용자 이용 패턴에 따른 맞춤형 학습 콘텐츠 추천 및 서비스 개선 안내.</li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">2. 수집 항목</h3>
                            <p>이메일 주소, 닉네임, 서비스 이용 기록.</p>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">3. 보유 및 이용 기간</h3>
                            <p>회원 탈퇴 시 또는 마케팅 수신 동의 철회 시까지 보관.</p>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">4. 동의 거부권 및 혜택</h3>
                            <p>
                                본 동의는 선택 사항이며, 거부하더라도 수학ETF의 기본 서비스(자료 구매 및 판매) 이용에는 전혀 제한이 없습니다. 다만, 동의 거부 시 이벤트 참여 기회나 맞춤형 할인 혜택 알림이 제한될 수 있습니다.
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
