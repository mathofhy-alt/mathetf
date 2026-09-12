import Header from '@/components/Header';
import { createClient } from '@/utils/supabase/server';
import PrintTransformClient from './PrintTransformClient';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSiteStats } from '@/lib/stats';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: '학교프린트 변형만들기 - 수학 변형문제 자동 생성 | 수학ETF',
    description: '학교에서 받은 수학 프린트를 올리고 문제를 잘라내면, 같은 유형의 변형문제를 자동으로 찾아 한글파일로 만들어 드립니다.',
    keywords: [
        '학교프린트 변형', '수학 변형문제', '수학 변형문제 만들기', '변형문제 사이트',
        '수학 프린트 변형', '내신 변형문제', '수학 유사문제', '변형문제 한글파일',
    ],
    alternates: { canonical: '/print-transform' },
    openGraph: {
        title: '학교프린트 변형만들기 - 수학 변형문제 자동 생성 | 수학ETF',
        description: '학교 프린트를 올리고 문제를 잘라내면 같은 유형의 변형문제를 자동으로 찾아 한글파일로 만들어 드립니다.',
        url: 'https://mathetf.com/print-transform',
        images: ['/og-image.png'],
    },
};

export default async function PrintTransformPage() {
    let isLoggedIn = false;
    try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        isLoggedIn = !!user;
    } catch { }
    // [2026-09-12] 비로그인 화면이 '회원가입 후 이용할 수 있어요' 한 줄뿐이라
    //   서버가 보내는 본문이 874자였다(/teacher 2,029 · /predict 1,061).
    //   크롤러와 처음 온 사람이 이 기능이 뭔지 알 수 없다. /teacher 와 같은 방식으로 채운다.
    const { questionCount, schoolCount } = await getSiteStats();

    return (
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans">
            <Header />
            {/* SEO: 비로그인 화면이 게이트 한 줄뿐이라 크롤러·스크린리더용 정식 H1/설명 제공 */}
            <section className="sr-only">
                <h1>학교프린트 변형만들기 — 수학 프린트 변형문제 자동 생성</h1>
                <p>
                    학교에서 받은 수학 프린트(PDF)를 올리고 원하는 문제를 드래그로 잘라내면,
                    AI가 문제의 단원과 유형을 인식해 전국 기출에서 같은 유형의 변형문제를 자동으로 찾아 드립니다.
                    마음에 드는 변형문제를 골라 담으면 문제와 해설이 담긴 한글(HWP) 파일로 즉시 다운로드할 수 있어요.
                    내신 대비로 학교 프린트를 한 번 더 연습하고 싶을 때, 같은 유형의 새 문제로 실전 감각을 키워 보세요.
                </p>
            </section>
            <PrintTransformClient isLoggedIn={isLoggedIn} />
            {!isLoggedIn && (
                <section className="max-w-3xl mx-auto px-4 pb-10 -mt-4">
                    <h2 className="text-xl sm:text-2xl font-black break-keep text-[#1E2D4F]">
                        학교 프린트를 올리면 같은 유형 문제를 찾아 드려요
                    </h2>
                    {(questionCount > 0 || schoolCount > 0) && (
                        <div className="flex gap-3 mt-4">
                            {questionCount > 0 && (
                                <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm">
                                    <p className="text-2xl font-black text-[#2E9E5B]">{questionCount.toLocaleString()}</p>
                                    <p className="text-[11px] font-bold text-slate-500 mt-0.5">찾아볼 수 있는 기출 문항</p>
                                </div>
                            )}
                            {schoolCount > 0 && (
                                <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-sm">
                                    <p className="text-2xl font-black text-[#497AB7]">{schoolCount.toLocaleString()}</p>
                                    <p className="text-[11px] font-bold text-slate-500 mt-0.5">기출 보유 학교</p>
                                </div>
                            )}
                        </div>
                    )}
                    <ol className="mt-6 space-y-3">
                        <li className="bg-white border border-slate-200 rounded-xl p-4">
                            <p className="font-bold text-[#1E2D4F]">1. 프린트를 올립니다</p>
                            <p className="text-sm text-slate-600 mt-1 break-keep">
                                학교에서 받은 수학 프린트나 시험지를 PDF 로 올립니다. 사진을 찍어 PDF 로 만든 것도 됩니다.
                            </p>
                        </li>
                        <li className="bg-white border border-slate-200 rounded-xl p-4">
                            <p className="font-bold text-[#1E2D4F]">2. 원하는 문제를 잘라냅니다</p>
                            <p className="text-sm text-slate-600 mt-1 break-keep">
                                변형문제를 만들고 싶은 문제를 드래그로 감싸면 됩니다. 한 장에서 여러 문제를 골라도 됩니다.
                            </p>
                        </li>
                        <li className="bg-white border border-slate-200 rounded-xl p-4">
                            <p className="font-bold text-[#1E2D4F]">3. 같은 유형 기출을 받습니다</p>
                            <p className="text-sm text-slate-600 mt-1 break-keep">
                                잘라낸 문제의 단원과 유형을 읽어, 전국 학교 기출에서 같은 유형의 문제를 찾아 보여 줍니다.
                                마음에 드는 것을 골라 담으면 문제와 해설이 함께 담긴 한글(HWP) 파일로 받을 수 있습니다.
                            </p>
                        </li>
                    </ol>
                    <p className="text-sm text-slate-600 mt-5 break-keep">
                        학교 프린트는 시험에 그대로 나오지 않습니다. 같은 유형을 한 번 더 풀어 봐야 실전에서 막히지 않습니다.
                        이 기능은 그 한 번을 자동으로 만들어 줍니다. 선생님이라면 숙제나 보충 자료를 만들 때,
                        학생이라면 프린트를 한 번 더 연습할 때 쓰시면 됩니다.
                    </p>
                    <p className="text-sm text-slate-600 mt-3 break-keep">
                        문제를 직접 골라 시험지를 만들고 싶다면{' '}
                        <Link href="/question-bank" className="text-[#497AB7] font-bold hover:underline">시험지 출제</Link>,
                        학교와 시험범위만 정하고 싶다면{' '}
                        <Link href="/predict" className="text-[#497AB7] font-bold hover:underline">예상문제 뽑기</Link>를 써 보세요.
                    </p>
                </section>
            )}

        </div>
    );
}
