
const fs = require('fs');
const { DOMParser, XMLSerializer } = require('xmldom');

// Mock a minimal generator-like logic
function testSerialization() {
    const xml = '<P><TEXT>Q1<ENDNOTE><PARALIST><P><TEXT>Expl</TEXT></P></PARALIST></ENDNOTE></TEXT></P>';
    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const doc = parser.parseFromString(`<WRAP>${xml}</WRAP>`, 'text/xml');

    // Reproduce the generator's child loop
    const root = doc.documentElement;
    const children = Array.from(root.childNodes);
    let out = '';
    for (const child of children) {
        if (child.nodeType === 1) {
            out += serializer.serializeToString(child);
        }
    }

    console.log('Original XML:', xml);
    console.log('Serialized XML:', out);

    if (out.includes('<ENDNOTE') && out.includes('<PARALIST')) {
        console.log('SUCCESS: ENDNOTE and PARALIST preserved.');
    } else {
        console.log('FAILURE: Structure lost.');
    }
}

testSerialization();
