import Link from 'next/link';
import { ArrowLeft, Clock } from 'lucide-react';
import Header from '@/components/Header';
import { BUNDLE_KEEP_DAYS, QB_PASS, QB_LIMITS, FREE_TRIAL, PASS_ONCE, PASS_EXAM, PASS_SHEET } from '@/lib/qbPassConfig';
import { REPORT_REWARD_LABEL } from '@/lib/report-reward';
import { FREE_PDF_DAILY_LIMIT } from '@/lib/config';

/**
 * 고정 공지 (2026-10-08) — 유료화(10/13 0시)·무료 타이핑·무료 PDF 안내.
 * 공지사항 표(notices)는 운영 DB 라 개발 서버에서 미리 볼 수 없어 코드로 둔다. 목록 맨 위 고정(CommunityBoard), 홈 안내 띠가 여기로 연결.
 */
export const metadata = { title: '10월 12일(월)부터 시험지 만들기 이용 방식이 바뀝니다 | 수학ETF 공지', robots: { index: false, follow: true } };

export default function ChangeNotice() {
    return (
        <div className="rd rd-x rd-bd">
            <Header />
            <article className="rd-wrap rd-x-top rd-bd-read">
                <Link href="/notice" className="rd-x-back"><ArrowLeft size={18} /> 공지사항</Link>
                <span className="rd-bd-tag is-accent">공지</span>
                <h1 className="rd-bd-title">10월 12일(월)부터 시험지 만들기 이용 방식이 바뀝니다</h1>
                <p className="rd-bd-meta"><span><Clock size={15} aria-hidden />2026. 10. 8.</span></p>

                <div className="rd-bd-body rd-nt">
                    <p>안녕하세요, 수학ETF입니다.</p>
                    <p>그동안 시험지 만들기를 무료로 써 주셔서 감사합니다. 더 많은 학교의 기출을 꾸준히 올리기 위해 10월 12일부터 이용 방식을 바꾸게 되었습니다. 갑작스러운 변경으로 불편을 드려 죄송합니다.</p>

                    <h2>1. 시험지 만들기 <small>현재 기준</small></h2>
                    <ul>
                        <li>문항 고르기·검색·미리보기는 계속 무료입니다.</li>
                        <li>시험지 저장은 무료로 <b>주 {QB_PASS.freePerWeek}회</b>(한국 시간 월요일 0시 리셋), 최대 {QB_LIMITS.free.questions}문항·보관함 {QB_LIMITS.free.saved}개·한글/PDF입니다. 저장 성공만 세고 같은 시험지 다시 받기는 세지 않습니다.</li>
                        <li><b>시험지 1장권:</b> {PASS_SHEET.price.toLocaleString()}원 · 새 시험지 1장 저장, 최대 {QB_LIMITS.free.questions}문항·한글/PDF·로고 없음. 구매 후 {PASS_SHEET.days}일 안에 사용하며 이후 소멸합니다. 무료 주 {FREE_TRIAL.exam}회를 먼저 쓰고 1장권을 사용합니다. 여러 장 구매하면 누적되며 강사 이용권 이용 중에는 차감하지 않습니다. 만든 시험지는 보관함에서 만든 뒤 {BUNDLE_KEEP_DAYS}일 동안 추가 차감 없이 다시 받습니다. 포인트 결제도 가능합니다.</li>
                        <li>프린트 변형은 평생 <b>{FREE_TRIAL.bundle}건</b> 무료 체험할 수 있습니다(건당 {FREE_TRIAL.questions}문항, 로고가 있는 PDF).</li>
                        <li>예상문제는 무료 <b>하루 {FREE_TRIAL.predictDaily}회·주 {FREE_TRIAL.predictWeekly}회</b>(한국 시간, 월요일 0시 시작)입니다. PDF 받기 한 묶음을 1회로 세고 같은 묶음 다시 받기는 세지 않습니다. 무료 PDF에는 로고가 들어갑니다. 기간 중인 시험대비권·강사 이용권 회원은 예상문제 횟수 제한이 없으며, 1회권은 해당하지 않습니다. 예상문제 한글은 강사 이용권만 제공합니다.</li>
                        <li><b>1회권:</b> {PASS_ONCE.price.toLocaleString()}원 · 프린트 변형 1건 (PDF·한글, 만든 시각부터 {BUNDLE_KEEP_DAYS}일 동안 다시 받기)</li>
                        <li><b>시험대비권:</b> {PASS_EXAM.price.toLocaleString()}원 · {PASS_EXAM.days}일. 시험지 만들기·프린트 변형 합쳐 {PASS_EXAM.bundles}건 · 한글/PDF · {BUNDLE_KEEP_DAYS}일 다시 받기 · 예상문제 제한 없음. 시험지는 최대 {QB_LIMITS.free.questions}문항·로고 없음, 프린트는 건당 최대 {FREE_TRIAL.questions}문항입니다. 시험지는 주 무료 {FREE_TRIAL.exam}회 → 시험대비권 → 시험지 1장권 순서로 사용하고, 예상문제에는 건수를 차감하지 않습니다. 예: 기말 2주 전, 반별 시험지와 학교 프린트 비슷한 문제를 같이 준비할 때.</li>
                        <li><b>강사 이용권:</b> 1개월 {QB_PASS.salePrice.toLocaleString()}원 (3·6·12개월 선택)
                            <ul>
                                <li>세 기능 모두 무제한 · 한글과 PDF · 한 시험지 최대 {QB_LIMITS.pass.questions}문항 · 보관함 {QB_LIMITS.pass.saved}개</li>
                                <li>보유 포인트로도 결제할 수 있습니다</li>
                            </ul>
                        </li>
                        <li>이미 만들어 두신 시험지는 그대로 받으실 수 있습니다. 시험지 1장권·1회권·시험대비권·강사 이용권은 결제 후 사용하지 않아도 환불되지 않습니다. 회사 귀책의 중복 결제·시스템 오류 등은 환불 정책에 따라 처리합니다.</li>
                    </ul>

                    <h2>2. 무료 타이핑 <small>오늘부터</small></h2>
                    <ul>
                        <li>우리 학교 시험지 사진이나 스캔 PDF를 보내 주세요.</li>
                        <li>채택되면 수식·그림까지 타이핑한 <b>한글 파일</b>과 <b>{REPORT_REWARD_LABEL}</b>를 드립니다. 포인트로 이용권도 결제할 수 있습니다.</li>
                        <li>이미 있는 시험이나 먼저 신청된 시험은 받지 않습니다. 먼저 보내 주신 분께 기회가 갑니다.</li>
                    </ul>

                    <h2>3. 무료 문제 PDF</h2>
                    <ul>
                        <li>해설 없는 문제 PDF는 회원 누구나 <b>하루 {FREE_PDF_DAILY_LIMIT}개까지</b> 무료입니다.</li>
                    </ul>

                    <p>궁금하신 점은 <Link href="/suggestion">건의사항</Link>에 남겨 주세요. 감사합니다.</p>
                </div>

                <div className="rd-bd-foot">
                    <Link href="/notice" className="rd-btn rd-btn-gray">목록으로</Link>
                </div>
            </article>
        </div>
    );
}
