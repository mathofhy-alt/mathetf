"use client";

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { payOrder } from '@/lib/payments/client';
import { PLAN_COPY, FREE_TRIAL, PASS_SHEET, QB_PASS, QB_PASS_TERMS, QB_LIMITS, PASS_PLANS, SHEET_PLAN, termPrice, type PassPlanId } from '@/lib/qbPassConfig';
import RefundPolicyModal from '@/components/RefundPolicyModal';
import PointsPicker from '@/components/PointsPicker';
import { createClient } from '@/utils/supabase/client';
import { REPORT_REWARD_LABEL, REPORT_REWARD_POINTS } from '@/lib/report-reward';

export type PassInfo = { sheetLeft: number; sheetExpiresAt: string | null; unlimited: boolean; paywall?: boolean; admin?: boolean; passUntil: string | null; freeLeft: number; freeExamLeft: number; freeBundleLeft: number; freePredictLeft: number; predictDayLeft: number; predictWeekLeft: number; examUntil: string | null; examLeft: number; onceLeft: number; viewers?: number | null };

const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };

/** 하단 바·마이페이지에 쓰는 한 줄 (10/7) */
export function passLine(p: PassInfo | null, examOnly = false): string {   // examOnly: 시험지 만들기 화면 — 좁은 바에 저장 횟수만
    if (!p) return '';
    if (examOnly) return `이번 주 무료 ${p.freeExamLeft}회 남음 · 월요일 0시에 다시 채워져요 · 시험지 1장권 ${p.sheetLeft}장${p.sheetExpiresAt ? ` (${md(p.sheetExpiresAt)}까지 사용)` : ''}${p.passUntil ? ` · 강사 이용권 ${md(p.passUntil)}까지` : p.unlimited ? ' · 저장 무제한' : ''}${p.examUntil ? ` · 시험대비권 ${md(p.examUntil)}까지 (시험지·프린트 합쳐 ${p.examLeft}건 남음)` : ''}`;
    if (p.passUntil) return `이용권 ${md(p.passUntil)}까지`;
    if (p.unlimited) return '';
    const extra = p.onceLeft > 0 ? ` · 1회권 ${p.onceLeft}장` : '';
    if (p.examUntil) return `시험대비권 ${md(p.examUntil)}까지 · 시험지·프린트 합쳐 ${p.examLeft}건 남음 · 예상문제 횟수 제한 없음${extra}`;
    return `이번 주 무료 시험지 ${p.freeExamLeft}회 · 시험지 1장권 ${p.sheetLeft}장 · 프린트 ${p.freeBundleLeft}건 · 예상 오늘 ${p.predictDayLeft}회·이번 주 ${p.predictWeekLeft}회 남음${extra}`;
}

/**
 * 이용권 결제 창 (10/7, 11/5 3단). 무료 횟수를 다 쓰고 저장하려 할 때, 또는 직접 열 때.
 * 결제는 장바구니와 같은 payOrder(서버 주문 → 포트원 → 서버 확인). 모바일은 결제 후 /payments/return 으로 돌아온다.
 */
// [10/12] 결제 화면 계측 — 저장이 막혀 뜬 건지(save_blocked) 버튼으로 연 건지, 결제 버튼을 눌렀는지. feature_usage 에 남는다
const logPass = (feature: string, title: string) => {
    fetch('/api/log/feature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature, title }) }).catch(() => { });
};

export default function PassModal({ user, info, onClose, onPaid, from = 'button', context = 'bundle', purchaseInNewTab = false }: { user: any; info: PassInfo | null; onClose: () => void; onPaid: () => void; from?: string; context?: 'exam' | 'bundle'; purchaseInNewTab?: boolean }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    // [10/7] 환불 불가 동의 — 사용자 결정(사용 0회여도 환불 안 함). 동의해야 결제 버튼이 눌린다.
    const [agree, setAgree] = useState(false);
    const [showRefund, setShowRefund] = useState(false);
    const [months, setMonths] = useState<number>(1);   // [10/8] 몇 개월 살지
    const term = QB_PASS_TERMS.find(t => t.months === months) || QB_PASS_TERMS[0];
    const plans = context === 'exam' ? [SHEET_PLAN, PASS_PLANS[1], PASS_PLANS[2]] : PASS_PLANS;
    const [planId, setPlanId] = useState<PassPlanId>(context === 'exam' ? 'sheet' : 'teacher');   // [11/5 대표] 1회권·시험대비권·강사 이용권
    const plan = plans.find(p => p.id === planId) || PASS_PLANS[2];
    const isTeacher = plan.id === 'teacher';
    const total = isTeacher ? termPrice(term.months) : plan.price;
    // [10/8] 포인트로도 이용권을 산다(사용자: 무료 타이핑 채택 5,000P × 6건 = 1개월). 전액 포인트면 카드 결제창 없이 끝난다.
    const [points, setPoints] = useState(0);
    useEffect(() => { logPass('qb_paywall_view', `${from}|무료${info ? (info.unlimited ? '무제한' : `${info.freeLeft}남음`) : '?'}`); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const [pointsPick, setPointsPick] = useState(0);   // [10/24 대표] 체크하면 전부 들어가던 것 → 쓸 만큼 1,000P 단위로
    useEffect(() => {
        if (!user?.id) return;
        createClient().from('profiles').select('earned_points').eq('id', user.id).single().then(({ data }) => setPoints(Number(data?.earned_points) || 0), () => {});
    }, [user?.id]);
    const usedPoints = Math.min(pointsPick, points, total);   // 기간을 바꿔 금액이 줄면 그 안으로
    const pay = total - usedPoints;
    // [10/8] 휴대폰 번호가 없는 계정(회원 1,319명 중 6명, 예전 가입) — 포트원 카드 결제가 전화번호를 필수로 요구한다
    const needPhone = pay > 0 && !(user?.user_metadata?.phone || user?.phone);   // 카드 결제가 있을 때만 번호가 필요
    const [phone, setPhone] = useState('');
    const phoneOk = !needPhone || /^01[016789]\d{7,8}$/.test(phone.replace(/[^0-9]/g, ''));
    const buy = async () => {
        if (purchaseInNewTab) { window.open('/mypage?pass=1', '_blank', 'noopener,noreferrer'); return; }
        if (busy || !agree || !phoneOk) return;
        logPass('qb_paywall_pay', `${from}|${isTeacher ? `${months}개월` : plan.id}|${pay}원`);
        setBusy(true); setErr('');
        try {
            const digits = phone.replace(/[^0-9]/g, '');
            if (needPhone) await createClient().auth.updateUser({ data: { phone: digits } }).catch(() => null);   // 다음 결제부터는 묻지 않게
            await payOrder(user, { kind: 'cart', items: [{ item_id: isTeacher ? term.itemId : plan.itemId }], usedPoints }, needPhone ? digits : undefined); onPaid();
        }
        catch (e: any) { setErr(e?.message || '결제를 마치지 못했습니다.'); }
        setBusy(false);
    };
    const out = context === 'exam' && info && !info.unlimited && info.freeLeft <= 0;
    return (
        <div className="rd rd-overlay" style={{ zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="rd-modal rd-modal-sm rd-pass" role="dialog" aria-modal="true" aria-labelledby="pass-title">
                <div className="rd-sheet-handle" aria-hidden="true" />
                <div className="rd-modal-head">
                    <h2 id="pass-title" className="rd-modal-title">{out ? '이번 주 무료 횟수를 다 쓰셨어요' : '이용권'}</h2>
                    <button type="button" className="rd-modal-x" aria-label="닫기" onClick={onClose}><X size={20} /></button>
                </div>
                <p className="rd-modal-text">
                    {out ? PLAN_COPY.exhausted : '쓰시는 만큼 골라 보세요.'}
                </p>
                <div className="rd-pass-card">
                    {/* [10/8] 최근 30분 이용자 수 — 사실 그대로의 문구, 3명 미만이면 서버가 null(숨김) */}
                    {info?.viewers ? <p className="rd-pass-bubble" role="status"><span className="rd-pass-dot" aria-hidden="true" />최근 30분 동안 <b>{info.viewers}명</b>이 시험지 만들기를 이용했어요</p> : null}
                    <div className="rd-seg rd-pass-plans" role="radiogroup" aria-label="이용권 종류">
                        {plans.map(p => <button key={p.id} type="button" role="radio" aria-checked={planId === p.id} aria-pressed={planId === p.id} onClick={() => setPlanId(p.id)}>{p.name}</button>)}
                    </div>
                    <p className="rd-pass-fit">{plan.fit}</p>
                    {isTeacher ? <>
                        <p className="rd-pass-name">강사 이용권 <span className="rd-pass-per">한 달 {QB_PASS.salePrice.toLocaleString()}원</span></p>
                        <div className="rd-seg rd-pass-terms" role="radiogroup" aria-label="이용 기간">
                            {QB_PASS_TERMS.map(t => <button key={t.months} type="button" role="radio" aria-checked={months === t.months} aria-pressed={months === t.months} onClick={() => setMonths(t.months)}>{t.months}개월</button>)}
                        </div>
                        <p className="rd-pass-price"><b>{total.toLocaleString()}</b>원 <small>{term.days}일</small></p>
                        <ul>
                            <li><Check size={16} aria-hidden="true" /> 시험지 만들기·프린트 변형·예상문제 모두 무제한</li>
                            <li><Check size={16} aria-hidden="true" /> 한글(HWP)과 PDF 둘 다 받기</li>
                            <li><Check size={16} aria-hidden="true" /> 로고 없음</li>
                            <li><Check size={16} aria-hidden="true" /> 한 시험지 최대 {QB_LIMITS.pass.questions}문항 <small className="rd-pass-was">무료 {QB_LIMITS.free.questions}문항</small></li>
                            <li><Check size={16} aria-hidden="true" /> 보관함 {QB_LIMITS.pass.saved}개 <small className="rd-pass-was">무료 {QB_LIMITS.free.saved}개</small></li>
                            <li><Check size={16} aria-hidden="true" /> 결제한 날부터 {term.days}일, 자동 결제 없음</li>
                            <li><Check size={16} aria-hidden="true" /> 기간 중에 다시 사면 끝나는 날 뒤로 이어 붙어요</li>
                        </ul>
                    </> : <>
                        <p className="rd-pass-name">{plan.name}</p>
                        <p className="rd-pass-price"><b>{plan.price.toLocaleString()}</b>원 <small>{plan.unit}</small></p>
                        <ul>{plan.lines.map(l => <li key={l}><Check size={16} aria-hidden="true" /> {l}</li>)}</ul>
                    </>}
                    <p className="rd-pass-example">예) {plan.example}</p>
                </div>
                {/* 내신 문제+해설 건당 판매는 이용권과 별개 — 구매 후 항의를 막으려고 적어 둔다 */}
                <p className="rd-pass-fine">내신 문제+해설 파일 건당 구매는 이용권에 포함되지 않아요.</p>
                <p className="rd-pass-fine">예상문제는 무료 하루 {FREE_TRIAL.predictDaily}회·주 {FREE_TRIAL.predictWeekly}회(한국 시간, 월요일 0시 시작). 기간 중인 시험대비권·강사 이용권 회원은 횟수 제한이 없어요. 1회권은 해당하지 않으며, 예상문제 한글은 강사 이용권만 제공해요.</p>
                {/* [10/13] 결제 대신 원본으로 — 강사는 담당 학교 기출 원본을 여러 해치 갖고 있다. 원본 6회차 × 5,000P = 이용권 한 달 */}
                {(isTeacher || context === 'exam') && <div className="rd-pass-report">
                    <p><b>결제 대신 원본 시험지로</b> 가지고 있는 학교 시험지 원본을 보내 주시면 회차마다 {REPORT_REWARD_LABEL}를 드려요. <b>{Math.ceil(QB_PASS.salePrice / REPORT_REWARD_POINTS)}회차면 이용권 한 달</b>이고, 그림·해설까지 타이핑한 한글 파일도 드려요.</p>
                    <button type="button" className="rd-btn rd-btn-gray rd-btn-block" onClick={() => {
                        logPass('qb_paywall_report', `${from}|${out ? 'out' : 'left'}`);
                        onClose(); window.dispatchEvent(new CustomEvent('open-original-report', { detail: { bulk: true } }));
                    }}>원본 제보로 포인트 받기 (채택 시 5,000P)</button>
                </div>}
                {points > 0 && <PointsPicker points={points} total={total} value={usedPoints} onChange={setPointsPick} />}
                {usedPoints > 0 && <p className="rd-pass-fine">포인트 -{usedPoints.toLocaleString()}원 · 결제 금액 {pay.toLocaleString()}원</p>}
                {needPhone && <label className="rd-pass-phone">
                    <span>결제에 쓸 휴대폰 번호 <small>카드 결제에 꼭 필요해요</small></span>
                    <input type="tel" inputMode="numeric" autoComplete="tel" placeholder="01012345678" value={phone} onChange={e => setPhone(e.target.value)} className="rd-input" />
                </label>}
                <label className="rd-pass-agree">
                    <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
                    <span>{plan.id === 'sheet' ? `시험지 1장권은 구매 후 ${PASS_SHEET.days}일 안에 사용하며, ` : ''}이용권은 결제 즉시 제공이 시작되어 <b>결제 후에는 사용하지 않았더라도 환불되지 않는다</b>는 데 동의합니다. <button type="button" onClick={() => setShowRefund(true)}>환불 정책 보기</button></span>
                </label>
                {err && <p className="rd-pass-err" role="alert">{err}</p>}
                <div className="rd-modal-actions">
                    <button type="button" className="rd-btn rd-btn-primary rd-btn-block" onClick={buy} disabled={busy || (!purchaseInNewTab && (!agree || !phoneOk))}>{purchaseInNewTab ? '이용권 구매하기 (새 탭)' : busy ? '결제 진행 중…' : pay === 0 ? `포인트 ${usedPoints.toLocaleString()}P로 결제하기` : `${pay.toLocaleString()}원 결제하기`}</button>
                    <button type="button" className="rd-btn rd-btn-gray rd-btn-block" onClick={onClose}>닫기</button>
                </div>
                <p className="rd-pass-fine">담아 둔 문항은 그대로 남아 있어요. 결제 후 다시 저장을 누르면 됩니다.</p>
            </div>
            {showRefund && <div style={{ position: 'relative', zIndex: 310 }}><RefundPolicyModal isOpen onClose={() => setShowRefund(false)} /></div>}
        </div>
    );
}
