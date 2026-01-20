
import * as fs from 'fs';
import { DOMParser, XMLSerializer } from 'xmldom';

const targetFile = 'test_hml_v2_output.hml';
const content = fs.readFileSync(targetFile, 'utf8');
const doc = new DOMParser().parseFromString(content, 'text/xml');

const sections = doc.getElementsByTagName('SECTION');
console.log(`Number of SECTIONS: ${sections.length}`);

if (sections.length > 0) {
    const section = sections[0];
    console.log(`SECTION child count: ${section.childNodes.length}`);

    for (let i = 0; i < section.childNodes.length; i++) {
        const child = section.childNodes[i];
        if (child.nodeType === 1) { // Element
            const el = child as Element;
            console.log(`Child ${i}: <${el.localName}> (Attributes: ${el.attributes.length})`);

            // Log depth for P tags
            if (el.localName === 'P') {
                const texts = el.getElementsByTagName('TEXT');
                console.log(`  - P has ${texts.length} TEXT nodes`);
                for (let j = 0; j < texts.length; j++) {
                    const chars = texts[j].getElementsByTagName('CHAR');
                    console.log(`    - TEXT ${j} has ${chars.length} CHAR nodes`);
                    if (texts[j].textContent) {
                        console.log(`    - TEXT ${j} Content: "${texts[j].textContent.substring(0, 50)}..."`);
                    }
                }
                const pics = el.getElementsByTagName('PICTURE');
                console.log(`  - P has ${pics.length} PICTURE nodes`);
            }
        } else if (child.nodeType === 3) { // Text/Whitespace
            // console.log(`Child ${i}: Text node (length: ${child.nodeValue?.length})`);
        }
    }
}
