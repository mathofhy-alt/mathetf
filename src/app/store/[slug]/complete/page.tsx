import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { storeBookBySlug, storeViewer, purchasedBookIds, withStoreImages } from '@/lib/store/server';
import BookCover from '@/components/store/BookCover';

export const metadata = { title: '구매한 책 | 수학ETF', robots: { index: false, follow: false } };
export default async function BookComplete({ params }: { params: { slug: string } }) {
    const viewer = await storeViewer();
    if (!viewer.allowed) notFound();
    if (!viewer.user) redirect(`/login?next=${encodeURIComponent(`/store/${params.slug}/complete`)}`);
    const paid = await purchasedBookIds(viewer.user.id);
    const raw = await storeBookBySlug(params.slug, viewer.admin, paid);
    if (!raw) notFound();
    if (!paid.includes(raw.id)) redirect(`/store/${params.slug}`);
    const book = withStoreImages({ ...raw, sample_paths: [] });
    if (book.pdf) return <div className="store-wrap"><p role="status" className="store-success">구매가 완료되었습니다.</p><h1>PDF를 받아 보세요</h1>
        <div className="store-bought"><BookCover book={book} /><div><p className="store-eyebrow">{book.series}</p><h2>{book.title}</h2><p>마이페이지 구매 내역에서도 언제든 다시 받을 수 있습니다.</p><div className="store-actions"><a className="store-button" href={`/api/store/download?book=${book.id}`}>PDF 받기</a><Link className="store-button secondary" href="/mypage">구매 내역</Link></div></div></div><Link className="store-text-link" href="/store">서점으로 돌아가기</Link>
    </div>;
    return <div className="store-wrap"><p role="status" className="store-success">구매가 완료되었습니다. 책이 내 개인DB에 들어왔습니다.</p><h1>이제 시험지를 만들어 보세요</h1>
        <div className="store-bought"><BookCover book={book} /><div><p className="store-eyebrow">{book.series}</p><h2>{book.title}</h2><p>시험지 만들기에서 개인DB를 열고 이 책의 범위를 선택해 주세요.</p><div className="store-actions"><Link className="store-button" href="/question-bank">시험지 만들기에서 쓰기</Link><Link className="store-button secondary" href="/mypage">내 개인DB / 구매 내역</Link></div></div></div><Link className="store-text-link" href="/store">서점으로 돌아가기</Link>
    </div>;
}
