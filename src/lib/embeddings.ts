import OpenAI from 'openai';

/**
 * Generates vector embeddings for the given text using OpenAI's text-embedding-3-small model.
 * The model produces 1536-dimensional vectors.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const apiKey = (process.env.OPENAI_API_KEY || '').trim();

    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is missing or empty in environment variables.");
    }

    const openai = new OpenAI({
        apiKey: apiKey,
    });

    try {
        // Sanitize input: Remove excessive whitespace
        const cleanedText = text.replace(/\s+/g, ' ').trim();

        if (!cleanedText) {
            throw new Error("Input text is empty");
        }

        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: cleanedText,
            encoding_format: "float",
        });

        return response.data[0].embedding;
    } catch (error) {
        console.error("Error generating embedding:", error);
        throw error;
    }
}
