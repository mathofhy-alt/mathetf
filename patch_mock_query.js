const fs = require('fs');
const file = 'src/app/question-bank/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const lines = content.split('\n');
// 찾아야 할 범위: 255~258번 줄 (0-indexed: 254~257)
// 256: if (db.subject && db.subject !== '전과정') {
// 257:     parts.push(`subject.eq.${db.subject}`);
// 258: }

let targetIdx = -1;
for (let i = 253; i < 260; i++) {
    if (lines[i] && lines[i].includes('db.subject') && lines[i].includes('전과정')) {
        targetIdx = i;
        break;
    }
}

if (targetIdx === -1) {
    console.log('Target line not found. Lines around 254-260:');
    for (let i = 252; i < 263; i++) {
        console.log((i+1) + ': ' + JSON.stringify(lines[i]));
    }
    process.exit(1);
}

console.log('Found target at line', targetIdx + 1, ':', lines[targetIdx]);
console.log('Next line:', lines[targetIdx + 1]);
console.log('Next+2 line:', lines[targetIdx + 2]);

// Replace 3 lines (targetIdx, targetIdx+1, targetIdx+2) with new logic
const indent = '                            ';
const newLines = [
    `${indent}if (db.subject && db.subject !== '\uc804\uacfc\uc815') {`,
    `${indent}    // \ubaa8\uc758\uace0\uc0ac \uc120\ud0dd\uacfc\ubaa9 DB: \uacf5\ud1b5(1~22\ubc88) + \uc120\ud0dd\uacfc\ubaa9(23~30\ubc88) \ud568\uaed8 \uc870\ud68c`,
    `${indent}    const MOCK_SELECT_SUBJECTS = ['\uae30\ud558', '\ubbf8\uc801\ubd84II', '\ud655\ub960\uacfc\ud1b5\uacc4', '\ud655\ub960\uacfc \ud1b5\uacc4'];`,
    `${indent}    const isMockSelect = (db.exam_type === '\ubaa8\uc758\uace0\uc0ac' || db.exam_type === '\uc218\ub2a5')`,
    `${indent}        && MOCK_SELECT_SUBJECTS.includes(db.subject);`,
    `${indent}    if (isMockSelect) {`,
    `${indent}        parts.push(\`subject.in.("\uacf5\ud1b5\uc218\ud5591","\uacf5\ud1b5\uc218\ud5592","\ub300\uc218","\ubbf8\uc801\ubd84I","\${db.subject}")\`);`,
    `${indent}    } else {`,
    `${indent}        parts.push(\`subject.eq.\${db.subject}\`);`,
    `${indent}    }`,
    `${indent}}`
];

// Check that lines targetIdx+1 and targetIdx+2 are the expected lines
console.log('\nReplacing lines', targetIdx+1, 'to', targetIdx+3);
lines.splice(targetIdx, 3, ...newLines);

const newContent = lines.join('\n');
fs.writeFileSync(file, newContent, 'utf8');
console.log('\n[SUCCESS] 패치 완료! 모의고사 선택과목 DB 조회 시 공통문제 자동 포함.');
