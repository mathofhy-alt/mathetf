
const fs = require('fs');
const path = require('path');

const filePath = 'd:\\Dropbox\\안티그래비티\\송파구2025년2기말영동일고1공수2.hml';

try {
    const hmlContent = fs.readFileSync(filePath, 'utf8');

    console.log(`Read ${hmlContent.length} bytes.`);

    // 1. Identify Question Style IDs
    // Use strict whitespace \s to avoid matching 'LangId'
    const styleIdRegex = /<STYLE\s+[^>]*\sId="(\d+)"[^>]*Name="([^"]*문제[^"]*)"/g;
    const questionStyleIds = new Set();

    let match;
    while ((match = styleIdRegex.exec(hmlContent)) !== null) {
        questionStyleIds.add(match[1]);
        console.log(`Found Question Style: ID=${match[1]}, Name=${match[2]}`);
        console.log(`Context: ${hmlContent.substring(match.index, match.index + 100)}...`);
    }

    if (questionStyleIds.size === 0) {
        console.error("No Question Styles found!");
        process.exit(1);
    }

    const rawParagraphs = hmlContent.split(/<\/P>/i);
    let questionsFound = 0;

    for (const rawChunk of rawParagraphs) {
        if (!rawChunk.trim()) continue;
        const pBlock = rawChunk + '</P>';

        const styleMatch = /<P\s+[^>]*Style="(\d+)"/i.exec(pBlock);

        if (styleMatch && questionStyleIds.has(styleMatch[1])) {
            questionsFound++;
        }
    }

    console.log(`Total Questions Detected: ${questionsFound}`);

} catch (e) {
    console.error(e);
}
