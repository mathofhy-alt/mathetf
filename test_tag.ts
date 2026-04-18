import { generateTags } from './src/lib/embeddings';

async function test() {
    console.log('Testing #6: y=4로 둘러싸인 넓이...');
    const res6 = await generateTags('[과목: 대수] [학년: 고2] y=x^2-4x 와 y=4로 둘러싸인 넓이를 구하시오.', '대수');
    console.log('Result #6:', res6);

    console.log('Testing #7: 부등식 log...');
    const res7 = await generateTags('[과목: 대수] [학년: 고2] 부등식 log_4(3x-2) >= 1 / log_{x-2} 2 의 해를 구하시오.', '대수');
    console.log('Result #7:', res7);
    process.exit(0);
}
test();
