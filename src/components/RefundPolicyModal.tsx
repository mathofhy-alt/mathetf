"use client"

import { QB_PASS } from '@/lib/qbPassConfig';
import { X } from "lucide-react"

import { useState } from "react"

interface RefundPolicyModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function RefundPolicyModal({ isOpen, onClose }: RefundPolicyModalProps) {
    if (!isOpen) return null

    return (
        <div className="rd rd-overlay" style={{ zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="rd-modal rd-modal-lg rd-legal" role="dialog" aria-modal="true" aria-labelledby="RefundPolicyModal-title">
                <div className="rd-sheet-handle" aria-hidden="true" />
                <div className="rd-modal-head">
                    <h2 id="RefundPolicyModal-title" className="rd-modal-title">취소 및 환불 정책</h2>
                    <button type="button" className="rd-modal-x" aria-label="닫기" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="rd-modal-body rd-legal-body">
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

                        {/* [10/7] 시험지 만들기 이용권 — 사용자 결정: 사용 0회여도 환불 안 함. 결제 창에서 동의를 받는다(PassModal). */}
                        <section>
                            <h3 className="font-bold text-base mb-2">제2조의2 (시험지 만들기 이용권)</h3>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>시험지 만들기 이용권은 결제가 완료되는 즉시 이용 기간이 시작되는 기간제 디지털 콘텐츠입니다.</li>
                                <li>회원은 결제 전에 무료 이용(한 주 {QB_PASS.freePerWeek}회 시험지 만들기)으로 서비스를 미리 이용해 볼 수 있으며, 결제 화면에서 아래 내용에 동의한 후 결제합니다.</li>
                                <li><span className="text-rose-600 font-bold">이용권은 결제 즉시 제공이 시작되므로, 이용 여부와 관계없이 결제 후에는 청약철회(환불)가 제한됩니다</span>(전자상거래법 제17조 제2항 제5호).</li>
                                <li>다만 회사의 귀책 사유(중복 결제, 시스템 오류로 이용권이 적용되지 않은 경우 등)로 이용하지 못한 경우에는 확인 후 환불하거나 이용 기간을 연장합니다.</li>
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

                <div className="rd-modal-foot">
                    <button
                        onClick={onClose}
                        type="button" className="rd-btn rd-btn-primary"
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    )
}
