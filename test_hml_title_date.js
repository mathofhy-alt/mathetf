
const { generateHmlFromTemplate } = require('./src/lib/hml-v2/generator');

console.log('Running Title/Date Injection Test...');

const mockTemplate = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?><HWPML SubVersion="8.0.0.0" Version="2.8"><HEAD SecCnt="1"></HEAD><BODY><SECTION><P><TEXT>{{TITLE}}</TEXT></P><P><TEXT>{{DATE}}</TEXT></P><P><TEXT>Body Content</TEXT></P></SECTION></BODY><TAIL></TAIL></HWPML>`;

const mockQuestions = [{
    question: { content_xml: '<P><TEXT>Question 1</TEXT></P>', question_number: 1 },
    images: []
}];

const options = {
    title: "Test Exam",
    date: "2024년 5월 20일"
};

try {
    const result = generateHmlFromTemplate(mockTemplate, mockQuestions, options);

    if (result.hmlContent.includes('Test Exam') && result.hmlContent.includes('2024년 5월 20일')) {
        console.log('SUCCESS: Title and Date injected correctly.');
        console.log('Snippet:', result.hmlContent.substring(result.hmlContent.indexOf('Test Exam'), result.hmlContent.indexOf('Body Content')));
    } else {
        console.error('FAILURE: Title or Date NOT found.');
        console.log('Content:', result.hmlContent);
    }

} catch (e) {
    console.error('Error:', e);
}
