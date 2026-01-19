const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../학교목록.xlsx');
console.log('Reading file:', filePath);

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
// Read with header: 1 to get array of arrays
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
console.log('Total rows (with header):', rows.length);

const counts = {};
let missingRegion = 0;

rows.slice(1).forEach(row => {
    // Column 0 is Region
    const region = row[0];
    if (region) {
        counts[region] = (counts[region] || 0) + 1;
    } else {
        missingRegion++;
    }
});

console.log('Counts per region:', counts);
console.log('Rows with missing region:', missingRegion);
