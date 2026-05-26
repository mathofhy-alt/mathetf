const fs = require('fs');
const file = 'src/app/question-bank/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const lines = content.split('\n');

// 217번 줄 (0-indexed 216): .eq('work_status', 'sorted')
// 218번 줄 (0-indexed 217): .range(from, to);
// 사이에 .order('question_number', { ascending: true }) 삽입

let targetIdx = -1;
for (let i = 214; i < 222; i++) {
    if (lines[i] && lines[i].includes(".range(from, to)")) {
        targetIdx = i;
        break;
    }
}

if (targetIdx === -1) {
    console.log('Target .range() line not found');
    for (let i = 213; i < 222; i++) console.log((i+1) + ': ' + lines[i]);
    process.exit(1);
}

console.log('Found .range() at line', targetIdx + 1, ':', lines[targetIdx]);

// .range(from, to) 앞에 .order() 삽입
const indent = '            ';
const orderLine = `${indent}.order('question_number', { ascending: true })`;
lines.splice(targetIdx, 0, orderLine);

fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('[SUCCESS] question_number 오름차순 정렬 추가 완료!');
