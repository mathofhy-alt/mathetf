import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import BookCover from '@/components/store/BookCover';
import BookCheckout from '@/components/store/BookCheckout';
import { storeBookBySlug, storeViewer, purchasedBookIds, withStoreImages } from '@/lib/store/server';
import { createClient } from '@/utils/supabase/server';

export default async function BookPage({ params }: { params: { slug: string } }) {
    const viewer = await storeViewer();
    if (!viewer.allowed) notFound();
    const paid = await purchasedBookIds(viewer.user?.id);
    const raw = await storeBookBySlug(params.slug, viewer.admin, paid);
    if (!raw) notFound();
    // No automatic question previews; even uploaded samples are omitted for guests.
    const book = withStoreImages({ ...raw, sample_paths: viewer.user ? raw.sample_paths : [] });
    const { data: profile } = viewer.user ? await createClient().from('profiles').select('earned_points').eq('id', viewer.user.id).maybeSingle() : { data: null };
    return <>
        <div className="store-wrap store-breadcrumb"><Link href="/store">서점</Link><span>/</span><span>{book.title}</span></div>
        <section className="store-detail-hero"><div className="store-wrap store-detail-grid">
            <BookCover book={book} />
            <div className="store-detail-heading"><p className="store-eyebrow">{book.series || '수학ETF 변형 문제집'}</p><h1>{book.title}</h1>{book.subtitle && <p className="store-subtitle">{book.subtitle}</p>}
                <div className="store-chips">{Object.entries(book.contents).map(([key, value]) => <span className="store-chip" key={key}>{key} {value}</span>)}</div>
                <p className="store-preline">{book.description || '책 소개를 준비하고 있습니다.'}</p>
                <dl className="store-target"><dt>대상 학년</dt><dd>{book.grade || '등록 준비 중'}</dd><dt>과목</dt><dd>{book.subject || '등록 준비 중'}</dd></dl>
            </div>
            <BookCheckout book={book} bought={paid.includes(book.id)} userId={viewer.user?.id} points={profile?.earned_points ?? 0} />
        </div></section>
        <div className="store-reading">
            <section><p className="store-eyebrow">책의 구성</p><h2>이렇게 구성되어 있어요</h2><p className="store-preline">{book.contents_description || '자세한 구성 안내를 준비하고 있습니다.'}</p></section>
            {book.sample_paths.length > 0 && <section><h2>책 미리보기</h2><div className="store-samples">{book.sample_paths.map((url, i) => <Image key={url} src={url} alt={`${book.title} 관리자가 등록한 미리보기 ${i + 1}`} width={1200} height={1600} unoptimized />)}</div></section>}
            {book.pdf ? <section><p className="store-eyebrow">구입 후 이용 방법</p><h2>결제하면 바로 PDF로</h2><ol className="store-steps"><li><b>01</b><h3>결제</h3><p>카드 또는 보유 포인트로 결제합니다. 포인트로 전액 결제할 수 있습니다.</p></li><li><b>02</b><h3>PDF 받기</h3><p>결제가 끝나면 이 페이지와 마이페이지 구매 내역에서 PDF를 받습니다.</p></li><li><b>03</b><h3>인쇄해서 풀기</h3><p>원본을 먼저 풀고 DAY 1부터 하루 한 묶음씩 풀어 보세요.</p></li></ol></section> :
            <section><p className="store-eyebrow">구입 후 이용 방법</p><h2>책에서 나만의 시험지까지</h2><ol className="store-steps"><li><b>01</b><h3>내 개인DB에 추가</h3><p>결제가 완료되면 구매한 회원의 출제 자료 목록에 책이 나타납니다.</p></li><li><b>02</b><h3>필요한 범위 선택</h3><p>시험지 만들기에서 개인DB를 열고 책과 단원을 선택합니다.</p></li><li><b>03</b><h3>시험지 만들기</h3><p>구매한 책의 문항을 골라 시험지를 구성합니다.</p></li></ol></section>}
            <section className="store-notes"><h2>이용 안내</h2>{book.pdf ? <><p>실물 배송 없이 PDF 파일로 제공되는 디지털 문제집입니다. 구매한 책은 마이페이지 구매 내역에서 기간 제한 없이 다시 받을 수 있습니다.</p><p>구매한 회원 본인의 학습용으로만 이용해 주세요. 파일의 복제·공유·재판매는 금지됩니다.</p></> : <><p>실물 배송 없이 개인DB로 제공되는 디지털 문제집입니다. 구매한 책은 마이페이지의 개인DB 구매 내역에서도 확인할 수 있습니다.</p><p>책 구매와 시험지 만들기 이용권은 별도입니다. 시험지 제작은 사이트의 기존 이용 정책을 따릅니다.</p></>}{book.usage_notes && <p className="store-preline">{book.usage_notes}</p>}<p>이용약관과 취소·환불정책은 페이지 아래 안내에서 확인해 주세요.</p></section>
        </div>
    </>;
}
