"use client"

import { X } from "lucide-react"

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
        <div className="rd rd-overlay" style={{ zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="rd-modal rd-modal-lg rd-legal" role="dialog" aria-modal="true" aria-labelledby="TermsModal-title">
                <div className="rd-sheet-handle" aria-hidden="true" />
                <div className="rd-modal-head">
                    <h2 id="TermsModal-title" className="rd-modal-title">서비스 이용약관 동의</h2>
                    <button type="button" className="rd-modal-x" aria-label="닫기" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="rd-modal-body rd-legal-body">
                    <p className="font-bold mb-4">수학ETF 서비스 이용을 위해 아래 약관에 동의해주세요.</p>
                    <div className="space-y-6 text-foreground/90">
                        {/* [10/24] 수학비서·내신판·파스칼·매쓰플랫 약관 비교 후 — 서비스 정의·권리자 삭제 요청·자동 수집 금지를 넣었다 */}
                        <section>
                            <h3 className="font-bold text-base mb-2">제1조 (서비스의 성격)</h3>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>
                                    <span className="font-bold">작업 서비스:</span> 수학ETF는 회원이 정당하게 보유한 시험지를 바탕으로 회사가 문제를 한글 파일로 타이핑하고, 그림을 다시 그리고, 해설을 새로 작성·편집하여 제공하는 서비스입니다. 회원이 내는 비용은 이 타이핑·해설 작성·편집 작업에 대한 대가이며, 시험지 원본(스캔본·사진)은 회원에게 제공하거나 판매하지 않습니다.
                                </li>
                                <li>
                                    <span className="font-bold">권리자의 삭제 요청:</span> 시험 문제를 출제한 교사·학교 등 권리자는 고객센터(070-7954-4146, mathetf.team@gmail.com)로 해당 자료의 게시 중단을 요청할 수 있으며, 회사는 요청을 확인하는 즉시 해당 자료의 제공을 중단합니다.
                                </li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">제2조 (콘텐츠 부정 이용 및 위약벌)</h3>
                            <p className="mb-2">
                                구매자는 다운로드한 콘텐츠를 본인의 학습 목적으로만 사용해야 하며, 회사의 사전 승인 없이 온/오프라인, SNS, 타 자료실 등에 무단 전재, 공유 또는 재판매할 수 없습니다.
                            </p>
                            <p className="mb-2">
                                회원은 매크로, 봇, 크롤러 등 자동화된 방법으로 자료를 대량으로 조회·수집·다운로드해서는 안 됩니다.
                            </p>
                            <p className="mb-2">
                                제1항·제2항의 위반행위가 적발될 경우, 회사는 해당 회원의 이용을 제한하거나 자격을 정지할 수 있습니다.
                            </p>
                            <p>
                                <span className="font-bold">위약벌 규정:</span> 무단 배포 및 상업적 재판매 등 심각한 부정 이용의 경우, 회원은 회사에 해당 콘텐츠 판매가의 100배에 해당하는 금액을 위약벌로 지급해야 합니다. 단, 산출된 금액이 회사의 실질적 손해액보다 적을 경우 회사는 실손해액을 기준으로 추가 배상을 청구할 수 있습니다.
                            </p>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">제3조 (결제 및 청약철회)</h3>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>
                                    <span className="font-bold">건별/장바구니 결제:</span> 회원은 원하는 자료를 장바구니에 담아 통합 결제하거나 단건으로 결제할 수 있으며, 결제 내역은 마이페이지에서 확인 가능합니다.
                                </li>
                                <li>
                                    <span className="font-bold">청약철회:</span> 디지털 콘텐츠의 특성상 결제 후 열람(다운로드) 기록이 없는 경우에 한하여 7일 이내 환불이 가능합니다. 1회라도 다운로드/열람한 자료는 환불 대상에서 제외됩니다.
                                </li>
                                <li>
                                    <span className="font-bold">회원 탈퇴:</span> 회원 탈퇴 시 구매 내역 및 다운로드 권한은 소멸되며, 이미 다운로드 받은 자료에 대한 환불은 불가합니다.
                                </li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">제4조 (자료 제보 및 품질 관리)</h3>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>
                                    <span className="font-bold">저작권 보증:</span> 자료를 제보하는 회원은 제보하는 시험지를 정당하게 보유하고 있음(본인 응시·출제·수업 자료 등)을 확인하며, 업로드하는 자료가 제3자의 저작권을 침해하지 않음을 보증해야 합니다. 이와 관련한 모든 법적 분쟁의 책임은 업로더 본인에게 있으며, 회사는 플랫폼 제공자로서 이에 대해 책임을 지지 않습니다.
                                </li>
                                <li>
                                    <span className="font-bold">침해 시 삭제:</span> 제보 자료가 제3자의 권리를 침해하는 것으로 확인되면, 회사는 제보 자료와 그것을 바탕으로 만든 자료를 삭제하거나 제공을 중단할 수 있습니다. 회원은 제보할 때 이에 동의합니다.
                                </li>
                                <li>
                                    <span className="font-bold">제보 참여 보상:</span> 제보에 지급하는 포인트는 시험지 원본을 사는 대가가 아니라, 제보와 검수에 참여한 데 대한 보상입니다.
                                </li>
                                <li>
                                    <span className="font-bold">표준 양식 준수:</span> 모든 자료는 회사가 배포한 <span className="font-bold text-rose-500">&apos;수학ETF 전용 한글 양식&apos;</span>을 사용하여 작성되어야 합니다. 타 사이트의 워터마크가 포함되거나 양식을 무단 변형한 자료는 운영진 판단하에 즉시 판매가 중단될 수 있습니다.
                                </li>
                                <li>
                                    <span className="font-bold">운영자 개입 권한:</span> 자료 내 치명적인 오타나 수식 오류가 다수(3개소 이상) 발견되어 학습에 부적합하다고 판단될 경우, 회사는 자료 제공을 중단하고 구매자에 대한 결제 취소 조치를 취할 수 있습니다.
                                </li>
                            </ul>
                        </section>

                        {/* [10/15] 제보 보상 포인트가 나가기 시작해 현금 교환 문의에 근거가 필요(사용자) */}
                        <section>
                            <h3 className="font-bold text-base mb-2">제5조 (포인트)</h3>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>
                                    <span className="font-bold">사용 범위:</span> 포인트는 수학ETF 안에서 자료 구매와 이용권 결제에만 사용할 수 있습니다.
                                </li>
                                <li>
                                    <span className="font-bold">적립 포인트:</span> 자료 제보 보상·이벤트 등으로 받은 포인트는 <span className="font-bold text-rose-500">현금으로 바꾸거나 환불받을 수 없으며</span>, 다른 회원에게 넘기거나 팔 수 없습니다.
                                </li>
                                <li>
                                    <span className="font-bold">회수:</span> 부정한 방법으로 받은 포인트는 회수할 수 있으며, 회원 탈퇴 시 남은 적립 포인트는 소멸됩니다.
                                </li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="font-bold text-base mb-2">제6조 (기타 고지 사항)</h3>
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
                        <p>최초 시행일자: 2025-12-31</p>
                        <p>개정일자: 2026-10-15 (당시 제4조 포인트 신설)</p>
                        <p>개정일자: 2026-__-__ (제1조 서비스의 성격·권리자 삭제 요청 신설 및 조 번호 정리, 제2조 자동 수집 금지, 제4조 제보 확인·침해 시 삭제·참여 보상 명시)</p>
                    </div>
                </div>

                <div className="rd-modal-foot">
                    <button
                        onClick={onClose}
                        type="button" className="rd-btn rd-btn-gray"
                    >
                        {readonly ? '닫기' : '취소'}
                    </button>
                    {!readonly && onAgree && (
                        <button
                            onClick={onAgree}
                            type="button" className="rd-btn rd-btn-primary"
                        >
                            동의하고 가입하기
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
