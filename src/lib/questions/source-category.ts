export const sourceCategories = [
    { id: 'school', label: '내신' },
    { id: 'special', label: '사관/경대' },
    { id: 'national', label: '전국연합' },
    { id: 'mine', label: '내 개인DB' },   // 회원 전용 개인DB(10/6) — 있는 회원에게만 칸이 보인다
] as const;
export type SourceCategory = typeof sourceCategories[number]['id'];

export function sourceCategory(db: { school?: string | null; exam_type?: string | null; private?: boolean }): SourceCategory {
    if (db.private) return 'mine';
    const type = db.exam_type || '';
    const school = db.school || '';
    if (type === '입학시험' || /사관|경찰대/.test(school)) return 'special';
    if (/모의|수능|전국연합|학력평가/.test(type) || /전국연합|평가원|수능/.test(school)) return 'national';
    return 'school';
}
