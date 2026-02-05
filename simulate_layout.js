
const MAX_COL_HEIGHT = 53;
const PARA_WEIGHT = 3;
const IMAGE_WEIGHT = 10;
const GUTTER_HEIGHT = 16;
const TITLE_HEIGHT = 5;

function simulate(questionCounts) {
    let currentColumnHeight = TITLE_HEIGHT;
    let columnResults = [];
    let currentColumn = [];

    questionCounts.forEach((q, i) => {
        const questionHeight = (q.paras * PARA_WEIGHT) + (q.images * IMAGE_WEIGHT);
        const totalRequiredSpace = questionHeight + GUTTER_HEIGHT;

        if (currentColumnHeight + totalRequiredSpace > MAX_COL_HEIGHT) {
            columnResults.push(currentColumn);
            currentColumn = [];
            currentColumnHeight = 0;
        }

        currentColumn.push({ index: i + 1, height: totalRequiredSpace });
        currentColumnHeight += totalRequiredSpace;
    });

    if (currentColumn.length > 0) {
        columnResults.push(currentColumn);
    }

    columnResults.forEach((col, i) => {
        console.log(`Column ${i + 1}:`);
        col.forEach(q => console.log(`  Q${q.index}: ${q.height} lines`));
        const total = col.reduce((sum, q) => sum + q.height, 0);
        console.log(`  Total used: ${total} / ${MAX_COL_HEIGHT} (Start offset: ${i === 0 ? TITLE_HEIGHT : 0})`);
    });
}

console.log("--- Simulation: 3 Paragraphs per Question ---");
simulate([
    { paras: 3, images: 0 },
    { paras: 3, images: 0 },
    { paras: 3, images: 0 },
    { paras: 3, images: 0 }
]);

console.log("\n--- Simulation: 4 Paragraphs per Question ---");
simulate([
    { paras: 4, images: 0 },
    { paras: 4, images: 0 },
    { paras: 4, images: 0 },
    { paras: 4, images: 0 }
]);
