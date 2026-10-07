"use client";

/** 헤더가 듣는 창 열기 신호를 보내는 단추(홈 설명 칸용, 10/7) — 'open-original-report' · 'open-db-request' */
export default function OpenEventButton({ event, className, children }: { event: string; className?: string; children: React.ReactNode }) {
    return <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(event))}>{children}</button>;
}
