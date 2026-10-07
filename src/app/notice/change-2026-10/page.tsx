import Link from 'next/link';
import { ArrowLeft, Clock } from 'lucide-react';
import Header from '@/components/Header';
import { QB_PASS, QB_LIMITS } from '@/lib/qbPassConfig';
import { REPORT_REWARD_LABEL } from '@/lib/report-reward';
import { FREE_PDF_DAILY_LIMIT } from '@/lib/config';

/**
 * 고정 공지 (2026-10-08) — 유료화(10/13 0시)·무료 타이핑·무료 PDF 안내.
 * 공지사항 표(notices)는 운영 DB 라 개발 서버에서 미리 볼 수 없어 코드로 둔다. 목록 맨 위 고정(CommunityBoard), 홈 안내 띠가 여기로 연결.
 */
export const metadata = { title: '10월 13일(월)부터 시험지 만들기 이용 방식이 바뀝니다 | 수학ETF 공지', robots: { index: false, follow: true } };

export default function ChangeNotice() {
    return (
        <div className="rd rd-x rd-bd">
            <Header />
            <article className="rd-wrap rd-x-top rd-bd-read">
                <Link href="/notice" className="rd-x-back"><ArrowLeft size={18} /> 공지사항</Link>
                <span className="rd-bd-tag is-accent">공지</span>
                <h1 className="rd-bd-title">10월 13일(월)부터 시험지 만들기 이용 방식이 바뀝니다</h1>
                <p className="rd-bd-meta"><span><Clock size={15} aria-hidden />2026. 10. 8.</span></p>

                <div className="rd-bd-body rd-nt">
                    <p>안녕하세요, 수학ETF입니다.</p>
                    <p>그동안 시험지 만들기를 무료로 써 주셔서 감사합니다. 더 많은 학교의 기출을 꾸준히 올리기 위해 10월 13일부터 이용 방식을 바꾸게 되었습니다. 갑작스러운 변경으로 불편을 드려 죄송합니다.</p>

                    <h2>1. 시험지 만들기 <small>10월 13일 월요일 0시부터</small></h2>
                    <ul>
                        <li>문항 고르기·검색·미리보기는 계속 무료입니다.</li>
                        <li>시험지 저장은 <b>한 주에 {QB_PASS.freePerWeek}번까지 무료</b>이고, 매주 월요일 0시에 다시 채워집니다.</li>
                        <li><b>시험지 만들기 이용권:</b> 1개월 {QB_PASS.salePrice.toLocaleString()}원 (3·6·12개월 선택)
                            <ul>
                                <li>횟수 제한 없음 · 한 시험지 최대 {QB_LIMITS.pass.questions}문항 · 보관함 {QB_LIMITS.pass.saved}개</li>
                                <li>보유 포인트로도 결제할 수 있습니다</li>
                            </ul>
                        </li>
                        <li>이미 만들어 두신 시험지는 그대로 받으실 수 있습니다.</li>
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
