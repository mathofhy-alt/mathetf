
const fs = require('fs');
const content = fs.readFileSync('재조립양식.hml', 'utf-8');

console.log('Checking 재조립양식.hml...');
console.log('Has {{DATE}}:', content.includes('{{DATE}}'));
console.log('Has {{TITLE}}:', content.includes('{{TITLE}}'));

if (content.includes('{{DATE}}')) {
    const idx = content.indexOf('{{DATE}}');
    console.log('Context Date:', content.substring(idx - 50, idx + 50));
}
