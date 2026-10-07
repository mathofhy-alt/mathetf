import Link from 'next/link';
import Header from '@/components/Header';

// [2026-09-14 전수조사] 없는 주소로 오면 Next 기본 화면("404: This page could not be found.", 검은 배경, 영문)이 떴다.
//   외부 리뷰어 둘 다 지적. 사이트 헤더를 유지하고 한국어로, 갈 곳을 준다.
// [10/7] 새 디자인(.rd) — 주 버튼 하나(홈), 나머지는 회색.
export const metadata = { title: '페이지를 찾을 수 없어요 | 수학ETF', robots: { index: false, follow: true } };

export default function NotFound() {
    return (
        <div className="rd rd-x">
            <Header />
            <section className="rd-wrap rd-nf">
                <p className="rd-nf-code" aria-hidden="true">404</p>
                <h1 className="rd-x-h1 rd-nf-title">페이지를 찾을 수 없어요</h1>
                <p className="rd-lead">주소가 바뀌었거나, 자료가 정리되면서 옮겨졌을 수 있어요.</p>
                <div className="rd-nf-actions">
                    <Link href="/" className="rd-btn rd-btn-primary">홈으로</Link>
                    <Link href="/schools" className="rd-btn rd-btn-gray">학교별 기출 찾기</Link>
                    <Link href="/question-bank" className="rd-btn rd-btn-gray">시험지 만들기</Link>
                </div>
            </section>
        </div>
    );
}
