
const fs = require('fs');
const { createClient } = require('@supabase/supabase-client');

function loadEnv() {
    const env = fs.readFileSync('.env.local', 'utf8');
    const lines = env.split('\n');
    lines.forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            process.env[match[1]] = match[2].trim();
        }
    });
}

async function dumpKyunggi() {
    loadEnv();
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data: questions, error } = await supabase
        .from('questions')
        .select('id, content_xml, question_number')
        .ilike('school', '%경기여고%')
        .limit(1);

    if (error) {
        console.error(error);
        return;
    }

    if (questions && questions.length > 0) {
        console.log("=== Kyunggi Girls Q1 ===");
        console.log(`ID: ${questions[0].id}`);
        console.log(`Num: ${questions[0].question_number}`);
        console.log("--- XML ---");
        console.log(questions[0].content_xml);
        console.log("===========");
    }
}

dumpKyunggi();
