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
    filePath: string;
    contentType: string; // Added: '문제' or '문제+해설' or '개인DB'
    subject?: string;
};

export const sampleFiles: FileItem[] = [];
