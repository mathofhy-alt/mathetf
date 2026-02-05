const { DOMParser, XMLSerializer } = require('xmldom');

function testFix() {
    const qDoc = new DOMParser().parseFromString('<BODY></BODY>', 'text/xml');
    const firstVisualP = qDoc.createElement('P');
    firstVisualP.setAttribute('Style', '문제1');
    const textNode = qDoc.createElement('TEXT');

    // Case 1: AUTONUM present
    const autoNum = qDoc.createElement('AUTONUM');
    autoNum.setAttribute('Number', '22');
    autoNum.appendChild(qDoc.createTextNode('22. '));
    textNode.appendChild(autoNum);

    // Case 2: Existing CHAR number (will be handled by targetTextNode stripping)
    const charOld = qDoc.createElement('CHAR');
    charOld.appendChild(qDoc.createTextNode('22. '));
    textNode.appendChild(charOld);

    const charContent = qDoc.createElement('CHAR');
    charContent.appendChild(qDoc.createTextNode('진짜 내용'));
    textNode.appendChild(charContent);
    firstVisualP.appendChild(textNode);

    console.log("Before:");
    console.log(new XMLSerializer().serializeToString(firstVisualP));

    // --- FIX V24 logic ---
    // 1. Remove AUTONUM
    const autoNums = Array.from(firstVisualP.getElementsByTagName('AUTONUM'));
    autoNums.forEach(an => {
        if (an.parentNode) an.parentNode.removeChild(an);
    });

    // 2. Stripping logic (simplified for test)
    let targetTextNode = textNode;
    let firstChild = targetTextNode.firstChild;
    while (firstChild &&
        (firstChild.nodeType !== 3 || (firstChild.nodeValue || '').trim().length === 0) &&
        firstChild.nodeName !== 'CHAR' && firstChild.localName !== 'CHAR') {
        firstChild = firstChild.nextSibling;
    }

    let firstActualTextNode = null;
    if (firstChild && firstChild.nodeType === 3) {
        firstActualTextNode = firstChild;
    } else if (firstChild && (firstChild.nodeName === 'CHAR' || firstChild.localName === 'CHAR')) {
        const charChild = firstChild.firstChild;
        if (charChild && charChild.nodeType === 3) {
            firstActualTextNode = charChild;
        }
    }

    if (firstActualTextNode) {
        const combinedText = firstActualTextNode.nodeValue || '';
        const numberRegex = /^(\d+([\.\)]|번)|\d+\s+|[\u2460-\u2473])\s*/;
        if (numberRegex.test(combinedText)) {
            const newVal = combinedText.replace(numberRegex, '');
            const newNode = qDoc.createTextNode(newVal);
            if (firstActualTextNode.parentNode) {
                firstActualTextNode.parentNode.replaceChild(newNode, firstActualTextNode);
            }
        }
    }

    // 3. Inject
    const qNumber = 2;
    const newNumberStr = `${qNumber}. `;
    const charElem = qDoc.createElement('CHAR');
    charElem.appendChild(qDoc.createTextNode(newNumberStr));
    targetTextNode.insertBefore(charElem, targetTextNode.firstChild);

    console.log("\nAfter:");
    console.log(new XMLSerializer().serializeToString(firstVisualP));
}

testFix();
