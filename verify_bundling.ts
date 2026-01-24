import { parseHmlV2 } from './src/lib/hml-v2/parser';
import * as fs from 'fs';

async function verifyBundling() {
    const hmlPath = 'test_rich_table.hml';
    if (!fs.existsSync(hmlPath)) {
        console.error("Test HML not found");
        return;
    }

    const hmlContent = fs.readFileSync(hmlPath, 'utf8');
    const { questions } = parseHmlV2(hmlContent);

    console.log(`Parsed ${questions.length} questions.`);

    questions.forEach((q, i) => {
        const hasBundle = q.contentXml.includes('<?antigravity-binaries');
        console.log(`Q${q.questionNumber}: Bundled Binaries: ${hasBundle}`);

        if (hasBundle) {
            const match = q.contentXml.match(/<\?antigravity-binaries data="([^"]+)"\?>/);
            if (match) {
                const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
                const data = JSON.parse(decoded);
                console.log(` - Bundled ${data.length} images:`, data.map((d: any) => `${d.id} (${d.type})`));
            }
        }
    });
}

verifyBundling();
