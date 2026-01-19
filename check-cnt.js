const fs = require('fs');
const h = fs.readFileSync('debug_header.xml', 'utf8');
// Find all itemCnt and cnt pairs
const regex = /itemCnt="(\d+)"[^>]*cnt="(\d+)"/g;
let match;
console.log('itemCnt vs cnt comparison:');
while ((match = regex.exec(h)) !== null) {
    const itemCnt = match[1];
    const cnt = match[2];
    const status = itemCnt === cnt ? '✓' : '✗ MISMATCH';
    console.log(`itemCnt=${itemCnt} cnt=${cnt} ${status}`);
}
