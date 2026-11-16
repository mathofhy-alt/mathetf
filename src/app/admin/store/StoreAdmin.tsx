'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import type { AdminStoreBook } from '@/lib/store/types';

const blank = (): Omit<AdminStoreBook, 'id' | 'created_at'> & { id?: string } => ({ slug: '', series: '', title: '', subtitle: '', grade: null, subject: null, description: '', contents: {}, contents_description: '', usage_notes: '', cover_path: null, cover_text_color: '#FFFFFF', sample_paths: [], source_db_id: '', pdf_path: null, price: null, published: false, sort_order: 0 });
export default function StoreAdmin() {
    const [books, setBooks] = useState<AdminStoreBook[]>([]);
    const [draft, setDraft] = useState(blank);
    const [contents, setContents] = useState('{}');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [count, setCount] = useState('');
    async function load() {
        const res = await fetch('/api/admin/store', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setBooks(data.books);
    }
    useEffect(() => { load().catch(e => setMessage(e.message)); }, []);
    function edit(book?: AdminStoreBook) { setDraft(book || blank()); setContents(JSON.stringify(book?.contents || {}, null, 2)); setMessage(''); setCount(''); }
    async function save(e: FormEvent) {
        e.preventDefault(); setBusy(true); setMessage('');
        try {
            const res = await fetch('/api/admin/store', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, contents: JSON.parse(contents) }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setDraft(data.book); setCount(data.book.source_db_id ? `private 문항 ${data.counts.private}개` : 'PDF 책'); await load(); setMessage('저장했습니다.');
        } catch (e) { setMessage(e instanceof Error ? e.message : '저장에 실패했습니다.'); }
        finally { setBusy(false); }
    }
    async function check() {
        setBusy(true); setCount('');
        try {
            const res = await fetch(`/api/admin/store?source=${encodeURIComponent(draft.source_db_id || '')}`);
            const data = await res.json(); if (!res.ok) throw new Error(data.error);
            setCount(`private 문항 ${data.private}개 · 공개(sorted) ${data.sorted}개 · 그 외 상태 ${data.nonPrivate - data.sorted}개`);
        } catch (e) { setMessage(e instanceof Error ? e.message : '확인에 실패했습니다.'); }
        finally { setBusy(false); }
    }
    async function upload(file: File | undefined, kind: 'cover' | 'sample') {
        if (!file) return;
        setBusy(true); setMessage('');
        try {
            const form = new FormData(); form.set('file', file); form.set('kind', kind);
            const res = await fetch('/api/admin/store/upload', { method: 'POST', body: form });
            const data = await res.json(); if (!res.ok) throw new Error(data.error);
            setDraft(d => kind === 'cover' ? { ...d, cover_path: data.path } : { ...d, sample_paths: [...d.sample_paths, data.path] });
            setMessage('이미지를 올렸습니다. 책 저장을 눌러 반영해 주세요.');
        } catch (e) { setMessage(e instanceof Error ? e.message : '업로드에 실패했습니다.'); }
        finally { setBusy(false); }
    }
    const field = (key: 'slug' | 'series' | 'title' | 'subtitle' | 'grade' | 'subject' | 'source_db_id' | 'pdf_path', label: string, required = false) => <label>{label}<input value={draft[key] || ''} required={required} onChange={e => { setDraft(d => ({ ...d, [key]: e.target.value })); if (key === 'source_db_id') setCount(''); }} /></label>;
    return <div className="rd store"><Header /><div className="store-wrap">
        <div className="store-heading"><div><p className="store-eyebrow">관리자</p><h1>서점 관리</h1></div><Link href="/store" className="store-button secondary">서점 미리보기</Link></div>
        <p className="store-lead">수학ETF가 직접 만든 변형 문제집만 등록합니다. 가격 빈칸은 ‘가격 준비 중’으로 표시됩니다.</p>
        <div className="store-admin-grid"><aside className="store-admin-list"><button className="store-button" disabled={busy} onClick={() => edit()}>새 책 추가</button>{books.map(b => <button key={b.id} disabled={busy} aria-pressed={draft.id === b.id} onClick={() => edit(b)}><strong>{b.title}</strong><span>{b.published ? '공개' : '비공개'} · {b.price === null ? '가격 준비 중' : `${b.price.toLocaleString()}원`}</span></button>)}{books.length === 0 && <p>등록된 책이 없습니다.</p>}</aside>
            <form className="store-admin-form" onSubmit={save}><fieldset disabled={busy}><legend>{draft.id ? '책 수정' : '새 책'}</legend>
                <div className="store-admin-fields">{field('title', '책 제목', true)}{field('slug', '주소 (영문 소문자·숫자·하이픈)', true)}{field('series', '시리즈명')}{field('subtitle', '부제')}{field('grade', '대상 학년')}{field('subject', '과목')}
                    <label>가격 (원, 빈칸 허용)<input type="number" min="0" step="1" value={draft.price ?? ''} onChange={e => setDraft(d => ({ ...d, price: e.target.value === '' ? null : Number(e.target.value) }))} /></label>
                    <label>정렬 순서<input type="number" step="1" value={draft.sort_order} onChange={e => setDraft(d => ({ ...d, sort_order: Number(e.target.value) }))} /></label>
                </div>
                <label>소개 글<textarea rows={5} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} /></label>
                <label>구성 칩 (JSON 객체: 항목 이름과 실제 구성값)<textarea rows={4} value={contents} onChange={e => setContents(e.target.value)} spellCheck={false} /></label>
                <label>구성 설명<textarea rows={5} value={draft.contents_description} onChange={e => setDraft(d => ({ ...d, contents_description: e.target.value }))} /></label>
                <label>책별 이용 안내<textarea rows={4} value={draft.usage_notes} onChange={e => setDraft(d => ({ ...d, usage_notes: e.target.value }))} /></label>
                {field('pdf_path', 'PDF 책: 판매용 PDF 경로 (비공개 버킷 store/pdf/…pdf, 파일은 운영자가 올림)')}
                {field('source_db_id', '개인DB 책: 연결할 source_db_id (교재명 또는 교재명 > 단원) — PDF 책이면 비움')}
                <p className="store-muted">공개(sorted) 문항은 연결할 수 없고, 책 공개에는 private 문항이 1개 이상 필요합니다. 시중교재 개인DB·공개 자료·다른 책과 겹치는 묶음은 등록할 수 없습니다. 주문이 생긴 책은 연결 묶음을 변경할 수 없습니다.</p>
                <button type="button" className="store-button secondary" onClick={check}>연결 문항 수 확인</button>{count && <p role="status">{count}</p>}
                <label>표지 이미지 (PNG·JPG·WebP, 5MB 이하)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void upload(e.target.files?.[0], 'cover'); e.target.value = ''; }} /></label>
                {draft.cover_path && <div className="store-uploaded"><span>{draft.cover_path}</span><button type="button" onClick={() => setDraft(d => ({ ...d, cover_path: null }))}>표지 제거</button></div>}
                <label>CSS 표지 글자색<input type="color" value={draft.cover_text_color} onChange={e => setDraft(d => ({ ...d, cover_text_color: e.target.value }))} /></label>
                <label>공개용 샘플 이미지 (최대 8개, 로그인 회원에게 표시)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={draft.sample_paths.length >= 8} onChange={e => { void upload(e.target.files?.[0], 'sample'); e.target.value = ''; }} /></label>
                <p className="store-muted">샘플은 별도 공개용 이미지입니다. 업로드한 파일은 기존 공개 버킷에 저장됩니다. 비공개 원본 대신 공개해도 되는 이미지만 등록해 주세요.</p>
                {draft.sample_paths.map((p, i) => <div className="store-uploaded" key={p}><span>샘플 {i + 1}: {p}</span><button type="button" onClick={() => setDraft(d => ({ ...d, sample_paths: d.sample_paths.filter(v => v !== p) }))}>제거</button></div>)}
                <label className="store-publish"><input type="checkbox" checked={draft.published} onChange={e => setDraft(d => ({ ...d, published: e.target.checked }))} />공개된 책으로 표시</label>
                <button className="store-button" type="submit">{busy ? '처리 중…' : '책 저장'}</button>{draft.id && <Link className="store-text-link" href={`/store/${draft.slug}`}>책 소개 미리보기</Link>}
            </fieldset></form>
        </div>{message && <p role="status" className="store-message">{message}</p>}
    </div></div>;
}
