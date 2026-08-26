export type FileItem = {
    id: string;
    title: string;
    type: 'PDF' | 'HWP' | 'DB';
    price: number;
    uploader: string;
    uploaderId: string;
    date: string;
    school: string;
    grade: number;
    sales: number;
    region?: string;
    district?: string;
    year?: number;
    semester?: number;
    examType?: string;
    filePath?: string;   // 홈 목록에는 싣지 않음 — 다운로드 시점에 조회
    contentType: string; // Added: '문제' or '문제+해설' or '개인DB'
    subject?: string;
    hasFreePdf?: boolean;  // 무료PDF 버튼 노출 판단용 (URL 은 다운로드 시점에 조회) // 회원가입 시 무료로 받는 '문제만 PDF' public URL (해설 PDF 행에만)
};

export const sampleFiles: FileItem[] = [];

// 홈 목록 전송 포맷 (2026-08-26)
// 자료 1,321건을 객체 배열로 보내면 필드명 17개가 행마다 반복돼 페이로드의 38.5%(248KB)를
// 키 이름이 차지한다. 값만 담은 배열로 보내고 클라이언트에서 되살린다.
// ⚠ 순서가 곧 규약이다 — 여기만 고치면 서버(page.tsx)·클라이언트(HomeClient)가 함께 따라간다.
// title 은 싣지 않는다. 1,321건 전수 확인 결과 제목은 전부
//   "학교명 2025년 1학년 2학기 중간고사 공통수학2 [문제+해설]"
// 형태로 아래 필드들의 조합이고, title 의 연도와 exam_year 불일치는 0건이었다.
// (예전엔 2024/2025 어긋남 때문에 제목 정규식을 우선했는데 그 사유가 사라졌다.)
// gzip 후 기준으로 제목이 페이로드의 11%를 차지했다.
export const HOME_FIELDS = [
    'id', 'school', 'grade', 'semester', 'subject', 'exam_type', 'exam_year',
    'file_type', 'content_type', 'created_at', 'price', 'uploader_name', 'region',
    'district', 'is_verified', 'has_free_pdf',
] as const;

export function packHomeRow(o: any): any[] {
    return HOME_FIELDS.map((f) => o[f]);
}

export function unpackHomeRow(a: any[]): any {
    const o: any = {};
    HOME_FIELDS.forEach((f, i) => { o[f] = a[i]; });
    return o;
}
