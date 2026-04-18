const { DOMParser } = require('@xmldom/xmldom');
const fs = require('fs');

const xml = fs.readFileSync('수학ETF양식.hml', 'utf-8');
const parser = new DOMParser();
const doc = parser.parseFromString(xml, 'text/xml');
const charShapeList = doc.getElementsByTagName('CHARSHAPELIST')[0];
const charShapes = charShapeList.getElementsByTagName('CHARSHAPE');

console.log('Total CHARSHAPE tags:', charShapes.length);
for (let i = 0; i < charShapes.length; i++) {
    const cs = charShapes[i];
    const id = cs.getAttribute('Id');
    if (id === "14") {
        console.log("FOUND 14!");
        break;
    }
}
