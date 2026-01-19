
import fs from 'fs';
import path from 'path';
import { parseHml } from '../src/lib/hml/parser';

const run = () => {
    const hmlPath = path.join(process.cwd(), '테스트.hml');
    if (!fs.existsSync(hmlPath)) {
        console.error("File not found");
        return;
    }
    const xml = fs.readFileSync(hmlPath, 'utf-8');
    const questions = parseHml(xml);

    console.log(`Parsed Count: ${questions.length}`);

    // Check for Duplicates
    const contentSet = new Set<string>();
    const duplicateIndices: number[] = [];

    questions.forEach((q, idx) => {
        // Hash content or use length+substring to identify strict duplicates
        const signature = q.content_xml.length + "_" + q.content_xml.substring(0, 50);

        if (contentSet.has(signature)) {
            duplicateIndices.push(idx + 1);
            console.log(`>> Duplicate Content Found at Q${idx + 1}`);
        } else {
            contentSet.add(signature);
        }
    });

    if (duplicateIndices.length > 0) {
        console.log(`❌ Found ${duplicateIndices.length} duplicates content-wise!`);
    } else {
        console.log(`✅ All ${questions.length} questions have distinct content.`);
    }

    // Dump IDs for verification
    questions.forEach(q => {
        console.log(`Q${q.question_number}: ${q.content_xml.length} bytes`);
    });
}

run();
