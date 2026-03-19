"use client"

import { useState } from "react"

interface RefundPolicyModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function RefundPolicyModal({ isOpen, onClose }: RefundPolicyModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-6 border-b">
                    <h2 className="text-xl font-bold">취소 및 환불 정책</h2>
                </div>

                <div className="p-6 overflow-y-auto flex-1 text-sm leading-relaxed space-y-4">
                    <p className="font-bold mb-4">수학ETF 자료 결제 및 콘텐츠 환불 규정 안내입니다.</p>
                    <div className="space-y-6 text-foreground/90">
                        <section>
                            <h3 className="font-bold text-base mb-2">제1조 (결제 취소 및 환불의 원칙)</h3>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>
                                    <span className="font-bold">단순 변심 및 오결제 환불:</span> 회원은 자료 결제일로부터 7일 이내에 전혀 다운로드(열람)하지 않은 자료에 한하여 전액 결제 취소 및 환불을 요청할 수 있습니다.
                                </li>
                                <li>
                                    <span className="font-bold">디지털 콘텐츠 특례:</span> 본 서비스에서 유통되는 HWPX 등의 문제 자료는 &apos;디지털 콘텐츠&apos;에 해당합니다. 따라서 <span className="text-rose-600 font-bold">자료를 1회라도 열람하거나 다운로드한 경우 전자상거래법 제17조 제2항에 의거하여 청약철회(환불)가 불가능</span>합니다.
                                </li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">제2조 (환불 불가 사유)</h3>
                            <p className="mb-2">다음 각 호의 경우 결제 취소 및 환불이 엄격히 제한됩니다.</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>결제한 자료를 이미 다운로드하거나 1회 이상 열람한 경우</li>
                                <li>회원의 귀책 사유로 인해 서비스 권한이 정지 또는 해지된 경우 (예: 무단 배포, 계정 공유 등)</li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">제3조 (환불 절차 및 방법)</h3>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>
                                    <span className="font-bold">신청 방법:</span> 환불을 원하시는 회원은 고객센터 이메일(mathetf.team@gmail.com) 또는 1:1 문의를 통해 환불 의사를 표시해야 합니다.
                                </li>
                                <li>
                                    <span className="font-bold">환불 소요일:</span> 환불 신청이 접수되고 미다운로드 내역이 확인된 날로부터 영업일 기준 3~5일 이내에 결제하셨던 수단(신용카드, 계좌이체 등)으로 승인 취소 또는 환불 처리됩니다.
                                </li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">제4조 (회사의 귀책 사유로 인한 환불)</h3>
                            <p className="mb-2">
                                구매한 콘텐츠에 기술적 결함(예: 빈 파일, 열람 불가 등)이 회사의 귀책 사유임이 명백하고 정상적인 교환이 불가능한 경우, 다운로드 여부와 상관없이 결제 금액을 100% 전액 환불 및 승인 취소해 드립니다.
                            </p>
                        </section>
                    </div>

                    <div className="mt-8 text-right text-sm text-foreground/60 border-t pt-4">
                        <p>공고일자: 2025-01-01 / 시행일자: 2025-01-01</p>
                    </div>
                </div>

                <div className="p-6 border-t flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="bg-brand-600 text-white px-6 py-2 rounded-md hover:bg-brand-700 transition-colors font-semibold"
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    )
}
