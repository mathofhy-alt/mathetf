// Explicit, read-only refresh. Never loaded by the test runner; all HTTP requests are GET.
require('./register.cjs');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const root = path.join(__dirname, '..');
const fixturePath = path.join(__dirname, 'fixtures/question-scope.json.gz');
const auditPath = path.join(__dirname, 'fixtures/source-link-audit.json');
const manifestBytes = fs.readFileSync(path.join(root, 'src/lib/questions/verified-mock-links.json'));
const links = JSON.parse(manifestBytes);
const fixture = JSON.parse(zlib.gunzipSync(fs.readFileSync(fixturePath)));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const env = dotenv.parse(fs.readFileSync(path.join(root, '.env.local')));
const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
async function getAll(table, params) {
    const result = [];
    for (let offset = 0; ; offset += 1000) {
        const url = new URL(`/rest/v1/${table}`, env.NEXT_PUBLIC_SUPABASE_URL);
        for (const [key, value] of Object.entries({ ...params, order: 'id.asc', offset, limit: 1000 })) url.searchParams.set(key, String(value));
        const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw Error(`GET ${table} failed: HTTP ${response.status}`);
        const rows = await response.json();
        result.push(...rows);
        if (rows.length < 1000) return result;
    }
}
const inList = values => `in.(${values.map(v => `"${v.replace(/"/g, '\\"')}"`).join(',')})`;
async function batches(values, table, column, select) {
    const result = [];
    for (let i = 0; i < values.length; i += 15) result.push(...await getAll(table, { select, [column]: inList(values.slice(i, i + 15)) }));
    return result;
}
async function main() {
    const materialIds = [...new Set(Object.values(links).flatMap(l => l.dbIds))];
    const grade2Id = 'fe34d2ea-2f6b-4c1a-a774-33ab238b2141';
    if (!materialIds.includes(grade2Id)) materialIds.push(grade2Id);
    const materials = await batches(materialIds, 'exam_materials', 'id', Object.keys(fixture.materials[0]).join(','));
    if (materials.length !== materialIds.length) throw Error('Incomplete material snapshot');
    const registeredGrade2 = await getAll('questions', { select: Object.keys(fixture.questions[0]).join(','), school: 'eq.전국연합', grade: 'eq.고2', year: 'eq.2020', semester: 'in.(11월,11월 모의고사)', work_status: 'eq.sorted' });
    const grade2Sources = [...new Set(registeredGrade2.map(q => q.source_db_id))];
    const sources = [...new Set([...Object.values(links).map(l => l.source), ...grade2Sources])];
    const questions = await batches(sources, 'questions', 'source_db_id', Object.keys(fixture.questions[0]).join(','));
    for (const [slug, link] of Object.entries(links)) {
        const found = questions.filter(q => q.source_db_id === link.source && q.work_status === 'sorted' && (!link.grade || q.grade === link.grade));
        if (found.length !== link.questionCount) throw Error(`Snapshot count differs from manifest: ${slug}: ${found.length}/${link.questionCount}`);
    }
    const grade2 = questions.filter(q => grade2Sources.includes(q.source_db_id) && q.grade === '고2' && q.work_status === 'sorted');
    if (grade2.length !== 30) throw Error('Expected 30 registered grade-2 questions');
    const row = audit.find(r => r.id === grade2Id);
    row.sourceIds = grade2Sources;
    row.expectedQuestionIds = grade2.map(q => q.id).sort();
    const oldMaterialCount = fixture.materials.length, oldQuestionCount = fixture.questions.length;
    const materialMap = new Map(fixture.materials.map(m => [m.id, m]));
    for (const material of materials) materialMap.set(material.id, material);
    fixture.materials = [...materialMap.values()].sort((a, b) => a.id.localeCompare(b.id));
    const sourceSet = new Set(sources);
    const questionMap = new Map(fixture.questions.filter(q => !sourceSet.has(q.source_db_id)).map(q => [q.id, q]));
    for (const question of questions) questionMap.set(question.id, question);
    fixture.questions = [...questionMap.values()].sort((a, b) => a.id.localeCompare(b.id));
    const meta = {
        capturedAt: new Date().toISOString(), method: 'GET only; existing snapshot plus all current mock-manifest sources',
        manifestSha256: crypto.createHash('sha256').update(manifestBytes).digest('hex'),
        mockLinkCount: Object.keys(links).length, materialCount: fixture.materials.length, questionCount: fixture.questions.length,
        oldMaterialCount, oldQuestionCount, fetchedMaterialCount: materials.length, fetchedQuestionCount: questions.length,
        auditedBundleCount: audit.length, grade2QuestionCount: grade2.length,
    };
    // Write only after every link and the registered grade-2 paper passes validation.
    fs.writeFileSync(fixturePath, zlib.gzipSync(JSON.stringify(fixture)));
    fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2) + '\n');
    fs.writeFileSync(path.join(__dirname, 'fixtures/question-scope.meta.json'), JSON.stringify(meta, null, 2) + '\n');
    console.log(JSON.stringify(meta, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
