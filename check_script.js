
const fs = require('fs');
const content = fs.readFileSync('c:/Users/matho/OneDrive/바탕 화면/안티그래비티 - 복사본/hml v2-test-tem.hml', 'utf8');
const match = content.match(/<SCRIPT>([\s\S]*?)<\/SCRIPT>/i);
if (match) {
    console.log("FOUND SCRIPT:");
    console.log(match[0]);
} else {
    console.log("NOT FOUND");
}
