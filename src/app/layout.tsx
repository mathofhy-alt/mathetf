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
    title: "수학ETF - 내신 기출문제 공유 플랫폼",
    description: "수학 내신 기출문제를 즉시 다운로드. 한글(HWP), PDF 형식으로 제공. 고등학교 수학 내신 대비 기출문제 공유 플랫폼.",
    keywords: ["수학 내신 기출문제", "수학 중간고사", "수학 기말고사", "고등학교 수학 기출", "수학 내신 대비", "수학 기출문제", "내신 기출 공유", "수학ETF"],
    authors: [{ name: "수학ETF" }],
    metadataBase: new URL("https://mathetf.com"),
    alternates: {
        canonical: "/",
    },
    openGraph: {
        title: "수학ETF - 내신 기출문제 공유 플랫폼",
        description: "수학 내신 기출문제를 즉시 다운로드. 한글(HWP), PDF 형식 제공. 고등학교 수학 내신 기출 공유 플랫폼.",
        url: "https://mathetf.com",
        siteName: "수학ETF",
        locale: "ko_KR",
        type: "website",
    },
    twitter: {
        card: "summary",
        title: "수학ETF - 내신 기출문제 공유 플랫폼",
        description: "수학 내신 기출문제를 즉시 다운로드. 고등학교 수학 내신 대비 기출문제 공유.",
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

                {/* Google tag (gtag.js) - GA4 + Google Ads */}
                <Script src="https://www.googletagmanager.com/gtag/js?id=G-FC6EZWV58Q" strategy="afterInteractive" />
                <Script id="google-analytics" strategy="afterInteractive">
                    {`
                        window.dataLayer = window.dataLayer || [];
                        function gtag(){dataLayer.push(arguments);}
                        gtag('js', new Date());
                        gtag('config', 'G-FC6EZWV58Q');
                        gtag('config', 'AW-17263917467');
                    `}
                </Script>
            </body>
        </html>
    );
}
