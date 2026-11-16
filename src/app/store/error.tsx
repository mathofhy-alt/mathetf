'use client';
export default function StoreError({ reset }: { reset: () => void }) {
    return <div className="store-wrap store-empty"><h1>서점 정보를 불러오지 못했어요</h1><p>잠시 후 다시 시도해 주세요.</p><button className="store-button" onClick={reset}>다시 불러오기</button></div>;
}
