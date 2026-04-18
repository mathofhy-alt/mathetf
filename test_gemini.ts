const { generateTags } = require('./src/lib/embeddings');
(async () => {
    try {
        const result = await generateTags('대수 문제: 2^x = 4일 때 x의 값을 구하시오.', '대수');
        console.log("RESULT:", result);
    } catch (e) {
        console.error(e);
    }
})();
