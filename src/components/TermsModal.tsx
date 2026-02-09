"use client"

import { useState } from "react"

interface TermsModalProps {
    isOpen: boolean
    onClose: () => void
    onAgree?: () => void
    readonly?: boolean
}

export default function TermsModal({ isOpen, onClose, onAgree, readonly = false }: TermsModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-6 border-b">
                    <h2 className="text-xl font-bold">서비스 이용약관 동의</h2>
                </div>

                <div className="p-6 overflow-y-auto flex-1 text-sm leading-relaxed space-y-4">
                    <p className="font-bold mb-4">수학ETF 서비스 이용을 위해 아래 약관에 동의해주세요.</p>
                    <div className="space-y-6 text-foreground/90">
                        <section>
                            <h3 className="font-bold text-base mb-2">제1조 (콘텐츠 부정 이용 및 위약벌)</h3>
                            <p className="mb-2">
                                구매자는 다운로드한 콘텐츠를 본인의 학습 목적으로만 사용해야 하며, 회사의 사전 승인 없이 온/오프라인, SNS, 타 자료실 등에 무단 전재, 공유 또는 재판매할 수 없습니다.
                            </p>
                            <p className="mb-2">
                                제1항의 위반행위가 적발될 경우, 회사는 해당 회원의 자격을 즉시 정지하고 적립된 모든 포인트를 몰수할 수 있습니다.
                            </p>
                            <p>
                                <span className="font-bold">위약벌 규정:</span> 무단 배포 및 상업적 재판매 등 심각한 부정 이용의 경우, 회원은 회사에 해당 콘텐츠 판매가(포인트 환산가 기준)의 100배에 해당하는 금액을 위약벌로 지급해야 합니다. 단, 산출된 금액이 회사의 실질적 손해액보다 적을 경우 회사는 실손해액을 기준으로 추가 배상을 청구할 수 있습니다.
                            </p>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">제2조 (포인트 운영 및 청약철회)</h3>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>
                                    <span className="font-bold">포인트 유효기간:</span> 충전된 포인트의 유효기간은 결제일로부터 5년이며, 기간 경과 시 상법상의 소멸시효에 따라 자동 소멸됩니다.
                                </li>
                                <li>
                                    <span className="font-bold">청약철회:</span> 디지털 콘텐츠의 특성상 다운로드 혹은 열람 기록이 없는 경우에 한하여 결제 후 7일 이내에 환불이 가능합니다. 1회라도 다운로드/열람한 자료는 환불 대상에서 제외됩니다.
                                </li>
                                <li>
                                    <span className="font-bold">잔여분 환불:</span> 회원 탈퇴 시 직접 결제한 포인트의 잔액은 결제 대행사 수수료 및 송금 수수료를 제외한 후 환불됩니다. (이벤트 등으로 무상 지급된 포인트는 환불 불가)
                                </li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">제3조 (판매자 책임 및 품질 관리)</h3>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>
                                    <span className="font-bold">저작권 보증:</span> 판매자는 업로드하는 자료가 제3자의 저작권을 침해하지 않음을 보증해야 합니다. 이와 관련한 모든 법적 분쟁의 책임은 업로더(판매자) 본인에게 있으며, 회사는 플랫폼 제공자로서 이에 대해 책임을 지지 않습니다.
                                </li>
                                <li>
                                    <span className="font-bold">표준 양식 준수:</span> 모든 자료는 회사가 배포한 <span className="font-bold text-rose-500">&apos;수학ETF 전용 한글 양식&apos;</span>을 사용하여 작성되어야 합니다. 타 사이트의 워터마크가 포함되거나 양식을 무단 변형한 자료는 운영진 판단하에 즉시 판매가 중단될 수 있습니다.
                                </li>
                                <li>
                                    <span className="font-bold">운영자 개입 권한:</span> 자료 내 치명적인 오타나 수식 오류가 다수(3개소 이상) 발견되어 학습에 부적합하다고 판단될 경우, 회사는 판매자의 별도 동의 없이 판매 정지 및 구매자에 대한 포인트 반환 조치를 취할 수 있습니다.
                                </li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">제4조 (기타 고지 사항)</h3>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>
                                    <span className="font-bold">보호자 동의:</span> 미성년 회원의 유료 결제 시 법정대리인의 동의가 필요하며, 동의가 없는 경우 해당 결제는 취소될 수 있습니다.
                                </li>
                                <li>
                                    <span className="font-bold">분쟁 해결:</span> 서비스 이용 중 발생한 분쟁에 대해 회사와 회원 간의 합의가 이루어지지 않을 경우, 서울중앙지방법원을 전속 관할 법원으로 하여 해결합니다.
                                </li>
                            </ul>
                        </section>
                    </div>

                    <div className="mt-8 text-right text-sm text-foreground/60 border-t pt-4">
                        <p>공고일자: 2025-12-31 / 시행일자: 2025-12-31</p>
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
