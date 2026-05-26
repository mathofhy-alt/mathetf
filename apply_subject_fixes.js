// apply_subject_fixes.js
// AdminQuestionsClient.tsx 에 필요한 수정을 안전하게 적용
// 1. 과목 필터 드롭다운: 미적분I 추가, 미적분 제거
// 2. 소팅 편집 모달: 미적분1→미적분I, 미적분2→미적분II, 확통→확률과통계

const fs = require('fs');
const file = 'src/app/admin/questions/AdminQuestionsClient.tsx';
let content = fs.readFileSync(file, 'utf8');

let changed = 0;

// --- Fix 1: 과목 필터 드롭다운 ---
// 현재: 공통수학1, 공통수학2, 대수, 미적분I(old:미적분II만), 확률과통계, 기하
// 목표: 공통수학1, 공통수학2, 대수, 미적분I, 미적분II, 확률과통계, 기하

// 검색할 구간: 필터 드롭다운의 미적분 관련 항목들 (짧은 들여쓰기 12칸)
// 기존(git 복원 후 원본): 미적분I, 확률과통계, 미적분II, 기하, 수학(상), 수학(하), 수학I, 수학II, 미적분
const oldFilter = [
    '                            <option value="\ubbf8\uc801\ubd84I">\ubbf8\uc801\ubd84I</option>',
    '                            <option value="\ud655\ub960\uacfc\ud1b5\uacc4">\ud655\ub960\uacfc\ud1b5\uacc4</option>',
    '                            <option value="\ubbf8\uc801\ubd84II">\ubbf8\uc801\ubd84II</option>',
    '                            <option value="\uae30\ud558">\uae30\ud558</option>',
].join('\r\n');

const newFilter = [
    '                            <option value="\ubbf8\uc801\ubd84I">\ubbf8\uc801\ubd84I</option>',
    '                            <option value="\ubbf8\uc801\ubd84II">\ubbf8\uc801\ubd84II</option>',
    '                            <option value="\ud655\ub960\uacfc\ud1b5\uacc4">\ud655\ub960\uacfc\ud1b5\uacc4</option>',
    '                            <option value="\uae30\ud558">\uae30\ud558</option>',
].join('\r\n');

// 원본에서 필터 패턴 찾기
if (content.includes(oldFilter)) {
    content = content.replace(oldFilter, newFilter);
    console.log('[OK] Fix 1: 과목 필터 드롭다운 수정 완료');
    changed++;
} else {
    // 원본 그대로라면 미적분II만 있을 수 있음 - 단순히 미적분I 앞에 삽입
    const simpleTarget = '                            <option value="\ubbf8\uc801\ubd84II">\ubbf8\uc801\ubd84II</option>';
    const simpleInsert = '                            <option value="\ubbf8\uc801\ubd84I">\ubbf8\uc801\ubd84I</option>\r\n';
    if (content.includes(simpleTarget)) {
        content = content.replace(simpleTarget, simpleInsert + simpleTarget);
        console.log('[OK] Fix 1b: 미적분I 삽입 완료');
        changed++;
    } else {
        console.log('[WARN] Fix 1: 필터 패턴을 찾지 못함');
    }
}

// --- Fix 2: 소팅 편집 모달 과목 드롭다운 ---
// 기존: 미적분1, 미적분2, 기하, 확통 (긴 들여쓰기 44칸)
const oldModal = [
    '                                            <option value="\ubbf8\uc801\ubd841">\ubbf8\uc801\ubd841</option>',
    '                                            <option value="\ubbf8\uc801\ubd842">\ubbf8\uc801\ubd842</option>',
    '                                            <option value="\uae30\ud558">\uae30\ud558</option>',
    '                                            <option value="\ud655\ud1b5">\ud655\ud1b5</option>',
].join('\r\n');

const newModal = [
    '                                            <option value="\ubbf8\uc801\ubd84I">\ubbf8\uc801\ubd84I (\uace0\ub2f4 \ub0b4\uc2e0)</option>',
    '                                            <option value="\ubbf8\uc801\ubd84II">\ubbf8\uc801\ubd84II (\uace0\uc0bc \uc120\ud0dd)</option>',
    '                                            <option value="\uae30\ud558">\uae30\ud558 (\uace0\uc0bc \uc120\ud0dd)</option>',
    '                                            <option value="\ud655\ub960\uacfc\ud1b5\uacc4">\ud655\ub960\uacfc\ud1b5\uacc4 (\uace0\uc0bc \uc120\ud0dd)</option>',
].join('\r\n');

if (content.includes(oldModal)) {
    content = content.replace(oldModal, newModal);
    console.log('[OK] Fix 2: 편집 모달 과목 드롭다운 수정 완료');
    changed++;
} else {
    console.log('[WARN] Fix 2: 편집 모달 패턴을 찾지 못함 (이미 수정됐거나 형식 다름)');
}

if (changed > 0) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`\n총 ${changed}개 수정 적용 완료. 파일 저장됨.`);
} else {
    console.log('\n변경 없음.');
}
