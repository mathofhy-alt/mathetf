'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { StoreBook } from '@/lib/store/types';
import BookCover from './BookCover';

export default function BookList({ books, purchased, loggedIn }: { books: StoreBook[]; purchased: string[]; loggedIn: boolean }) {
    const [series, setSeries] = useState('');
    const [grade, setGrade] = useState('');
    const [subject, setSubject] = useState('');
    const [hideBought, setHideBought] = useState(false);
    const values = (key: 'series' | 'grade' | 'subject') => [...new Set(books.map(b => b[key]).filter((v): v is string => !!v))];
    const visible = books.filter(b => (!series || b.series === series) && (!grade || b.grade === grade)
        && (!subject || b.subject === subject) && (!hideBought || !purchased.includes(b.id)));
    const chips = (label: string, options: string[], selected: string, select: (v: string) => void) => <div className="store-filter" role="group" aria-label={label}>
        <span>{label}</span>{['', ...options].map(v => <button key={v} type="button" aria-pressed={selected === v} onClick={() => select(v)}>{v || '전체'}</button>)}
    </div>;
    return <>
        {books.length > 0 && <>
            <div className="store-tabs">{chips('시리즈', values('series'), series, setSeries)}</div>
            <div className="store-filters">
                {chips('학년', values('grade'), grade, setGrade)}
                {chips('과목', values('subject'), subject, setSubject)}
                {loggedIn && <label className="store-hide"><input type="checkbox" checked={hideBought} onChange={e => setHideBought(e.target.checked)} />구매한 책 숨기기</label>}
            </div>
            <p className="store-result" role="status">{visible.length}권</p>
        </>}
        {!visible.length ? <div className="store-empty">
            <span aria-hidden="true">▤</span><h2>{books.length ? '조건에 맞는 책이 없습니다' : '책을 준비하고 있어요'}</h2>
            <p>{books.length ? '필터나 구매한 책 숨기기 설정을 바꿔 보세요.' : '수학ETF의 변형 문제집을 준비하고 있어요. 준비가 끝나면 이곳에서 만나 보실 수 있어요.'}</p>
            {books.length > 0 && <button className="store-button secondary" onClick={() => { setSeries(''); setGrade(''); setSubject(''); setHideBought(false); }}>필터 초기화</button>}
        </div> : <div className="store-grid">{visible.map(book => <article className="store-card" key={book.id}>
            <Link href={`/store/${book.slug}`} className="store-book-link" aria-label={`${book.title} 소개 보기`}><BookCover book={book} /></Link>
            <div className="store-card-meta">{book.series || '변형 문제집'}{!book.published && ' · 비공개'}</div>
            <h2><Link href={`/store/${book.slug}`}>{book.title}</Link></h2>
            {book.subtitle && <p>{book.subtitle}</p>}
            <div className="store-card-bottom"><strong>{book.price === null ? '가격 준비 중' : `${book.price.toLocaleString()}원`}</strong>{purchased.includes(book.id) && <span className="store-chip">구매한 책</span>}</div>
        </article>)}</div>}
    </>;
}
