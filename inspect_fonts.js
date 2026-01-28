
const fs = require('fs');
const { DOMParser } = require('xmldom');

const xml = fs.readFileSync('재조립양식.hml', 'utf-8');
const doc = new DOMParser().parseFromString(xml, 'text/xml');

console.log('--- FACENAMELIST ---');
const facenames = doc.getElementsByTagName('FONT'); // Usually inside FACENAME
// Structure: HEAD > MAPPINGTABLE > FACENAMELIST > FACENAME > FONT
const faceList = doc.getElementsByTagName('FACENAME');
for (let i = 0; i < faceList.length; i++) {
    const fn = faceList[i];
    const name = fn.getAttribute('Name') || fn.getAttribute('Lang'); // Check structure
    console.log(`FaceName[${i}] = ${name}`);
    // Check inner FONT tags if needed
}

console.log('\n--- CHARSHAPE ---');
const charShapes = doc.getElementsByTagName('CHARSHAPE');
for (let i = 0; i < charShapes.length; i++) {
    const cs = charShapes[i];
    const id = cs.getAttribute('Id');
    const faceId = cs.getAttribute('FaceNameUser') || cs.getAttribute('FaceNameHangeul');
    console.log(`CharShape[${id}] FaceNameRef=${faceId}`);
}
