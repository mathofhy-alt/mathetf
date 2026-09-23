import CampaignCapture from '@/components/CampaignCapture';
import ModalFocus from '@/components/ModalFocus';
import type { Metadata } from "next";
import "./globals.css";
import "./product.css";
import "./cloud.css";
import "./atelier.css";
import "./suite.css";
import SiteSurface from "@/components/SiteSurface";
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
import PersonaSync from "@/components/PersonaSync";
import { Analytics } from '@vercel/analytics/react';
import Script from "next/script";

export const metadata: Metadata = {
    title: "수학ETF - 기출 유사문제로 만드는 수학 시험지 | 내신·모의고사 문제은행",
    description: "기출문제와 같은 유형의 유사 문항을 자동으로 찾아 나만의 수학 시험지를 직접 완성하세요. 전국 고등학교 내신·전국연합 모의고사 기출 기반 문제은행. 시험지는 한글 호환 HML로 저장하고, 원본 자료는 제공 형식에 따라 다운로드합니다.",
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
    // canonical은 페이지별로 지정 (여기에 "/"를 두면 모든 하위 페이지가 홈으로 canonical 상속됨 → 제거)
    openGraph: {
        title: "수학ETF - 기출 유사문제로 만드는 수학 시험지",
        description: "기출과 같은 유형의 유사 문항을 자동으로 찾아 나만의 수학 시험지를 직접. 전국 내신·모의고사 기출 기반 문제은행.",
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
    // 카드 타입만 전역 지정. title/description/image는 각 페이지의 openGraph를 따라가게 둠
    // (여기에 홈 값을 박으면 모든 페이지의 트위터 카드가 홈으로 고정됨)
    twitter: {
        card: "summary_large_image",
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
                {process.env.NEXT_PUBLIC_LOCAL_PREVIEW === '1' && <div className="review-environment">{process.env.NEXT_PUBLIC_REVIEW_ORIGINALS === '1' ? '검토 전용 · 실제 문항 읽기 전용 연결 · 로그인·저장은 테스트 환경' : '검토 전용 · 하나고 2025 실제 문항 · 로그인·저장은 테스트 환경'}</div>}
                <CartProvider>
                    <SiteSurface>{children}</SiteSurface>
                    <Footer />
                    <FloatingCart />
                    <PersonaSync /><ModalFocus /><CampaignCapture/>
                </CartProvider>
                
                {/* PortOne SDK - Lazy load */}
                {process.env.NEXT_PUBLIC_LOCAL_PREVIEW !== '1' && <Script src="https://cdn.portone.io/v2/browser-sdk.js" strategy="lazyOnload" />}
                
                <Analytics />

                {process.env.VERCEL_ENV === 'production' && (
                    <script dangerouslySetInnerHTML={{__html: `
                        if (['mathetf.com','www.mathetf.com'].includes(location.hostname)) {
                            window.dataLayer = window.dataLayer || [];
                            function gtag(){dataLayer.push(arguments);}
                            window.gtag=gtag;
                            gtag('js',new Date());
                            gtag('config',${JSON.stringify(/^G-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '') ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID : 'G-WT6Y809441')},{site:'mathetf'});
                            gtag('config','AW-17263917467');
                            var tag=document.createElement('script');tag.async=true;
                            tag.src='https://www.googletagmanager.com/gtag/js?id='+${JSON.stringify(/^G-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '') ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID : 'G-WT6Y809441')};
                            document.head.appendChild(tag);
                        }
                    `}} />
                )}
            </body>
        </html>
    );
}
