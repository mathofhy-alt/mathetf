import fs from 'fs'

interface Pair {
    qA: {
        school: string
        year: string
        grade: string
        subject: string
        question_number: number
        plain_text: string
    }
    qB: {
        school: string
        year: string
        grade: string
        subject: string
        question_number: number
        plain_text: string
    }
    similarity: number
    isIdenticalText: boolean
}

function main() {
    const raw = fs.readFileSync('similar_pairs_result.json', 'utf-8')
    const pairs: Pair[] = JSON.parse(raw)

    const modified = pairs.filter(p => !p.isIdenticalText && p.similarity < 0.99)
    console.log(`Total non-identical modified pairs (< 0.99): ${modified.length}`)

    // Print top 15 distinct examples
    const seenText = new Set<string>()
    let printed = 0

    for (const p of modified) {
        const key = [p.qA.plain_text.slice(0, 20), p.qB.plain_text.slice(0, 20)].sort().join('|')
        if (seenText.has(key)) continue
        seenText.add(key)

        console.log(`\n==================================================`)
        console.log(`[Example ${printed + 1}] Similarity: ${(p.similarity * 100).toFixed(2)}%`)
        console.log(`--------------------------------------------------`)
        console.log(`[Q1] ${p.qA.school || 'Unknown'} (${p.qA.year || ''} - ${p.qA.subject || ''} Q${p.qA.question_number})`)
        console.log(p.qA.plain_text)
        console.log(`--------------------------------------------------`)
        console.log(`[Q2] ${p.qB.school || 'Unknown'} (${p.qB.year || ''} - ${p.qB.subject || ''} Q${p.qB.question_number})`)
        console.log(p.qB.plain_text)
        
        printed++
        if (printed >= 15) break
    }
}

main()
