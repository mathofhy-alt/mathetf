const fs = require('fs');
const file = 'src/app/admin/questions/AdminQuestionsClient.tsx';
let content = fs.readFileSync(file, 'utf8');

// 필터 드롭다운에서 미적분II 앞에 미적분I 추가
// 필터 드롭다운(짧은 들여쓰기)과 편집 모달(긴 들여쓰기)을 구분
const filterTarget = '                            <option value="\ubbf8\uc801\ubd84II">\ubbf8\uc801\ubd84II</option>';
const insertLine = '                            <option value="\ubbf8\uc801\ubd84I">\ubbf8\uc801\ubd84I</option>\r\n';

const idx = content.indexOf(filterTarget);
if (idx === -1) {
    console.log('Pattern not found. Checking what exists around 미적분...');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
        if (line.includes('\ubbf8\uc801\ubd84')) {
            console.log(`Line ${i + 1}: ${line.substring(0, 80)}`);
        }
    });
} else {
    content = content.slice(0, idx) + insertLine + content.slice(idx);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Done! 미적분I 추가 완료');
}
