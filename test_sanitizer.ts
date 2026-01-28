import { DOMParser, XMLSerializer } from 'xmldom';

// [SAFETY] Helper for DOM-based Sanitization (COPIED FROM route.ts)
function sanitizeHmlAttributes(xmlContent: string) {
    try {
        const doc = new DOMParser().parseFromString(`<ROOT>${xmlContent}</ROOT>`, 'text/xml');
        const elements = doc.getElementsByTagName('*');

        // Strict Whitelist of Allowed HML Body Tags
        const allowedTags = new Set([
            'P', 'TEXT', 'CHAR', 'EQUATION', 'SHAPEOBJECT', 'SHAPECOMPONENT', 'SHAPECOMMENT',
            'ROTATIONINFO', 'RENDERINGINFO', 'TRANSMATRIX', 'SCAMATRIX', 'ROTMATRIX',
            'IMAGERECT', 'IMAGECLIP', 'INSIDEMARGIN', 'OUTSIDEMARGIN', 'IMAGE', 'EFFECTS', 'SCRIPT',
            'ROOT', 'WRAP', // Internal wrappers
            'ENDNOTE' // [TEST] Allow ENDNOTE
        ]);

        console.log(`[TEST] Total Elements found: ${elements.length}`);

        // Iterate backwards so we can safely delete nodes
        for (let i = elements.length - 1; i >= 0; i--) {
            const el = elements[i];
            if (el.nodeType === 1) { // Element
                const tagName = el.tagName.toUpperCase();

                // 1. Tag Whitelist Check
                if (!allowedTags.has(tagName)) {
                    console.log(`[TEST] Stripping Unknown Tag <${tagName}>`);
                    // Unwrap children (replace node with its children)
                    while (el.firstChild) {
                        el.parentNode?.insertBefore(el.firstChild, el);
                    }
                    el.parentNode?.removeChild(el);
                    continue; // Node is gone, next
                }

                const attrsToRemove = [];
                for (let j = 0; j < el.attributes.length; j++) {
                    const name = el.attributes[j].name;
                    if (name.match(/^(Style|ParaShape|CharShape|BinData|FaceName|BorderFill|ImageID|data-hml-.*)$/i)) {
                        attrsToRemove.push(name);
                    }
                }
                if (attrsToRemove.length > 0) {
                    console.log(`[TEST] Removing attributes from <${tagName}>: ${attrsToRemove.join(', ')}`);
                    attrsToRemove.forEach(name => el.removeAttribute(name));
                }
            }
        }
        const serializer = new XMLSerializer();
        return serializer.serializeToString(doc).replace(/^<ROOT>/, '').replace(/<\/ROOT>$/, '');
    } catch (e) {
        console.warn(`[ERROR] DOM Sanitization Failed: ${e}`);
        return xmlContent;
    }
}

// TEST CASES
const test1 = `<P Style="23"><TEXT>Hello <AUTONUM>World</AUTONUM></TEXT></P>`;
const test2 = `<P data-hml-style="foo"><TEXT>Korean: 가나다라</TEXT></P>`;
const test3 = `<P><TEXT>Nested: <BOX>Inside Box <CHAR>Char</CHAR></BOX></TEXT></P>`;
const test4 = `<P>Broken: <CHAR>Unclosed`; // DOMParser should fix or fail?

console.log("--- TEST 1: Whitelist & Attributes ---");
console.log("Input:", test1);
console.log("Output:", sanitizeHmlAttributes(test1));

console.log("\n--- TEST 2: Korean & data-hml ---");
console.log("Input:", test2);
console.log("Output:", sanitizeHmlAttributes(test2));

console.log("\n--- TEST 3: Nested Unknown Tags ---");
console.log("Input:", test3);
console.log("Output:", sanitizeHmlAttributes(test3));

const test5 = `<P Style="23"></P>`; // Empty P -> <P/>?
const test6 = `<P><TEXT>Control \x00 \x08 Char</TEXT></P>`;
const test7 = `<P><TEXT><ENDNOTE><PARALIST><P><TEXT><AUTONUM>Bad</AUTONUM>Content</TEXT></P></PARALIST></ENDNOTE></TEXT></P>`;

console.log("\n--- TEST 5: Empty Paragraph (Self-Closing Check) ---");
console.log("Input:", test5);
console.log("Output:", sanitizeHmlAttributes(test5));

console.log("\n--- TEST 6: Control Characters ---");
console.log("Input:", test6);
console.log("Output:", sanitizeHmlAttributes(test6));

console.log("\n--- TEST 7: ENDNOTE Whitelist (Strip AUTONUM inside) ---");
console.log("Input:", test7);
// Note: You must update the allowedTags in this file to include ENDNOTE for this test to pass as expected
console.log("Output:", sanitizeHmlAttributes(test7));

