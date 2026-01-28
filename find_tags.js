
const fs = require('fs');
const content = fs.readFileSync('c:/Users/matho/OneDrive/바탕 화면/안티그래비티 - 복사본/hml v2-test-tem.hml', 'utf8');
const match = content.match(/<BINDATASTORAGE[\s\S]*?<\/BINDATASTORAGE>/i);
if (match) {
    console.log("FOUND STORAGE TAG:");
    const storageTag = match[0];
    console.log(storageTag.substring(0, 500));
} else {
    console.log("NOT FOUND");
}
const itemMatch = content.match(/<BINDATA\b[^>]*?>/i);
if (itemMatch) {
    console.log("FOUND BINDATA ITEM TAG:");
    console.log(itemMatch[0]);
}
