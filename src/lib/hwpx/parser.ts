
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from 'xmldom';

export interface QuestionBoundary {
    questionIndex: number;
    startPos: number;
    endPos: number;
    xml: string;
    equationScripts: string[];
}

export interface ParserResult {
    boundaries: QuestionBoundary[];
    sectionLength: number;
}

export async function parseQuestionsFromHwpx(fileBuffer: Buffer | Uint8Array): Promise<ParserResult> {
    const zip = await JSZip.loadAsync(fileBuffer);
    const section0Xml = await zip.file("Contents/section0.xml")?.async("string");

    if (!section0Xml) throw new Error("Invalid HWPX: Missing Contents/section0.xml");

    const doc = new DOMParser().parseFromString(section0Xml, "text/xml");

    let sec = doc.getElementsByTagName("hs:sec")[0];
    if (!sec) sec = doc.getElementsByTagName("hp:sec")[0];
    if (!sec && doc.documentElement.nodeName.endsWith(":sec")) sec = doc.documentElement;
    if (!sec) throw new Error("Parser: No section root found");

    const paragraphs: Element[] = [];
    const children = Array.from(sec.childNodes);
    for (const n of children) {
        if (n.nodeType === 1 && (n.nodeName === "hp:p" || n.nodeName === "p")) {
            paragraphs.push(n as Element);
        }
    }

    const boundaries: QuestionBoundary[] = [];
    let lastEndNoteIndex = -1;
    let questionCounter = 1;

    // Helper: Get text content
    const getText = (node: Element): string => {
        let text = "";
        const runTexts = node.getElementsByTagName("hp:t");
        for (let k = 0; k < runTexts.length; k++) {
            text += runTexts[k].textContent || "";
        }
        return text.trim();
    };

    // Helper: EndNote Check
    const hasEndNote = (node: Element): boolean => {
        const xml = new XMLSerializer().serializeToString(node);
        if (xml.includes(":endNote") || xml.includes(":endnote")) return true;
        if (xml.includes('numType="ENDNOTE"') || xml.includes('numType="endnote"')) return true;
        return false;
    };

    // Helper: Choice Check
    const isChoiceParagraph = (node: Element): boolean => {
        const text = getText(node);
        if (/[①-⑮]/.test(text)) return true;
        if (/^(\d+\)|[ㄱ-ㅎ가-하]\))/.test(text)) return true;
        if (/^[1-5]\./.test(text)) return true;
        return false;
    };

    // [1] STRONG START (Hard Boundary)
    const isStrongStart = (node: Element): boolean => {
        const text = getText(node);

        // A) Explicit Question Number
        // Matches: "문제 1", "문 1"
        if (/^(문제\s*\d+|문\s*\d+)/.test(text)) return true;

        // Matches: "1.", "1)", "[1]"
        // Beware of choice: "1." is ambiguous. But usually Exam Question > Choice.
        // We will assume "1." at start of paragraph is a Question Number unless context proves otherwise (which is hard in stateless).
        // Added: \d+\), \[\d+\]
        if (/^(\d+\.|[①-⑮]|\d+\)|\[\d+\])/.test(text)) {
            // Refinement: If it matches "1." but follows a pattern of choices?
            // "1." is extremely common for questions. "1)" is common for choices but also questions.
            // We favor "New Question" to avoid merging independent questions.
            // If we split a single question into two (Q and its choice 1), it's bad but better than merging two Qs.
            // However, our loop logic `if (worksAsStart && !worksAsChoice)` handles the protection against choice splitting.
            return true;
        }

        // B) Directional Phrases (For "Next" questions)
        // e.g. "다음 글을 읽고 물음에 답하시오", "다음은 ..."
        if (/^다음\s+(글|표|그래프|자료|그림)/.test(text)) return true;
        if (text.startsWith("다음은")) return true;

        // C) Math Keywords (Legacy + Expanded)
        const keywords = [
            "직선", "곡선", "함수", "정수", "실수", "자연수", "집합", "미분", "적분", "확률", "로그", "삼각", "행렬", "수열", "극한",
            "방정식", "부등식", "다항식", "좌표", "백터", "그래프", "이차", "삼차"
        ];
        for (const kw of keywords) {
            if (text.startsWith(kw)) return true;
        }

        return false;
    };

    const normalizeParagraph = (p: Element): string | null => {
        const clone = p.cloneNode(true) as Element;
        const autoNums = clone.getElementsByTagName("hp:autoNum");
        for (let i = 0; i < autoNums.length; i++) {
            const type = autoNums[i].getAttribute("numType");
            if (type === "ENDNOTE" || type === "endnote") {
                if (autoNums[i].parentNode) autoNums[i].parentNode?.removeChild(autoNums[i]);
            }
        }

        let tText = "";
        const ts = clone.getElementsByTagName("hp:t");
        for (let j = 0; j < ts.length; j++) tText += ts[j].textContent || "";

        const hasCtrl = clone.getElementsByTagName("hp:ctrl").length > 0 || clone.getElementsByTagName("hp:pic").length > 0;

        if (!tText.trim() && !hasCtrl) return null;
        return new XMLSerializer().serializeToString(clone);
    };

    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];

        if (hasEndNote(p)) {
            let endIndex = i;

            // [TRUE] Choice Lock with Hard Stop
            let noChoiceCount = 0;
            const forwardLimit = 18; // Max expansion

            for (let k = i + 1; k < Math.min(paragraphs.length, i + forwardLimit); k++) {
                const pk = paragraphs[k];

                // [HARD STOP] If next paragraph is Strong Start, STOP immediately.
                // Even if it looks like a choice (e.g. "1." vs "1."), if it triggers StrongStart, we respect it as New Q.
                // Wait, "1." triggers isStrongStart. 
                // If Q(N) choices are "1. 2. 3.", and we forward scan "1.", we might stop falsely?
                // Refinement: isStrongStart includes "1.".
                // If we are IN a choice block, "2." is StrongStart? Yes.
                // This logic is risky if StrongStart includes "1. 2. 3.".
                // Let's allow Choice check to override StrongStart IF it fits the choice pattern.

                const worksAsChoice = isChoiceParagraph(pk);
                const worksAsStart = isStrongStart(pk);

                if (worksAsStart && !worksAsChoice) {
                    // It's a start, and definitely NOT a choice (e.g. "Question 5" or "Function f(x)")
                    break;
                }

                if (hasEndNote(pk)) {
                    // Hit next answer/endnote
                    break;
                }

                if (worksAsChoice) {
                    endIndex = k;
                    noChoiceCount = 0;
                } else {
                    noChoiceCount++;
                    if (noChoiceCount > 1) break; // Strict 1 line tolerance
                }
            }

            // [Backwards] Find Start
            const stopIndex = lastEndNoteIndex + 1;
            let startIndex = stopIndex;

            let finalXml = "";
            let ssCount = 0;
            let enCount = 0;
            const equationScripts: string[] = [];

            for (let k = startIndex; k <= endIndex; k++) {
                if (isStrongStart(paragraphs[k])) ssCount++;
                if (hasEndNote(paragraphs[k])) enCount++;

                // Extract Math Scripts
                const eqs = paragraphs[k].getElementsByTagName("hp:equation");
                for (let j = 0; j < eqs.length; j++) {
                    const scripts = eqs[j].getElementsByTagName("hp:script");
                    if (scripts.length > 0) {
                        equationScripts.push(scripts[0].textContent || "");
                    }
                }

                const norm = normalizeParagraph(paragraphs[k]);
                if (norm) finalXml += norm;
            }

            // [QA3] LOG
            const combinedText = finalXml.replace(/<[^>]+>/g, "").trim();
            const textLen = combinedText.length;
            const hasChoice = /[①-⑤]/.test(combinedText) || /\d+\)/.test(combinedText);

            console.log(`[QA3] q=${questionCounter} idx=[${startIndex}-${endIndex}] pCount=${endIndex - startIndex + 1} textLen=${textLen} eqCount=${equationScripts.length} choice=${hasChoice ? 'Y' : 'N'} ssCount=${ssCount} enCount=${enCount}`);

            if (finalXml.length > 0) {
                boundaries.push({
                    questionIndex: questionCounter,
                    startPos: startIndex,
                    endPos: endIndex,
                    xml: finalXml,
                    equationScripts
                });
                questionCounter++;
            }

            // Update pointers
            lastEndNoteIndex = endIndex;
            i = endIndex;
        }
    }

    console.log(`[QA3] totalQuestions=${questionCounter - 1}`);

    return {
        boundaries,
        sectionLength: section0Xml.length
    };
}
