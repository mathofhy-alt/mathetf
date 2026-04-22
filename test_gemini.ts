import { generateTags } from './src/lib/embeddings';
import * as dotenv from 'dotenv';
dotenv.config({path:'.env.local'});

async function test() {
    try {
        console.log('ApiKey check:', process.env.GEMINI_API_KEY ? 'Set' : 'Missing');
        console.log('ApiKey value:', process.env.GEMINI_API_KEY!.substring(0, 5) + '...');
        const res = await generateTags('다항식의 곱셈 문제입니다. $x^2 + 2x$', '공통수학1');
        console.log('Result:', res);
    } catch(e) {
        console.error('ERROR:', e);
    }
}
test();
