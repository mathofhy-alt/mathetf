'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { StoreExample } from '@/lib/store/types';

/** [11/17 대표] 원본 하나 ↔ 그 원본을 비튼 변형 하나를 나란히. 방식(C·A·M) 탭으로 바꿔 본다. */
export default function BookExamples({ examples }: { examples: StoreExample[] }) {
    const [i, setI] = useState(0);
    if (!examples.length) return null;
    const ex = examples[Math.min(i, examples.length - 1)];
    return <div className="store-examples">
        {examples.length > 1 && <div className="store-example-tabs" role="tablist" aria-label="변형 방식">
            {examples.map((e, k) => <button key={e.key} type="button" role="tab" aria-selected={k === i} onClick={() => setI(k)}><b>{e.key}</b>{e.name}</button>)}
        </div>}
        {ex.desc && <p className="store-example-desc">{ex.desc}</p>}
        <div className="store-example-pair">
            <figure><figcaption><span>원본</span>{ex.original_label}</figcaption><Image src={ex.original} alt={`원본 ${ex.original_label}`} width={820} height={600} unoptimized /></figure>
            <span className="store-example-arrow" aria-hidden="true">→</span>
            <figure className="is-variant"><figcaption><span>{ex.key} · {ex.name}</span>{ex.variant_label}</figcaption><Image src={ex.variant} alt={`변형 ${ex.variant_label}`} width={820} height={600} unoptimized /></figure>
        </div>
    </div>;
}
