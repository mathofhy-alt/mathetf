import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * [10/26 대표] PDF 에도 받은 회원 아이디를 안 보이게 넣는다 — 한글 파일(stampMemberId)과 같은 목적: 유출되면 누가 받았는지 안다.
 * 아이윈브 서버가 만든 PDF 를 받아 가는 순간 버셀에서 한 번 고친다(서버 프로그램은 그대로).
 *   ① 문서 정보: 작성자·키워드·주제에 회원 아이디
 *   ② 쪽마다 아래 여백에 투명(불투명도 0) 글자로 아이디 — 화면·인쇄에는 안 보이고, 글자 검색·복사하면 나온다
 */
export async function stampPdfMember(pdf: Uint8Array, email: string): Promise<Uint8Array> {
    const mark = `[mathETF member: ${email.replace(/[^\x20-\x7e]/g, '?')}]`;
    const doc = await PDFDocument.load(pdf, { updateMetadata: false });
    doc.setAuthor(mark);
    doc.setSubject(mark);
    doc.setKeywords(['mathETF', mark]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const page of doc.getPages()) {
        page.drawText(mark, { x: 8, y: 4, size: 4, font, color: rgb(1, 1, 1), opacity: 0 });
    }
    return doc.save();
}
