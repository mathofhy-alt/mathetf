/**
 * HML V2 Types (Zero-Base Implementation)
 * 
 * Clean type definitions for HML parsing and generation
 */

// ============== Extracted Data (from Parser) ==============

/**
 * Image data extracted from HML TAIL > BINDATASTORAGE
 */
export interface ExtractedImage {
    /** Original ID from BINITEM/BINDATA (e.g., "1" or "BIN0001") */
    binId: string;
    /** Image format: jpg, png, gif (lowercase) */
    format: string;
    /** Pure Base64 data (no data-uri prefix, no whitespace) */
    data: string;
    /** Original binary size in bytes (NOT Base64 string length) */
    sizeBytes: number;
}

/**
 * Question data extracted from HML BODY
 */
export interface ExtractedQuestion {
    /** 1-based question number */
    questionNumber: number;
    /** XML content of the question (P tags, TABLE, etc.) */
    contentXml: string;
    /** Plain text preview (first 300 chars) */
    plainText: string;
    /** Array of image IDs referenced in this question */
    imageRefs: string[];
    /** Array of HWP equation scripts found in this question */
    equationScripts: string[];
}

/**
 * Result from parsing an HML file
 */
export interface ParseResult {
    questions: ExtractedQuestion[];
    images: ExtractedImage[];
    /** Original HEAD content for template preservation */
    headXml?: string;
}

// ============== Database Models ==============

/**
 * Question stored in database
 */
export interface DbQuestion {
    id: string;
    question_number: number;
    content_xml: string;
    plain_text: string;
    // ... other metadata fields
}

/**
 * Image stored in database (linked to question)
 */
export interface DbQuestionImage {
    id: string;
    question_id: string;
    original_bin_id: string;
    format: string;
    data: string;
    size_bytes: number;
    created_at: string;
}

// ============== Generator Input ==============

/**
 * Question with images for HML generation
 */
export interface QuestionWithImages {
    question: DbQuestion;
    images: DbQuestionImage[];
}

/**
 * Result from generating an HML file
 */
export interface GenerateResult {
    /** Complete HML XML content */
    hmlContent: string;
    /** Number of questions included */
    questionCount: number;
    /** Number of images included */
    imageCount: number;
}
