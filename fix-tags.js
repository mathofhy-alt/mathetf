const fs = require('fs');
const file = 'src/app/admin/questions/AdminQuestionsClient.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace q.key_concepts pattern
content = content.replace(
  /Array\.isArray\(q\.key_concepts\)\s*\?\s*q\.key_concepts\s*:\s*\(q\.key_concepts\s*\|\|\s*''\)\.split\(\/\[,×x\]\/\)\.map\(\(t:\s*string\)\s*=>\s*t\.trim\(\)\)\.filter\(Boolean\)/g,
  `(Array.isArray(q.key_concepts) ? q.key_concepts.join('×') : (q.key_concepts || '')).split(/[,×x]/).map((t: string) => t.trim()).filter(Boolean)`
);

// Replace selectedQuestion.key_concepts pattern (still using ',')
content = content.replace(
  /Array\.isArray\(selectedQuestion\.key_concepts\)\s*\?\s*selectedQuestion\.key_concepts\s*:\s*\(selectedQuestion\.key_concepts\s*\|\|\s*''\)\.split\('\,'\)\.map\(\(t:\s*string\)\s*=>\s*t\.trim\(\)\)\.filter\(Boolean\)/g,
  `(Array.isArray(selectedQuestion.key_concepts) ? selectedQuestion.key_concepts.join('×') : (selectedQuestion.key_concepts || '')).split(/[,×x]/).map((t: string) => t.trim()).filter(Boolean)`
);

// Replace simQ.key_concepts pattern (still using ',')
content = content.replace(
  /Array\.isArray\(simQ\.key_concepts\)\s*\?\s*simQ\.key_concepts\s*:\s*\(simQ\.key_concepts\s*\|\|\s*''\)\.split\('\,'\)\.map\(\(t:\s*string\)\s*=>\s*t\.trim\(\)\)\.filter\(Boolean\)/g,
  `(Array.isArray(simQ.key_concepts) ? simQ.key_concepts.join('×') : (simQ.key_concepts || '')).split(/[,×x]/).map((t: string) => t.trim()).filter(Boolean)`
);

fs.writeFileSync(file, content);
console.log('Update complete');
