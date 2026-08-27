export type Folder = {
    id: string;
    user_id: string;
    parent_id: string | null;
    name: string;
    created_at: string;
    folder_type?: 'db' | 'exam' | 'all';
};

export type StorageItemType = 'personal_db' | 'saved_exam';

export type UserItem = {
    id: string;
    folder_id: string;
    user_id: string;
    type: StorageItemType;
    reference_id: string; // ID of the referenced item
    name: string | null;  // Optional override name
    created_at: string;
    // Joined data (optional)
    details?: any;
};

export type FolderContent = {
    folders: Folder[];
    items: UserItem[];
};

// 개인DB 폴더 이름. 2026-08-27 '구매한 학교 기출' → '내신기출' 로 변경(사용자 요청).
// ⚠ 이름 문자열로 폴더를 식별하는 곳이 여럿이라, 기존 177개 폴더 행을 옮기는 동안
//    두 이름을 모두 인정해야 배포 중간에 아이콘·정렬·삭제버튼이 어긋나지 않는다.
export const NAESIN_FOLDER = '내신기출';
export const NAESIN_FOLDER_LEGACY = '구매한 학교 기출';
export const isNaesinFolder = (name?: string | null) =>
    name === NAESIN_FOLDER || name === NAESIN_FOLDER_LEGACY;

// 시스템이 만들어 주는 가상 폴더 — 사용자가 지울 수 없다.
// ⚠ 예전엔 mock-exam-root 만 막아서 '사관학교·경찰대' 에 휴지통이 떴다(8/27 사용자 제보).
export const VIRTUAL_FOLDER_IDS = ['mock-exam-root', 'exam-school-root'];
export const isVirtualFolder = (f: { id?: string; name?: string }) =>
    VIRTUAL_FOLDER_IDS.includes(f.id || '') || f.name === '사관학교·경찰대' || f.name === '모의고사';
