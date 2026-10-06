import Header from '@/components/Header';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export const metadata = {
    title: '출제 동향 집계·분류 기준 | 수학ETF',
    description: '수학ETF 출제 동향 보고서의 자료 범위, 문항 연결 방법, 단원·난이도 분류와 해석상 한계.',
    alternates: { canonical: '/insights/methodology' },
};

export default function MethodologyPage() {
    return <div className="rd rd-x"><Header />
        <main className="rd-ct-main">
            <article className="rd-wrap rd-x-top rd-ct-article">
                <Link href="/insights" className="rd-x-back"><ChevronLeft size={18} aria-hidden="true" />출제 동향 전체</Link>
                <h1 className="rd-x-h1 rd-ct-h1">출제 동향 집계·분류 기준</h1>
                <div className="rd-ct-prose">
                    <p className="rd-ct-first">보고서는 2026년 9월 24일 운영 DB를 읽기 전용으로 집계한 결과입니다. 공개 시험지 미리보기가 있는 2025년 PDF 해설 자료 중 문항 DB와 연결되는 회차를 사용했습니다.</p>
                    <h2>표본을 고른 방법</h2>
                    <p>학교·연도·학기·시험 종류·과목으로 시험지와 문항을 연결했습니다. 삭제 자료, 미리보기가 없는 자료, 연결 문항이 없는 자료는 제외했습니다. 학교별로 집계 대상 회차 한 건씩만 셌습니다. 이 표본이 전국 모든 학교 시험을 대표하지는 않습니다.</p>
                    <h2>단원과 난이도</h2>
                    <p>문항 DB의 단원 분류를 그대로 합산했습니다. 난이도 값은 1~2를 쉬움, 3~4를 보통, 5 이상을 어려움으로 묶었습니다. 이는 서비스 내부의 자동 분류 기준이며 실제 시험 점수 분포나 공식 평가 기준이 아닙니다. 문항별 분류에 오류가 있으면 보고서에도 반영될 수 있습니다.</p>
                    <h2>변경과 검수</h2>
                    <p>현재 보고서는 기준일 스냅샷입니다. 이후 문항 등록·재분류가 일어나도 자동으로 숫자가 바뀌지 않습니다. 재집계할 때 표본 수와 기준일을 함께 갱신합니다. 이 보고서에 교사 검수 완료 표시는 하지 않았습니다.</p>
                    <p className="rd-ct-aside">원본 문항, 정답, 해설은 보고서에 포함하지 않습니다. 개별 시험지는 각 자료 페이지의 공개 미리보기에서 확인할 수 있습니다.</p>
                </div>
            </article>
        </main>
    </div>;
}
