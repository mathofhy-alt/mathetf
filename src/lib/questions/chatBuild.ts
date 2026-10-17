/**
 * 'AI로 만들기' 한 번의 요청 처리 — 대화 → 조건 → 후보 → 문항 고르기 → 안내 문구 (2026-10-11).
 * 라우트(api/pro/chat-generate)와 대량 시험 스크립트(scratch/chat_eval.ts)가 같은 코드를 쓰려고 떼어 냈다.
 * DB 호출은 callTopic 으로 받는다(라우트 = 사용자 범위·제외 목록, 시험 = 전체).
 */
import { pickSpread, planFromChat, relevant, usageTotals, type Candidate, type ChatPlan, type ChatTurn, type ConceptCatalog } from './chatPlan';

export const CURRICULUM_PAIR: Record<string, string> = {
    '수학I': '대수', '대수': '수학I', '수학II': '미적분I', '미적분I': '수학II', '미적분': '미적분II', '미적분II': '미적분',
    '수학(상)': '공통수학1', '공통수학1': '수학(상)', '수학(하)': '공통수학2', '공통수학2': '수학(하)', '기하와벡터': '기하', '기하': '기하와벡터',
};

export async function embedText(text: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST', signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${(process.env.OPENAI_API_KEY || '').trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    });
    if (!res.ok) throw new Error(`임베딩 오류 (${res.status})`);
    const j = await res.json();
    usageTotals.embedTokens += j.usage?.total_tokens || 0;
    return j.data[0].embedding;
}

/**
 * 강사들이 쓰는 줄임말·숫자 표기를 목록 이름으로(10/11 100문장 시험: '미적분1' 을 2015 수학II 로 읽고, 과목을 말했는데도 짝 과목을 못 가렸다)
 */
export function normalizeAsk(t: string): string {
    // 공통수학을 먼저 — '공통수학2' 의 '수학2' 를 수학II 로 바꿔 버렸다(10/11 3차 시험)
    return t
        .replace(/공통\s*수학\s*1|공수\s*1/g, '공통수학1').replace(/공통\s*수학\s*2|공수\s*2/g, '공통수학2')
        .replace(/미적분\s*(1|Ⅰ|i)(?![0-9I])/gi, '미적분I').replace(/미적분\s*(2|Ⅱ|ii)(?![0-9I])/gi, '미적분II')
        .replace(/(?<!공통)수학\s*(1|Ⅰ)(?![0-9I])/g, '수학I').replace(/(?<!공통)수학\s*(2|Ⅱ)(?![0-9I])/g, '수학II')
        .replace(/(^|\s)수\s?1(?![0-9])/g, '$1수학I').replace(/(^|\s)수\s?2(?![0-9])/g, '$1수학II')
        .replace(/확통/g, '확률과통계').replace(/기벡/g, '기하와벡터');
}
/** 강사가 콕 집은 과목(정규화한 말 기준) — 있으면 짝 과목을 붙이지 않는다. 긴 이름부터(미적분II 가 미적분으로 읽히지 않게) */
function namedSubjects(said: string, subjects: string[]): string[] {
    let rest = said; const found: string[] = [];
    for (const n of [...subjects].sort((a, b) => b.length - a.length)) if (rest.includes(n)) { found.push(n); rest = rest.split(n).join(' '); }
    return found;
}

const STOP = new Set(['문제', '문항', '쉬운', '어려운', '중간', '난이도', '킬러', '위주', '담아줘', '만들어줘', '시험지', '전부', '섞어서', '활용', '이용', '구하는', '구하기', '응용', '계산', '그래프', '기본', '정도', '대비', '범위', '전체', '아무', '단원']);
/** 요청 말 조각이 태그 이름에 들어 있는 정도로 태그를 찾는다. 두 조각 이상 겹치는 태그, 또는 4자 이상 한 조각이 3개 이하 태그에만 들어 있을 때 */
function lexicalTags(said: string, concepts: ConceptCatalog): string[] {
    const tokens = [...new Set(said.split(/[\s,.!?·/]+/).map(w => w.replace(/(으로|에서|부터|까지|이랑|하고|은|는|이|가|을|를|의|에|로|와|과|도|만)$/, '')).filter(w => w.length >= 2 && !STOP.has(w) && !/\d/.test(w)))];
    if (!tokens.length) return [];
    const all = [...new Set(Object.values(concepts).flatMap(o => Object.keys(o)))];
    const scored = all.map(t => ({ t, n: tokens.filter(w => t.replace(/[#\s]/g, '').includes(w)).length })).filter(x => x.n > 0);
    const max = Math.max(0, ...scored.map(x => x.n));
    if (max >= 2) return scored.filter(x => x.n === max).map(x => x.t).slice(0, 4);
    const strong = tokens.filter(w => w.length >= 4).map(w => all.filter(t => t.replace(/[#\s]/g, '').includes(w))).filter(l => l.length > 0 && l.length <= 3);
    return [...new Set(strong.flat())].slice(0, 4);
}

/** 숫자 뒤 '로/으로' — 3·6·10(삼·육·십)은 '으로' */
const ro = (n: number) => /(^|[^0-9])(3|6)$|0$/.test(String(n)) ? '으로' : '로';
const short = (t: string) => t.replace('|', ' ');
function scopeText(plan: ChatPlan) {
    const units = [...new Set(plan.targets.map(t => t.split('|')[1]))];
    const subjects = [...new Set(plan.targets.map(t => t.split('|')[0]))];
    if (units.length === 1) return `${subjects.join('·')} ${units[0]}`;
    // 단원이 많으면 과목으로 줄인다 — 34개 단원을 다 늘어놓은 답이 나갔다(10/12 실사용)
    return plan.targets.length <= 4 ? plan.targets.map(short).join(', ') : `${subjects.join('·')} ${units.length}개 단원`;
}

/** targets 안(또는 [] = 전체)에서 후보. withQuery=false 면 벡터 거리 없이(전체를 벡터로 훑지 않게) */
export type CallTopic = (plan: ChatPlan, targets: string[], query: number[] | null) => Promise<Candidate[]>;

export type BuildResult = { reply: string; plan: ChatPlan; by: string; chosen: Candidate[]; widened: boolean };

/** 문항 id → 개념 태그(태그별로 번갈아 담을 때만 쓴다) */
export type ConceptsOf = (ids: string[]) => Promise<Map<string, string[]>>;
/** 문항 id → 원본 문항 번호(시험지 한 회차를 통째로 담을 때 번호 순서로) */
export type NumbersOf = (ids: string[]) => Promise<Map<string, number>>;

/**
 * [10/17] 한 회차를 통째로 달라는 말인가 — '26년1중간중동고1학년'(대표). AI 가 매번 단원·난이도를 임의로 골라 20문항 시험에서 6개만 담았다.
 * 학교(모의고사 아님)·연도 하나·학기 하나가 정해졌고, 단원·난이도·유형 같은 좁히는 말이 없으면 그 회차 전부.
 */
function wholeExamAsk(plan: ChatPlan, said: string, unitHits: string[]): boolean {
    const f = plan.filters;
    const school = f.schools.filter(x => !/^(평가원|수능|전국연합)$/.test(x));
    if (!school.length || f.years.length !== 1 || f.semesters.length !== 1) return false;
    if (unitHits.length || plan.keywords.length) return false;
    return !/난이도|쉬운|어려운|킬러|준킬러|레벨|lv|단원|유형|비슷|변형|서술|서답|객관식|주관식|\d+\s*점/i.test(said);
}

export async function buildFromChat(rawMessages: ChatTurn[], concepts: ConceptCatalog, maxCount: number, lastPlan: ChatPlan | null, callTopic: CallTopic, conceptsOf?: ConceptsOf, numbersOf?: NumbersOf): Promise<BuildResult> {
    const messages = rawMessages.map(m => m.role === 'user' ? { ...m, content: normalizeAsk(m.content) } : m);
    const plan = await planFromChat(messages, concepts, maxCount, lastPlan);
    // 강사가 과목을 말하지 않았으면 2015·2022 짝 과목의 같은 단원을 같이 넣는다 — 프롬프트로 시켜도 가끔 한쪽만 골랐다(10/11 실측: 수학II 만)
    const said = messages.filter(m => m.role === 'user').map(m => m.content).join(' ');
    const named = namedSubjects(said, [...new Set(Object.keys(concepts).map(t => t.split('|')[0]))]);
    if (named.length) {
        const keep = plan.targets.filter(t => named.includes(t.split('|')[0]));
        // 과목만 말하고 단원을 안 정했으면(확통 전범위) 그 과목 모든 단원 — AI 가 [] 로 두면 전체 과목에서 골라 엉뚱했다(10/11 2차)
        plan.targets = keep.length ? keep : !plan.keywords.length && !plan.concepts.length ? Object.keys(concepts).filter(t => named.includes(t.split('|')[0])) : plan.targets;
    }
    // 모의고사·수능 문항은 DB 에 2022 과정 이름(대수·미적분I·미적분II·기하와벡터)으로 들어 있다 — '수능 미적분'·'고2 수학1' 처럼 콕 집어도 짝을 붙인다(10/12: 0문항)
    const mockScope = plan.filters.kinds.includes('mock') || plan.filters.schools.some(x => /평가원|수능|전국연합/.test(x));
    if ((mockScope || !named.length) && !/20(15|22)\s*(개정|과정)/.test(said)) {
        const add = plan.targets.map(t => { const [s, u] = t.split('|'); return `${CURRICULUM_PAIR[s]}|${u}`; }).filter(t => concepts[t] && !plan.targets.includes(t));
        plan.targets.push(...add);
    }
    // 고3 모의고사·수능 말투의 '공통' = 수학I·수학II(대수·미적분I) — 공통수학1·2(고1)로 읽어 0문항이 났다(10/12 실사용 '고3 평가원 공통')
    const mockTalk = /수능|평가원|모의|학평|고3/.test(said) || plan.filters.kinds.includes('mock') || plan.filters.grades.includes('고3');
    if (mockTalk && /공통(?!수학)/.test(said) && !/공통수학[12]/.test(said)) {
        const common = Object.keys(concepts).filter(t => /^(수학I|수학II|대수|미적분I)\|/.test(t));
        const kept = plan.targets.filter(t => common.includes(t));
        plan.targets = kept.length ? kept : common;
        plan.concepts = plan.concepts.filter(c => plan.targets.some(t => concepts[t]?.[c]));
        plan.unsupported = plan.unsupported.split(/[,·]/).map(x => x.trim()).filter(x => x && !/공통|선택/.test(x)).join(', ');
    }
    // 배점(2·3·4점) — 모의고사 원본 PDF 에서 읽어 question_points 표에 채웠다(10/13, 11,272문항). AI 가 빠뜨려도 말에 있으면 건다. 본문 키워드로 찾으면 0문항('3점배점')
    const pts = [...said.matchAll(/([234])\s*점(?!\s*대)/g)].map(m => Number(m[1]));
    plan.keywords = plan.keywords.filter(k => !/\d\s*점|배점/.test(k));
    if (pts.length && !plan.filters.points.length) plan.filters.points = [...new Set(pts)];
    if (plan.filters.points.length) {
        plan.filters.kinds = ['mock'];   // 배점은 모의고사·수능에만 있다(사관·경찰대·내신 없음)
        plan.unsupported = plan.unsupported.split(/[,·]/).map(x => x.trim()).filter(x => x && !/점|배점/.test(x)).join(', ');
    }
    if (plan.action === 'ask') return { reply: plan.reply, plan, by: 'ask', chosen: [], widened: false };

    // '중간고사 대비' 의 '대비' 는 범위 — 그 회차 시험 문항으로 거르지 않는다(10/11 6차: '2학기 중간 대비 킬러' → 2학기중간 문항만)
    if (/대비/.test(said) && !/기출|나온|출제된/.test(said)) plan.filters.semesters = [];
    // 강사 말에 단원 이름이 낱말로 있으면 그 단원을 꼭 넣는다(10/11 6차: '이항정리 계수' → AI 가 다항식 단원을 골랐다. 실제는 확률과통계|이항정리)
    const unitHits = Object.keys(concepts).filter(t => { const u = t.split('|')[1]; return u.length >= 3 && (said.startsWith(u) || said.includes(' ' + u)); });
    if (unitHits.length && !plan.targets.some(t => unitHits.includes(t))) {
        plan.targets = unitHits;
        plan.concepts = plan.concepts.filter(c => unitHits.some(t => concepts[t]?.[c]));
    }

    // [10/17] 한 회차 통째로 — 단원·난이도·주제 없이 그 시험 문항 전부를 원본 번호 순서로(과목을 말했으면 그 과목만)
    if (wholeExamAsk(plan, said, unitHits)) {
        const keep = named.length ? plan.targets.filter(t => named.includes(t.split('|')[0])) : [];
        const whole: ChatPlan = { ...plan, targets: keep, concepts: [], keywords: [], topic: '', topicLabel: '', minDifficulty: 1, maxDifficulty: 10, fillRest: false };
        const all = await callTopic(whole, keep, null);
        const nums = numbersOf && all.length ? await numbersOf(all.map(c => c.id)) : new Map<string, number>();
        const chosen = [...all].sort((a, b) => (nums.get(a.id) ?? 999) - (nums.get(b.id) ?? 999)).slice(0, maxCount);
        const fl = whole.filters;
        const tag = [fl.years.join('·') + '년', fl.grades.join('·'), fl.semesters.join('·'), fl.schools.join('·')].filter(Boolean).join(' · ');
        const reply = chosen.length
            ? `[${tag}] 이 시험 문항 ${chosen.length}개를 원래 번호 순서대로 담았어요.${all.length > maxCount ? ` (전체 ${all.length}개 중 ${maxCount}개까지만 담을 수 있어요.)` : ''}`
            : `[${tag}] 이 시험 문항을 찾지 못했어요. 학교 이름이나 연도·학기를 한 번 더 확인해 주세요.`;
        return { reply, plan: { ...whole, count: chosen.length || plan.count }, by: 'whole_exam', chosen, widened: false };
    }

    // 요청 글자와 태그 이름이 직접 겹치면 그 태그를 쓴다 — AI 가 태그를 못 고르거나 엉뚱한 단원을 골랐을 때(10/11 3차: '삼각함수 덧셈정리' → 0문항)
    // 단, AI 가 태그·키워드를 하나도 못 골랐을 때만, AI 가 고른 단원 안의 태그를 먼저(4차 시험: 넓게 적용했더니 '원의 접선' 을 이차곡선으로 엎었다)
    if (!plan.concepts.length && !plan.keywords.length) {
        const lex = lexicalTags(said, concepts);
        const inside = lex.filter(c => plan.targets.some(t => concepts[t]?.[c]));
        if (inside.length) plan.concepts = inside;
        else if (lex.length && !plan.targets.length) {
            plan.concepts = lex;
            plan.targets = Object.keys(concepts).filter(t => lex.some(c => concepts[t][c]));
        }
    }
    // 미분·적분이 붙은 지수·로그·삼각함수는 미적분II(2015 미적분) — AI 가 수학I 지수함수 단원으로 자주 샜다(10/11 7차)
    if (/미분|도함수|적분/.test(said) && plan.targets.length && plan.targets.every(t => /^(수학I|대수)\|(지수|로그|삼각)/.test(t))) {
        const calc = /적분/.test(said) && !/미분/.test(said) ? '여러가지적분법' : '여러가지미분법';
        plan.targets = Object.keys(concepts).filter(t => /^(미적분II|미적분)\|/.test(t) && t.endsWith(calc));
        plan.concepts = plan.concepts.filter(c => plan.targets.some(t => concepts[t]?.[c]));
    }
    // 고른 태그 중 강사 말 조각이 하나도 안 들어간 태그는 뺀다 — 들어간 태그가 하나라도 있을 때만(10/11: '인수분해' → '#곱셈공식' 섞임)
    {
        const toks = said.split(/[\s,.!?·/]+/).map(w => w.replace(/(으로|에서|부터|까지|은|는|이|가|을|를|의|에|로|와|과|도|만)$/, '')).filter(w => w.length >= 2 && !STOP.has(w) && !/\d/.test(w));
        const has = (c: string) => toks.some(w => c.replace(/[#\s]/g, '').includes(w));
        if (plan.concepts.some(c => toks.some(w => w.length >= 3 && c.replace(/[#\s]/g, '').includes(w)))) plan.concepts = plan.concepts.filter(has);
        // 요청에 주제가 여럿인데 한쪽 태그가 통째로 빠졌으면 보탠다('치환적분 부분적분' → 부분적분 태그 0, 7차)
        const subj = new Set(plan.targets.map(t => t.split('|')[0]));
        for (const w of toks.filter(w => w.length >= 4 && !plan.concepts.some(c => c.includes(w)))) {
            const add = [...new Set(Object.entries(concepts).filter(([t]) => !subj.size || subj.has(t.split('|')[0])).flatMap(([, o]) => Object.keys(o).filter(c => c.replace(/[#\s]/g, '').includes(w))))];
            if (add.length && add.length <= 6 && plan.concepts.length) {
                plan.concepts.push(...add);
                for (const t of Object.keys(concepts)) if (add.some(c => concepts[t][c]) && (!subj.size || subj.has(t.split('|')[0])) && !plan.targets.includes(t)) plan.targets.push(t);
            }
        }
        plan.concepts = [...new Set(plan.concepts)].slice(0, 8);
    }
    // 단원 이름 수준의 키워드는 범위를 좁히기만 한다('기하 벡터' → '벡터' 키워드 1문항, 10/11 3차) — 단원 이름에 들어 있는 말은 뺀다
    plan.keywords = plan.keywords.filter(k => { const kk = k.replace(/\s+/g, ''); return !plan.targets.some(t => { const u = t.split('|')[1]; return u.includes(kk) || kk.includes(u); }); });

    // 주제 이름은 있는데 AI 가 발문 예시를 안 쓴 경우(10/11 '정적분으로 정의된 함수') — 강사가 쓴 문장 그대로라도 찾는다
    const query = plan.targets.length && (plan.topic || plan.topicLabel)
        ? await embedText((plan.topic || `${plan.topicLabel} ${said}`).slice(0, 1000)) : null;

    // 단원도 키워드도 없으면(킬러 5개 아무 단원이나·조건만 있는 요청) 전체에서 조건(난이도·출처)으로 무작위
    let cands = plan.targets.length ? await callTopic(plan, plan.targets, query) : plan.keywords.length ? [] : await callTopic(plan, [], null);
    // 태그가 여럿이면 태그마다 따로 받아 번갈아 — 한 덩어리로 받으면 많은 쪽으로 쏠렸다(치환적분+부분적분 → 부분적분 17개, 10/11 3차)
    //   (태그마다 DB 를 따로 부르면 동시 조회가 몰려 시간 초과가 났다(4차) — 한 번 받은 후보의 태그만 가볍게 읽어 나눈다)
    if (plan.concepts.length >= 2 && conceptsOf) {
        const hit = cands.filter(c => c.tag_hit);
        const tagsOf = await conceptsOf(hit.map(c => c.id));
        const per = plan.concepts.map(t => hit.filter(c => (tagsOf.get(c.id) || []).includes(t)));
        const seen = new Set<string>(), mixed: Candidate[] = [];
        for (let i = 0; per.some(l => l[i]); i++) for (const l of per) { const x = l[i]; if (x && !seen.has(x.id)) { seen.add(x.id); mixed.push(x); } }
        cands = [...mixed, ...cands.filter(c => !seen.has(c.id))];
    }
    // 풀이 기법 키워드(지렛대·비율관계…)는 여러 단원에 걸친다. 고른 단원 안에서 모자라면 전체 단원에서 키워드로 다시 찾는다
    // (10/11 '지렛대로 풀 수 있는 문제' → AI 가 물리 지렛대로 오해해 여러가지방정식을 골라 엉뚱한 문항. 실제는 평면좌표 등 197문항)
    let widened = false;
    // 단, 고른 단원에 키워드 문항이 하나라도 있으면 넓히지 않는다 — '최단거리' 가 경우의 수 격자 문제로 샜다(10/11 2차)
    if (plan.keywords.length && !cands.some(c => c.kw_hit)) {
        const wide = (await callTopic(plan, [], null)).filter(c => c.kw_hit);
        if (wide.length) {
            const have = new Set(cands.map(c => c.id));
            cands = [...cands.filter(c => c.kw_hit), ...wide.filter(c => !have.has(c.id)), ...cands.filter(c => !c.kw_hit)];
            widened = true;
        }
    }

    const { list, by } = relevant(cands, plan.topic || !plan.topicLabel ? plan : { ...plan, topic: plan.topicLabel });
    let chosen = pickSpread(list, plan.count, plan.order);
    let filled = 0;
    if (chosen.length < plan.count && plan.fillRest) {
        const have = new Set(chosen.map(c => c.id));
        const rest = pickSpread(cands.filter(c => !have.has(c.id)), plan.count - chosen.length, plan.order);
        filled = rest.length;
        chosen = pickSpread([...chosen, ...rest], chosen.length + rest.length, plan.order);
    }

    const diffs = chosen.map(c => Number(c.difficulty)).filter(Boolean);
    const range = diffs.length ? (Math.min(...diffs) === Math.max(...diffs) ? `난이도 ${diffs[0]}` : `난이도 ${Math.min(...diffs)}~${Math.max(...diffs)}`) : '';
    const base = by.split('+')[0];
    const why = (base === 'keyword' ? `문제·해설에 '${plan.keywords.join("'·'")}' 표현이 나오는`
        : base === 'concept' ? `${plan.concepts.slice(0, 3).join(' ')}`
        : base === 'similarity' ? `'${plan.topicLabel || '요청 주제'}'와 발문이 가까운` : '')
        + (by.endsWith('+similarity') ? `(모자라 발문이 비슷한 문항도 보탬)` : '') + ' 문항';
    const fl = plan.filters, tags = [
        fl.years.length ? fl.years.join('·') + '년' : '', fl.kinds.map(k => ({ mock: '모의고사·수능', school: '학교 기출', special: '사관·경찰대' } as any)[k]).join('·'),
        fl.grades.join('·'), fl.semesters.join('·'), fl.schools.map(x => /^(평가원|수능|전국연합)$/.test(x) ? x : x + '(학교)').join('·'),
        fl.qtype === 'short_answer' ? '서답형' : fl.qtype === 'multiple_choice' ? '객관식' : '',
        fl.points?.length ? fl.points.join('·') + '점' : '',
    ].filter(Boolean);
    const orderText = plan.order === 'easy_to_hard' ? '쉬운 것부터' : plan.order === 'hard_to_easy' ? '어려운 것부터' : '섞어서';
    const unitsUsed = [...new Set(chosen.map(c => c.unit).filter(Boolean))];
    const where = widened || !plan.targets.length
        ? (unitsUsed.length <= 3 ? unitsUsed.join('·') : `${unitsUsed.slice(0, 3).join('·')} 등 ${unitsUsed.length}개 단원`)
        : scopeText(plan);
    let reply = chosen.length
        ? `${tags.length ? `[${tags.join(' · ')}] ` : ''}${where || '전체 단원'}에서 ${why.trim()} ${chosen.length}개를 ${range ? range + ro(Number(range.match(/\d+$/)![0])) + ' 고르게, ' : ''}${orderText} 담았어요.`
        : `${tags.length ? `[${tags.join(' · ')}] ` : ''}${plan.targets.length ? scopeText(plan) : '전체 단원'}에서 조건(난이도 ${plan.minDifficulty}~${plan.maxDifficulty})에 맞는 문항을 찾지 못했어요. 난이도나 범위를 넓혀 볼까요?`;
    if (filled) reply += ` 주제에 딱 맞는 문항이 모자라 ${filled}개는 같은 단원의 다른 문항으로 채웠어요.`;
    if (plan.unsupported) reply += ` ('${plan.unsupported}' 조건은 아직 걸 수 없어 빼고 골랐어요.)`;
    const missing = plan.count - chosen.length;
    if (chosen.length && missing > 0 && !plan.fillRest) {
        reply += cands.length > chosen.length
            ? ` 요청하신 ${plan.count}개보다 ${missing}개 적어요. 나머지를 같은 단원의 다른 문항으로 채울까요?`
            : ` 범위 안에 문항이 ${chosen.length}개뿐이에요.`;
    }
    return { reply, plan, by, chosen, widened };
}
