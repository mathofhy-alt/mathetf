import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Question {
    id: string
    plain_text: string
    embedding: number[] | string | null
    school: string
    year: string
    grade: string
    subject: string
    question_number: number
}

function parseEmbedding(emb: any): number[] | null {
    if (!emb) return null
    if (Array.isArray(emb)) return emb
    if (typeof emb === 'string') {
        // string representation like '[0.1, 0.2, ...]'
        try {
            return JSON.parse(emb)
        } catch (e) {
            // alternative parsing
            return emb.replace(/[\[\]]/g, '').split(',').map(Number)
        }
    }
    return null
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0.0
    let normA = 0.0
    let normB = 0.0
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i]
        normA += vecA[i] * vecA[i]
        normB += vecB[i] * vecB[i]
    }
    if (normA === 0 || normB === 0) return 0
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

async function fetchAllQuestions(): Promise<Question[]> {
    const questions: Question[] = []
    let page = 0
    const pageSize = 1000
    let hasMore = true

    console.log('Fetching questions with embeddings...')

    while (hasMore) {
        const { data, error } = await supabase
            .from('questions')
            .select('id, plain_text, embedding, school, year, grade, subject, question_number')
            .not('embedding', 'is', null)
            .range(page * pageSize, (page + 1) * pageSize - 1)

        if (error) {
            console.error('Error fetching page:', page, error)
            break
        }

        if (!data || data.length === 0) {
            hasMore = false
        } else {
            for (const q of data) {
                const parsed = parseEmbedding(q.embedding)
                if (parsed) {
                    questions.push({
                        ...q,
                        embedding: parsed
                    })
                }
            }
            console.log(`Fetched ${questions.length} questions so far...`)
            if (data.length < pageSize) {
                hasMore = false
            } else {
                page++
            }
        }
    }

    return questions
}

async function main() {
    const questions = await fetchAllQuestions()
    console.log(`Loaded ${questions.length} questions with valid embeddings.`)

    const similarPairs: any[] = []

    console.log('Calculating similarities...')
    const N = questions.length

    for (let i = 0; i < N; i++) {
        const qA = questions[i]
        const vecA = qA.embedding as number[]

        for (let j = i + 1; j < N; j++) {
            const qB = questions[j]
            const vecB = qB.embedding as number[]

            const sim = cosineSimilarity(vecA, vecB)

            if (sim >= 0.90) {
                // Determine if texts are identical
                const textA = (qA.plain_text || '').trim()
                const textB = (qB.plain_text || '').trim()
                const isIdenticalText = textA === textB

                similarPairs.push({
                    qA: {
                        id: qA.id,
                        school: qA.school,
                        year: qA.year,
                        grade: qA.grade,
                        subject: qA.subject,
                        question_number: qA.question_number,
                        plain_text: textA
                    },
                    qB: {
                        id: qB.id,
                        school: qB.school,
                        year: qB.year,
                        grade: qB.grade,
                        subject: qB.subject,
                        question_number: qB.question_number,
                        plain_text: textB
                    },
                    similarity: sim,
                    isIdenticalText
                })
            }
        }
        if (i > 0 && i % 500 === 0) {
            console.log(`Processed ${i}/${N} questions. Found ${similarPairs.length} pairs.`)
        }
    }

    console.log(`Done. Total similar pairs (similarity >= 0.90): ${similarPairs.length}`)

    // Sort by similarity descending
    similarPairs.sort((a, b) => b.similarity - a.similarity)

    // Save results to file
    fs.writeFileSync('similar_pairs_result.json', JSON.stringify(similarPairs, null, 2))
    console.log('Saved results to similar_pairs_result.json')

    // Print summary stats
    const identicalCount = similarPairs.filter(p => p.isIdenticalText).length
    const modifiedCount = similarPairs.length - identicalCount
    console.log(`Identical text pairs: ${identicalCount}`)
    console.log(`Modified text pairs: ${modifiedCount}`)

    // Sample modified pairs to inspect
    console.log('\n--- Sample Modified Pairs (first 5) ---')
    const sampleModified = similarPairs.filter(p => !p.isIdenticalText).slice(0, 10)
    sampleModified.forEach((p, idx) => {
        console.log(`\n[Sample ${idx + 1}] Similarity: ${p.similarity.toFixed(4)}`)
        console.log(`Q1 (${p.qA.school} ${p.qA.year} Q${p.qA.question_number}):\n${p.qA.plain_text}`)
        console.log(`Q2 (${p.qB.school} ${p.qB.year} Q${p.qB.question_number}):\n${p.qB.plain_text}`)
        console.log('--------------------------------------------------')
    })
}

main().catch(err => console.error(err))
