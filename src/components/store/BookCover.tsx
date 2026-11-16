import type { StoreBook } from '@/lib/store/types';
import Image from 'next/image';

export default function BookCover({ book }: { book: StoreBook }) {
    return <div className={`store-cover${book.cover_path ? ' has-image' : ''}`} style={{ color: book.cover_text_color }}>
        {book.cover_path ? <Image src={book.cover_path} alt={`${book.title} 표지`} fill unoptimized sizes="(max-width: 600px) 45vw, (max-width: 1100px) 30vw, 280px" /> : <>
            <span className="store-cover-series">{book.series || '수학ETF'}</span>
            <strong>{book.title}</strong>
            {book.subtitle && <span className="store-cover-subtitle">{book.subtitle}</span>}
            <span className="store-cover-publisher">수학ETF · 변형 문제집</span>
        </>}
        <span className="store-spine" aria-hidden="true" />
    </div>;
}
