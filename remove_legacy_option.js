const fs = require('fs');
const file = 'src/app/admin/questions/AdminQuestionsClient.tsx';
let content = fs.readFileSync(file, 'utf8');

// 필터 드롭다운에서 단독 '미적분' 옵션 제거 (미적분I/II 는 유지)
// 해당 라인: <option value="미적분">미적분</option>
const lines = content.split('\n');
const filtered = lines.filter(line => {
    // value="미적분"> 이고 미적분I 이나 미적분II 가 아닌 라인 제거
    return !(line.includes('value="\ubbf8\uc801\ubd84"') && line.includes('>\ubbf8\uc801\ubd84<'));
});

if (filtered.length < lines.length) {
    content = filtered.join('\n');
    fs.writeFileSync(file, content, 'utf8');
    console.log('Done: 미적분 단독 항목 제거 완료 (' + (lines.length - filtered.length) + '줄 삭제)');
} else {
    console.log('Pattern not found or already removed');
}
