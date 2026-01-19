const fs = require('fs');
const s = fs.readFileSync('debug_section.xml', 'utf8');
const ids = (s.match(/<hp:p [^>]*id="(\d+)"/g) || []).map(m => m.match(/id="(\d+)"/)[1]);
const counts = {};
ids.forEach(i => counts[i] = (counts[i] || 0) + 1);
console.log('Total paragraph IDs found:', ids.length);
console.log('Unique:', Object.keys(counts).length);
Object.entries(counts).filter(([k, v]) => v > 1).forEach(([k, v]) => console.log('DUPLICATE ID:', k, 'appears', v, 'times'));
