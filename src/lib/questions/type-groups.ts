export type TypeDefinitions = Record<string, { name: string; ord: number }>;

export function typeDefinitionKey(unit: string | null | undefined, code: string | null | undefined): string {
    return JSON.stringify([unit || '', code || '']);
}

interface TypedQuestion {
    id: string;
    unit?: string | null;
    type_code?: string | null;
}

interface TypeGroup {
    key: string;
    unit: string;
    code: string;
    start: number;
    count: number;
}

// 각 카드가 속한 연속 묶음을 가리킨다. 이어 붙인 페이지도 한 번에 계산하므로 경계에서 합쳐진다.
export function indexQuestionTypeGroups(questions: readonly TypedQuestion[]): TypeGroup[] {
    const groups: TypeGroup[] = [];
    let current: TypeGroup | undefined;
    questions.forEach((q, index) => {
        const unit = q.unit || '';
        const code = q.type_code || '';
        if (!current || current.unit !== unit || current.code !== code) {
            current = { key: JSON.stringify([unit, code, q.id]), unit, code, start: index, count: 0 };
        }
        current.count++;
        groups.push(current);
    });
    return groups;
}
