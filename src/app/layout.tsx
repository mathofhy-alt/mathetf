import type { Metadata } from "next";
import "./globals.css";
import { Noto_Sans_KR } from 'next/font/google';

const notoSansKr = Noto_Sans_KR({
    subsets: ['latin'], // Next.js API automatically handles Korean subsetting
    weight: ['400', '500', '700', '900'],
    variable: '--font-noto',
    display: 'swap',
});

import { CartProvider } from "@/components/providers/CartProvider";
import Footer from "@/components/Footer";
import FloatingCart from "@/components/FloatingCart";
import { Analytics } from '@vercel/analytics/react';
import Script from "next/script";

export const metadata: Metadata = {
    title: "수학ETF - 기출 유사문제로 만드는 수학 시험지 | 내신·모의고사 문제은행",
    description: "기출문제와 같은 유형의 유사 문항을 자동으로 찾아 나만의 수학 시험지를 1분 만에 완성하세요. 전국 고등학교 내신·전국연합 모의고사 기출 기반 문제은행. 한글(HWP)·PDF 다운로드.",
    keywords: [
        "수학 시험지 만들기", "수학 시험지 제작", "기출 유사문제", "수학 유사문제",
        "수학 문제은행", "고등학교 수학 문제은행", "수학 기출문제",
        "수학 내신 기출문제", "수학 중간고사", "수학 기말고사",
        "전국연합학력평가 수학", "수학 모의고사", "고1 모의고사 수학", "고2 모의고사 수학", "고3 모의고사 수학",
        "경찰대 수학", "사관학교 수학",
        "수학ETF", "수학 내신 대비", "고등학교 수학 기출"
    ],
    authors: [{ name: "수학ETF" }],
    metadataBase: new URL("https://mathetf.com"),
    alternates: {
        canonical: "/",
    },
    openGraph: {
        title: "수학ETF - 기출 유사문제로 만드는 수학 시험지",
        description: "기출과 같은 유형의 유사 문항을 자동으로 찾아 나만의 수학 시험지를 1분 만에. 전국 내신·모의고사 기출 기반 문제은행.",
        url: "https://mathetf.com",
        siteName: "수학ETF",
        locale: "ko_KR",
        type: "website",
        images: [
            {
                url: "/og-image.png",
                width: 1200,
                height: 630,
                alt: "수학ETF - 기출 유사문제로 만드는 수학 시험지",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "수학ETF - 기출 유사문제로 만드는 수학 시험지",
        description: "기출과 같은 유형의 유사 문항을 자동으로 찾아 나만의 수학 시험지를 1분 만에. 전국 내신·모의고사 기출 기반 문제은행.",
        images: ["/og-image.png"],
    },
    robots: {
        index: true,
        follow: true,
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko">
            <head>
            </head>
            <body className={`${notoSansKr.variable} font-sans bg-background text-foreground antialiased selection:bg-brand-500/30 selection:text-brand-900 flex flex-col min-h-screen`}>
                <CartProvider>
                    <main className="flex-1 w-full flex flex-col">
                        {children}
                    </main>
                    <Footer />
                    <FloatingCart />
                </CartProvider>
                
                {/* PortOne SDK - Lazy load */}
                <Script src="https://cdn.portone.io/v2/browser-sdk.js" strategy="lazyOnload" />
                
                <Analytics />

                {/* Google tag (gtag.js) - GA4 + Google Ads.
                    프로덕션 배포에서만 렌더(로컬·Vercel 프리뷰 오염 방지) → 클라이언트 hostname 가드 불필요.
                    next/script 인라인이 App Router에서 실행 안 되던 문제 → 평범한 <script>(SSR 실행 보장)로 변경. */}
                {process.env.VERCEL_ENV === 'production' && (
                    <>
                        <script async src="https://www.googletagmanager.com/gtag/js?id=G-FC6EZWV58Q" />
                        <script
                            dangerouslySetInnerHTML={{
                                __html: `
                                    window.dataLayer = window.dataLayer || [];
                                    function gtag(){dataLayer.push(arguments);}
                                    gtag('js', new Date());
                                    gtag('config', 'G-FC6EZWV58Q');
                                    gtag('config', 'AW-17263917467');
                                `,
                            }}
                        />
                    </>
                )}
            </body>
        </html>
    );
}
