import type { Metadata } from "next";
import "./globals.css";


import Footer from "@/components/Footer";

export const metadata: Metadata = {
    title: "수학ETF - 기출문제 공유 플랫폼",
    description: "서울 지역 중고등학교 기출문제 공유 플랫폼",
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
            </head>
            <body className={`font-sans bg-background text-foreground antialiased selection:bg-brand-500/30 selection:text-brand-900 flex flex-col min-h-screen`}>
                <main className="flex-1 w-full flex flex-col">
                    {children}
                </main>
                <Footer />
                <script src="https://cdn.portone.io/v2/browser-sdk.js"></script>
            </body>
        </html>
    );
}
