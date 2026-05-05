import type { Metadata } from "next";
import "./globals.css";

import { CartProvider } from "@/components/providers/CartProvider";
import Footer from "@/components/Footer";
import FloatingCart from "@/components/FloatingCart";
import { Analytics } from '@vercel/analytics/react';

export const metadata: Metadata = {
    title: "수학ETF - 내신 기출문제 공유 플랫폼",
    description: "대치동 퀄리티의 중고등학교 내신 기출문제를 즉시 다운로드. 한글(HWP), PDF 형식으로 제공. 수학, 영어, 국어 전과목 내신 대비 자료.",
    keywords: ["내신 기출문제", "중간고사", "기말고사", "고등학교 기출", "중학교 기출", "수학 기출", "내신 대비", "기출문제 공유", "수학ETF"],
    authors: [{ name: "수학ETF" }],
    metadataBase: new URL("https://mathetf.com"),
    alternates: {
        canonical: "/",
    },
    openGraph: {
        title: "수학ETF - 내신 기출문제 공유 플랫폼",
        description: "대치동 퀄리티의 중고등학교 내신 기출문제를 즉시 다운로드. 한글(HWP), PDF 형식 제공.",
        url: "https://mathetf.com",
        siteName: "수학ETF",
        locale: "ko_KR",
        type: "website",
    },
    twitter: {
        card: "summary",
        title: "수학ETF - 내신 기출문제 공유 플랫폼",
        description: "대치동 퀄리티의 중고등학교 내신 기출문제를 즉시 다운로드.",
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
                <link rel="stylesheet" as="style" crossOrigin="anonymous" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
                {/* Google tag (gtag.js) - GA4 + Google Ads */}
                <script async src="https://www.googletagmanager.com/gtag/js?id=G-FC6EZWV58Q"></script>
                <script dangerouslySetInnerHTML={{
                    __html: `
                        window.dataLayer = window.dataLayer || [];
                        function gtag(){dataLayer.push(arguments);}
                        gtag('js', new Date());
                        gtag('config', 'G-FC6EZWV58Q');
                        gtag('config', 'AW-17263917467');
                    `
                }} />
            </head>
            <body className={`font-sans bg-background text-foreground antialiased selection:bg-brand-500/30 selection:text-brand-900 flex flex-col min-h-screen`}>
                <CartProvider>
                    <main className="flex-1 w-full flex flex-col">
                        {children}
                    </main>
                    <Footer />
                    <FloatingCart />
                </CartProvider>
                <script src="https://cdn.portone.io/v2/browser-sdk.js"></script>
                <Analytics />
            </body>
        </html>
    );
}
