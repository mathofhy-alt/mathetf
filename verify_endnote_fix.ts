
function flattenEndnotes(xml: string): string {
    // Matches <ENDNOTE>...</ENDNOTE> including newlines
    const endnoteRegex = /<ENDNOTE>(.*?)<\/ENDNOTE>/gs;

    let match;
    const matches: string[] = [];
    const contents: string[] = [];

    endnoteRegex.lastIndex = 0;

    while ((match = endnoteRegex.exec(xml)) !== null) {
        matches.push(match[0]);
        contents.push(match[1]);
    }
    let newXml = xml;

    if (matches.length > 0) {
        for (let i = 0; i < matches.length; i++) {
            // Remove the Endnote from the original location
            newXml = newXml.replace(matches[i], '');

            // [CRITICAL FIX] Unwrap <PARALIST> because SECTION cannot contain PARALIST as direct child
            let contentToInject = contents[i];
            if (contentToInject.includes('<PARALIST')) {
                // Extract inner content of PARALIST (which are P tags)
                // Use non-greedy match for content
                const pMatch = contentToInject.match(/<PARALIST[^>]*>([\s\S]*?)<\/PARALIST>/i);
                if (pMatch) {
                    console.log('Unwrapped PARALIST successfully');
                    contentToInject = pMatch[1];
                } else {
                    console.warn('Failed to unwrap PARALIST');
                }
            }

            // Prepend content to the beginning
            newXml = contentToInject + newXml;
        }
    }
    return newXml;
}

const sampleXml = `
<P><TEXT>Question Text <ENDNOTE><PARALIST LineWrap="Break"><P><TEXT>Hidden Content</TEXT></P></PARALIST></ENDNOTE></TEXT></P>
`;

const result = flattenEndnotes(sampleXml);

console.log('Original Length:', sampleXml.length);
console.log('Result Length:', result.length);
console.log('--- Result XML ---');
console.log(result);
console.log('------------------');

if (result.includes('<PARALIST')) {
    console.error('FAIL: Output still contains PARALIST');
    process.exit(1);
} else if (!result.includes('Hidden Content')) {
    console.error('FAIL: Hidden Content lost');
    process.exit(1);
} else {
    console.log('SUCCESS: PARALIST removed and content preserved');
}
