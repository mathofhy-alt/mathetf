import Link from 'next/link';
import { notFound } from 'next/navigation';
import BookList from '@/components/store/BookList';
import { storeBooks, storeViewer, purchasedBookIds, withStoreImages } from '@/lib/store/server';

export default async function StorePage() {
    const viewer = await storeViewer();
    if (!viewer.allowed) notFound();
    const [books, purchased] = await Promise.all([storeBooks(viewer.admin), purchasedBookIds(viewer.user?.id)]);
    return <div className="store-wrap">
        <div className="store-heading"><div><p className="store-eyebrow">수학ETF의 변형 문제집</p><h1>서점</h1></div>{viewer.admin && <Link className="store-button secondary" href="/admin/store">책 관리</Link>}</div>
        <p className="store-lead">학교가 실제로 비트는 방식 그대로 만든 수학ETF의 변형 문제집입니다.<br />결제하면 바로 PDF로 받을 수 있고, 포인트로도 결제할 수 있습니다.</p>
        <BookList books={books.map(b => withStoreImages({ ...b, sample_paths: [] }))} purchased={purchased} loggedIn={!!viewer.user} />
    </div>;
}
