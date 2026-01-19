
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m"
};

function testLogic(text) {
    console.log(`Testing text: "${text}"`);

    // --- Logic from src/lib/hml/parser.ts ---
    const hasDate = /20\d\d/.test(text) || /년/.test(text) || /월/.test(text) || /일/.test(text);
    const hasTitle = /고사/.test(text) || /학기/.test(text) || /학년/.test(text) || /수학/.test(text) || /영역/.test(text);
    const isShort = text.length < 300;

    const numMatch = text.match(/^\s*(\d+)[\.|)]/);
    let startsWithValidQNum = false;

    if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        const isDateSequence = /^\s*\d+[\.\)\s]+\s*\d+/.test(text);
        // Logic as applied in Step 40
        const isLikelyDate = isDateSequence && (hasDate || hasTitle);

        if (num > 0 && num < 200 && !isLikelyDate) {
            startsWithValidQNum = true;
        }
    }

    const shouldRemove = (hasDate || hasTitle) && isShort && !startsWithValidQNum;
    // ----------------------------------------

    if (shouldRemove) {
        console.log(colors.green + "=> Result: REMOVED (Correctly identified as Header)" + colors.reset);
    } else {
        if (hasDate || hasTitle) {
            console.log(colors.red + "=> Result: KEPT (Failed to remove Header)" + colors.reset);
        } else {
            console.log(colors.green + "=> Result: KEPT (Identified as Question)" + colors.reset);
        }
    }
    console.log('---');
}

console.log("=== Verifying Fix for Date/Header Recognition ===\n");

// Case 1: User's reported issue
testLogic("12. 31. 기말고사");
testLogic("12. 31. 2학기 기말고사");

// Case 2: Standard Date
testLogic("2024. 12. 31.");
testLogic("2024년 3월 모의고사");

// Case 3: Proper Question 1 (Must be kept)
testLogic("1. 다음 물음에 답하시오.");
testLogic("1. 2와 5의 최소공배수는?"); // Specific tricky case: "1. 2" looks like date sequence

// Case 4: Ambiguous (Pure numbers)
testLogic("12. 31."); // Might fail if no keywords like 년/월/고사 are present
