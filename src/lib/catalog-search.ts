/** Search aliases only; never replace stored school names or merge school identities. */
const SCHOOL_ALIASES: Record<string, string[]> = {
    '단국대학교사범대학부속고등학교': ['단대부고'],
};

function normalize(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/gu, '');
}

export function schoolSearchNames(school: string): string[] {
    const name = normalize(school);
    const shortName = name
        .replace(/여자고등학교$/, '여고')
        .replace(/여자중학교$/, '여중')
        .replace(/고등학교$/, '고')
        .replace(/중학교$/, '중');
    return [...new Set([name, shortName, ...(SCHOOL_ALIASES[name] || [])])];
}

interface CatalogSearchItem {
    school: string;
    title?: string;
    year?: string | number;
    grade?: string | number;
    semester?: string | number;
    examType?: string;
    subject?: string;
}

/** Shared by the catalog API and client so fetched matches survive local filtering. */
export function matchesCatalogSearch(item: CatalogSearchItem, query: string): boolean {
    const needle = normalize(query);
    if (!needle) return true;
    const metadata = [item.year, item.grade, item.semester, item.examType, item.subject]
        .filter(value => value !== undefined && value !== null).join(' ');
    return normalize(item.title || '').includes(needle)
        || schoolSearchNames(item.school || '').some(name => normalize(`${name} ${metadata}`).includes(needle));
}
