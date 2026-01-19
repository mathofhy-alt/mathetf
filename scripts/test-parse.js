const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'debug_section0.xml');

try {
    const xmlContent = fs.readFileSync(filePath, 'utf8');
    console.log(`Loaded XML: ${xmlContent.length} chars`);

    // --- The Logic from route.ts ---
    const rawParagraphs = xmlContent.split('</hp:p>');
    const questions = [];

    let currentQuestionContent = '';
    let currentQuestionNumber = 0;

    console.log(`Total Chunks: ${rawParagraphs.length}`);

    for (let i = 0; i < rawParagraphs.length; i++) {
        const rawP = rawParagraphs[i];
        if (!rawP.includes('<hp:p')) continue;

        const pTag = rawP + '</hp:p>';

        // Check for EndNote (Question Marker) in this paragraph
        const hasEndNote = /<hp:endNote>[\s\S]*?<hp:autoNum\s+num="(\d+)"\s+numType="ENDNOTE"/.exec(pTag);

        if (hasEndNote) {
            const num = parseInt(hasEndNote[1], 10);

            // console.log(`[Chunk ${i}] FOUND Start of Q${num}`);

            // 1. Convert current buffer to a question
            if (currentQuestionNumber > 0 && currentQuestionContent) {
                questions.push({
                    number: currentQuestionNumber,
                    contentLength: currentQuestionContent.length,
                    preview: currentQuestionContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 100) + '...'
                });
            }

            // 2. Start new question
            currentQuestionNumber = num;
            currentQuestionContent = pTag;
        } else {
            // Continuation
            if (currentQuestionNumber > 0) {
                // console.log(`[Chunk ${i}] Appending to Q${currentQuestionNumber} (${pTag.length} chars)`);
                currentQuestionContent += '\n' + pTag;
            }
        }
    }

    // Push last
    if (currentQuestionNumber > 0 && currentQuestionContent) {
        questions.push({
            number: currentQuestionNumber,
            contentLength: currentQuestionContent.length,
            preview: currentQuestionContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 100) + '...'
        });
    }

    console.log('--- Results ---');
    console.log(`Total Questions: ${questions.length}`);
    questions.forEach(q => {
        console.log(`Q${q.number}: ${q.contentLength} chars => "${q.preview}"`);
    });

} catch (e) {
    console.error(e);
}
