export type StoreBook = {
    id: string; slug: string; series: string; title: string; subtitle: string;
    grade: string | null; subject: string | null; description: string;
    contents: Record<string, string | number>; contents_description: string; usage_notes: string;
    cover_path: string | null; cover_text_color: string; sample_paths: string[];
    price: number | null; published: boolean; sort_order: number; created_at: string;
    /** [11/17] 판매용 PDF 로 받는 책(개인DB 연결 없음) — 서버가 pdf_path 에서 만든 표시만, 경로는 내보내지 않는다 */
    pdf: boolean;
};
export type AdminStoreBook = Omit<StoreBook, 'pdf'> & { source_db_id: string | null; pdf_path: string | null };
export const PUBLIC_BOOK_FIELDS = 'id,slug,series,title,subtitle,grade,subject,description,contents,contents_description,usage_notes,cover_path,cover_text_color,sample_paths,price,published,sort_order,created_at';
