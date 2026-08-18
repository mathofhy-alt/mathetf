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
