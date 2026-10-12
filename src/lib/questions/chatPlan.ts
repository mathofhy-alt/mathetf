/**
 * 시험지출제 'AI로 만들기' (2026-10-11) — 강사가 말로 한 요청을 출제 조건으로 바꾸고, 후보에서 문항을 고른다.
 *
 * 흐름: 요청 문장(+앞 대화) → OpenAI 1회(JSON 스키마 고정) → { 과목|단원 · 개념 태그 · 주제 문장 · 문항 수 · 난이도 · 순서 }
 *       → 라우트가 question_bank_topic(태그 맞는 문항 먼저, 그다음 주제 문장과 발문이 가까운 순) → pickSpread 로 난이도 고르게.
 *
 * 왜 개념 태그를 같이 고르나(10/11 로컬 실측): 발문 임베딩만으론 같은 단원 안 유사도가 고만고만해서
 * (삼차함수 비율: 1위 0.68 · 234위 0.58) 주제를 가르는 힘이 약하다. 문항마다 붙은 개념 태그는 단원당 70개 안팎의
 * 정해진 이름이라(예: #곡선밖의한점에서곡선에그은접선의방정식의활용) 맞으면 정확하다.
 * 단원과 태그를 따로 고르게 했더니 첫 단계에서 단원을 틀리면 태그도 틀렸다 → 단원별 태그 목록을 한 번에 보여 주고 같이 고른다.
 * 과목|단원·태그는 실제 목록에 있는 것만 남긴다(sanitizePlan) — 모델 말을 그대로 DB 조건에 넣지 않는다.
 */

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** '과목|단원' → { 태그: 문항 수 } */
export type ConceptCatalog = Record<string, Record<string, number>>;

export type ChatPlan = {
    action: 'build' | 'ask';
    reply: string;              // 'ask' 일 때 되묻는 말 (build 안내 문구는 라우트가 실제 결과로 만든다)
    targets: string[];          // '과목|단원' — 같은 단원 이름이 과목마다 내용이 달라(도함수의활용: 수학II·미적분I·미적분II) 짝으로 고른다
    concepts: string[];         // 개념 태그 — 주제와 직접 맞는 것만. 없으면 []
    keywords: string[];         // 해설·발문 본문에 실제로 쓰이는 말(예: 비율관계) — 태그가 없는 주제를 잡는다
    topic: string;              // '' = 주제 없음. 있으면 그 유형의 문제 발문처럼 지은 문장(임베딩 검색용)
    topicLabel: string;         // 짧은 이름 — 안내 문구용
    count: number;
    minDifficulty: number;
    maxDifficulty: number;
    order: 'easy_to_hard' | 'hard_to_easy' | 'mixed';
    fillRest: boolean;          // 주제에 맞는 문항이 모자랄 때 같은 단원 다른 문항으로 채워도 되나
    filters: PlanFilters;       // 출처·연도·문항유형 등 (SQL p_filter)
    unsupported: string;        // 걸 수 없는 조건(예: '우리 학교 스타일') — 안내 문구에 붙인다
};

// 내신 회차 + 모의고사 회차(questions.semester 그대로 — 수능은 school='수능', semester='11월 모의고사', year=시행 연도)
const SEMESTERS = ['1학기중간', '1학기기말', '2학기중간', '2학기기말', '3월 모의고사', '4월 모의고사', '5월 모의고사', '6월 모의고사', '7월 모의고사', '9월 모의고사', '10월 모의고사', '11월 모의고사'];
export type PlanFilters = { years: string[]; kinds: string[]; qtype: string; grades: string[]; semesters: string[]; schools: string[] };

const SCHEMA = {
    type: 'object', additionalProperties: false,
    required: ['action', 'reply', 'targets', 'concepts', 'keywords', 'topic', 'topicLabel', 'count', 'minDifficulty', 'maxDifficulty', 'order', 'fillRest', 'filters', 'unsupported'],
    properties: {
        action: { type: 'string', enum: ['build', 'ask'] },
        reply: { type: 'string' },
        targets: { type: 'array', items: { type: 'string' } },
        concepts: { type: 'array', items: { type: 'string' } },
        keywords: { type: 'array', items: { type: 'string' } },
        topic: { type: 'string' },
        topicLabel: { type: 'string' },
        count: { type: 'integer' },
        minDifficulty: { type: 'integer' },
        maxDifficulty: { type: 'integer' },
        order: { type: 'string', enum: ['easy_to_hard', 'hard_to_easy', 'mixed'] },
        fillRest: { type: 'boolean' },
        filters: {
            type: 'object', additionalProperties: false, required: ['years', 'kinds', 'qtype', 'grades', 'semesters', 'schools'],
            properties: {
                years: { type: 'array', items: { type: 'string' } },
                kinds: { type: 'array', items: { type: 'string', enum: ['mock', 'school', 'special'] } },
                qtype: { type: 'string', enum: ['', 'short_answer', 'multiple_choice'] },
                grades: { type: 'array', items: { type: 'string', enum: ['고1', '고2', '고3'] } },
                semesters: { type: 'array', items: { type: 'string', enum: SEMESTERS } },
                schools: { type: 'array', items: { type: 'string' } },
            },
        },
        unsupported: { type: 'string' },
    },
};

/** 목록 프롬프트 — 문항 3개 미만 태그는 뺀다(오표기 꼬리, 1,448개 → 토큰 절약) */
function catalogText(catalog: ConceptCatalog) {
    return Object.keys(catalog).sort().map(t => {
        const tags = Object.entries(catalog[t]).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([c]) => c);
        return `${t}: ${tags.join(' ')}`;
    }).join('\n');
}

function systemPrompt(catalog: ConceptCatalog, maxCount: number, lastPlan: ChatPlan | null) {
    return `너는 고등학교 수학 시험지 출제 도우미다. 강사가 말로 요청하면 문제은행에서 문항을 고를 '조건'을 JSON 으로 만든다.

[문제은행 목록 — 한 줄에 '과목|단원: 그 단원 문항에 붙은 개념 태그들(많은 순)']
${catalogText(catalog)}

[규칙]
- targets: 문항을 찾을 '과목|단원' (위 목록의 줄 이름 그대로). 주제가 실제로 들어 있는 단원만 고른다.
  강사가 말한 단원 이름보다 태그 목록이 우선이다 — 주제에 맞는 태그가 붙어 있는 단원을 고른다
  (예: '다항식 나머지정리' → 나머지 관련 태그가 있는 항등식 단원).
  같은 내용이 2015 과정과 2022 과정에 다 있으면 둘 다 넣는다 — 수학I↔대수, 수학II↔미적분I, 미적분↔미적분II, 수학(상)↔공통수학1, 수학(하)↔공통수학2, 기하와벡터↔기하.
  강사가 과목을 콕 집으면(예: '공통수학1만', '2022 과정') 그 과목만.
  미분·적분이 붙은 지수·로그·삼각함수(예: 지수함수 미분, 삼각함수 적분)는 미적분II·미적분 과목이다(수학I·대수의 지수함수 단원이 아니다).
  '아무 단원이나'처럼 단원을 정하지 않는 요청은 targets=[] (전체)로, '확통 전범위'처럼 과목만 말하면 그 과목의 모든 단원으로 build 한다(되묻지 않는다).
- concepts: 고른 단원의 태그 중 강사가 말한 주제와 '직접' 맞는 것만(보통 1~3개, 2015·2022 양쪽에 같은 이름이 있으면 하나로 충분).
  태그 이름이 요청과 같은 대상인지 확인한다: 방정식≠부등식, 모평균≠모비율, a_{n+1}=pa_n+q 꼴≠a_{n+1}=a_n+f(n) 꼴. 비슷하기만 한 태그는 넣지 않는다.
  넓은 태그(예: #함수의극대극소)는 주제가 바로 그것일 때만. 주제가 단원 전체이거나 맞는 태그가 없으면 [].
  요청에 주제가 둘 이상이면(예: 지수방정식과 로그부등식) 각 주제의 태그를 다 넣는다.
- keywords: 문제·해설 본문에 거의 그대로 쓰이는 좁은 수학 용어(2~10자, 1~3개). 태그와 같이 써도 된다 — 둘 다 맞는 문항이 맨 앞에 온다.
  예: 삼차함수 비율 → ["비율관계"], 신발끈 공식 → ["신발끈"], 변곡점 대칭 → ["변곡점"], 정사영 → ["정사영"], 몫의 미분법 → ["몫의미분"].
  단원 이름 수준의 넓은 말(접선, 극한, 넓이)은 쓰지 않는다. 확실하지 않으면 [].
  본문은 수식이 빠진 글이라 수식·기호는 쓰지 않는다. 띄어쓰기는 상관없다.
  강사가 단원이 아니라 '풀이 기법·요령'으로 말하면(예: 지렛대로 푸는 문제, 메넬라우스, 비율관계, 대칭이동으로 최단거리) 그 말을 keywords 에 넣는다.
  이런 기법은 여러 단원에 걸쳐 쓰이므로(지렛대 → 평면좌표·직선의방정식·벡터 등) 단원을 확신하지 못하면 targets 는 [] 로 둔다 — 서버가 전체에서 찾는다.
  물리·생활 말로 오해하지 말 것: 수학 문제 풀이에서 그 말이 무엇을 뜻하는지(지렛대 = 내분점·무게중심 비) 기준으로 판단한다.
- topic: 단원보다 좁은 '유형·주제'가 있으면 그 유형의 실제 시험 문제 발문을 2~3개 지어서 이어 쓴다
  (예: "최고차항의 계수가 1인 삼차함수 f(x)가 x=1 에서 극대이고 ... 일 때, f(4)의 값은?"). 설명문이 아니라 문제 문장. 주제가 없으면 ''.
- topicLabel: 주제를 4~12자로(예: 삼차함수 비율). 주제가 없으면 ''.
- count: 요청한 문항 수. 말이 없으면 20. 최대 ${maxCount}.
- 난이도는 1(가장 쉬움)~10(가장 어려움). '쉬운 것부터 어려운 것까지 전부' = 1~10, '쉬운' = 1~4, '중간' = 4~7, '어려운' = 7~10, '킬러' = 8~10, 말이 없으면 1~10.
- order: '어려운 것부터'면 hard_to_easy, '섞어서'면 mixed, 그 밖에는 easy_to_hard.
- fillRest: 강사가 '모자라면 채워/나머지 채워/그래 채워줘'처럼 허락했을 때만 true.
- filters: 출처·시기·유형 조건. 말이 없으면 모두 빈 값.
  years: 시행 연도(예: '2024년 모의고사' → ["2024"]). 올해는 ${new Date().getFullYear()}년이다 — '최근 3개년' = 올해 포함 최근 세 해(${[0, 1, 2].map(i => new Date().getFullYear() - i).reverse().join(', ')}).
  kinds: 모의고사·수능·학력평가=mock, 학교 내신 기출=school, 사관학교·경찰대=special.
  qtype: 서술형·서답형·주관식만 → short_answer, 객관식만 → multiple_choice ('위주로'여도 같게). grades: 고1·고2·고3 학년을 콕 집었을 때만(내신·모의고사 모두).
  semesters: '2학기 중간' 같은 시험 회차를 콕 집었을 때만(이건 그 회차 시험에 나온 문항이라는 뜻).
    모의고사 회차는 '6월 모의고사'·'9월 모의고사' 처럼 쓴다. 수능 = '11월 모의고사'.
  schools: 특정 학교 이름(예: 휘문고 → ["휘문"]). 평가원 기출 = ["평가원", "수능"](6월·9월 모의평가와 수능), 수능만 = ["수능"], 교육청·학력평가 = ["전국연합"].
- 고3 모의고사·수능·평가원 문제에서 '공통' = 수학I·수학II(목록 이름으로 대수·미적분I 과 수학I·수학II), '선택과목' = 미적분·확률과통계·기하.
  이때 '공통'을 공통수학1·공통수학2(고1 과목)로 읽지 않는다. '선택과목 제외'면 공통 과목 단원만 targets 에 넣는다.
- '3점짜리', '4점', '2점 배점'처럼 배점을 말하면 배점 정보는 문제은행에 없다 — unsupported 에 '3점 배점'처럼 쓰고, keywords·난이도로 바꾸지 않는다.
  '중간고사 대비'처럼 범위만 말한 것은 semesters 에 넣지 않는다.
- unsupported: 위 조건으로 못 거는 요청 조건을 강사가 쓴 말 그대로 짧게(예: '우리 학교 기출 스타일'). 문장으로 설명하지 않는다. 없으면 ''.
- 과목·단원을 전혀 알 수 없을 때만 action='ask' 로 reply 에 짧게 되묻는다(존댓말). 그 밖에는 action='build', reply 는 ''.
- 앞 대화가 있으면 이어서 고친다. "더 어렵게"면 난이도만 올리고 나머지는 그대로, "10개만"이면 수만 바꾼다.
${lastPlan ? `\n[직전에 쓴 조건]\n${JSON.stringify({ ...lastPlan, topic: undefined })}` : ''}`;
}

export type PlanUsage = { model: string; inputTokens: number; cachedTokens: number; outputTokens: number };

/** QB_CHAT_MODEL 이 gemini-* 이면 Gemini, 아니면 OpenAI. 둘 다 JSON 스키마로 답 모양을 고정한다 */
async function callModel(system: string, history: ChatTurn[]): Promise<{ text: string; usage: PlanUsage }> {
    const model = process.env.QB_CHAT_MODEL || 'gpt-4.1';
    if (model.startsWith('gemini')) {
        const key = (process.env.GEMINI_API_KEY || '').trim();
        if (!key) throw new Error('AI 설정이 없습니다.');
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST', signal: AbortSignal.timeout(30_000),
            headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents: history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
                generationConfig: { temperature: 0, responseMimeType: 'application/json', responseJsonSchema: SCHEMA, ...(process.env.QB_CHAT_THINKING ? { thinkingConfig: { thinkingLevel: process.env.QB_CHAT_THINKING } } : {}) },
            }),
        });
        if (!res.ok) throw new Error(`AI 응답 오류 (${res.status}) ${(await res.text()).slice(0, 200)}`);
        const j = await res.json();
        const u = j.usageMetadata || {};
        return {
            text: (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join(''),
            usage: { model, inputTokens: u.promptTokenCount || 0, cachedTokens: u.cachedContentTokenCount || 0, outputTokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) },
        };
    }
    const key = (process.env.OPENAI_API_KEY || '').trim();
    if (!key) throw new Error('AI 설정이 없습니다.');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model, temperature: 0,
            messages: [{ role: 'system', content: system }, ...history],
            response_format: { type: 'json_schema', json_schema: { name: 'exam_plan', strict: true, schema: SCHEMA } },
        }),
    });
    if (!res.ok) throw new Error(`AI 응답 오류 (${res.status})`);
    const j = await res.json();
    return {
        text: j.choices?.[0]?.message?.content || '{}',
        usage: { model, inputTokens: j.usage?.prompt_tokens || 0, cachedTokens: j.usage?.prompt_tokens_details?.cached_tokens || 0, outputTokens: j.usage?.completion_tokens || 0 },
    };
}

export let lastUsage: PlanUsage | null = null;   // 시험·기록용
/** 프로세스 안 누적 토큰(대량 시험의 비용 계산용) */
export const usageTotals = { calls: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, embedTokens: 0 };

export async function planFromChat(history: ChatTurn[], catalog: ConceptCatalog, maxCount: number, lastPlan: ChatPlan | null): Promise<ChatPlan> {
    const { text, usage } = await callModel(systemPrompt(catalog, maxCount, lastPlan), history.slice(-8));
    lastUsage = usage;
    usageTotals.calls++; usageTotals.inputTokens += usage.inputTokens; usageTotals.cachedTokens += usage.cachedTokens; usageTotals.outputTokens += usage.outputTokens;
    return sanitizePlan(JSON.parse(text || '{}') as ChatPlan, catalog, maxCount);
}

/** 목록 밖 과목|단원·태그, 범위 밖 숫자를 바로잡는다 */
export function sanitizePlan(p: ChatPlan, catalog: ConceptCatalog, maxCount: number): ChatPlan {
    const norm = (t: string) => String(t).split('|').map(x => x.trim()).join('|');
    const targets = [...new Set((p.targets || []).map(norm).filter(t => catalog[t]))];
    // 태그는 목록 전체에서 받는다 — 고른 단원 밖 태그라고 버리면 '치환적분 부분적분' 처럼 한쪽 주제가 통째로 빠졌다(10/11 6차).
    // 그 태그가 있는 단원은 고른 과목(없으면 전체) 안에서 범위에 더한다
    const tagsIn = new Set(Object.values(catalog).flatMap(o => Object.keys(o)));
    // AI 가 '#' 를 빼거나 띄어 쓰는 일이 잦다(10/11 2차 시험: '평균값정리:정의를이용하는경우' → 전부 버려져 태그 0) — 맞춰서 받는다
    const tagKey = (x: string) => String(x).replace(/\s+/g, '').replace(/^#?/, '#');
    const tagByKey = new Map([...tagsIn].map(t => [tagKey(t), t]));
    const concepts = [...new Set((p.concepts || []).map(c => tagByKey.get(tagKey(c))).filter((c): c is string => !!c))].slice(0, 8);
    const subjects = new Set(targets.map(t => t.split('|')[0]));
    for (const c of concepts) if (!targets.some(t => catalog[t][c]))
        for (const t of Object.keys(catalog)) if (catalog[t][c] && (!subjects.size || subjects.has(t.split('|')[0])) && !targets.includes(t)) targets.push(t);
    // 키워드와 태그를 같이 주면 relevant() 가 '둘 다 맞는 문항'부터 쓴다(키워드만 넓으면 태그가 거른다 — 사인법칙 → '삼각형의 넓이' 사례)
    const keywords = [...new Set((p.keywords || []).map(k => String(k).trim()).filter(k => k.length >= 2 && k.length <= 20))].slice(0, 4);
    const f = (p.filters || {}) as Partial<PlanFilters>;
    const arr = (v: unknown, ok: (x: string) => boolean, n = 6) => (Array.isArray(v) ? [...new Set(v.map(String).map(x => x.trim()).filter(ok))] : []).slice(0, n);
    const filters: PlanFilters = {
        years: arr(f.years, x => /^20\d\d$/.test(x)),
        kinds: arr(f.kinds, x => ['mock', 'school', 'special'].includes(x), 3),
        qtype: f.qtype === 'short_answer' || f.qtype === 'multiple_choice' ? f.qtype : '',
        grades: arr(f.grades, x => ['고1', '고2', '고3'].includes(x), 3),
        semesters: arr(f.semesters, x => SEMESTERS.includes(x), 8),
        schools: arr(f.schools, x => x.length >= 2 && x.length <= 20 && !/[%_\\]/.test(x), 4),
    };
    const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, Math.round(Number(n) || a)));
    let lo = clamp(p.minDifficulty, 1, 10), hi = clamp(p.maxDifficulty, 1, 10);
    if (lo > hi) [lo, hi] = [hi, lo];
    return {
        // 단원 없이 키워드(풀이 기법)만 있어도 만든다 — 서버가 전체 단원에서 키워드로 찾는다
        action: p.action === 'ask' ? 'ask' : 'build',
        reply: String(p.reply || '').slice(0, 300) || (p.targets?.length ? '말씀하신 단원을 출제 자료에서 찾지 못했어요. 과목과 단원 이름을 한 번 더 알려 주세요. 예: "미적분I 정적분"' : '어느 과목·단원에서 낼지 알려 주세요. 예: "미적분I 도함수의 활용에서 삼차함수 비율 30문항"'),
        targets, concepts, keywords,
        topic: String(p.topic || '').slice(0, 600), topicLabel: String(p.topicLabel || '').slice(0, 30),
        count: clamp(p.count, 1, Math.max(1, maxCount)), minDifficulty: lo, maxDifficulty: hi,
        order: (['easy_to_hard', 'hard_to_easy', 'mixed'] as const).includes(p.order) ? p.order : 'easy_to_hard',
        fillRest: p.fillRest === true,
        filters, unsupported: String(p.unsupported || '').slice(0, 120),
    };
}

export type Candidate = { id: string; difficulty: string | number; unit: string; similarity: number | null; tag_hit: boolean; kw_hit: boolean };

/** ILIKE 패턴 — 사용자가 쓴 % _ \ 는 글자 그대로 */
export const likePattern = (k: string) => `%${k.replace(/\s+/g, '').replace(/[\\%_]/g, m => '\\' + m)}%`;   // SQL 이 본문 띄어쓰기를 빼고 비교한다

/**
 * 주제에 '맞는' 후보와 그 근거.
 *   키워드·태그를 둘 다 줬으면 둘 다 맞는 문항이 먼저, 그다음은 둘 중 '좁은 쪽'(맞는 문항이 적은 쪽)이 맞는 문항
 *     — 키워드가 넓으면(사인법칙 → '삼각형의 넓이') 태그가, 태그가 넓으면(신발끈 → 넓은 좌표 태그) 키워드가 주제를 가른다.
 *   모자라면 주제 문장과 발문이 가까운 문항(1위에서 delta 안쪽)으로 보탠다 — 문장마다 유사도 크기가 달라 고정 임계값은 안 맞는다.
 *   주제가 없으면 후보 전부(단원 안 무작위).
 */
export function relevant(cands: Candidate[], plan: ChatPlan, delta = Number(process.env.QB_CHAT_DELTA || 0.06)): { list: Candidate[]; by: string } {
    const kw = plan.keywords.length ? cands.filter(c => c.kw_hit) : [];
    const tag = plan.concepts.length ? cands.filter(c => c.tag_hit) : [];
    let list: Candidate[] = [], by = '';
    if (kw.length && tag.length) {
        const both = kw.filter(c => c.tag_hit);
        const [narrow, wide] = kw.length <= tag.length ? [kw, tag] : [tag, kw];
        list = both.length >= plan.count ? both : [...both, ...narrow.filter(c => !both.includes(c)), ...wide.filter(c => !both.includes(c))];
        by = kw.length <= tag.length ? 'keyword' : 'concept';
    } else if (kw.length) { list = kw; by = 'keyword'; }
    else if (tag.length) { list = tag; by = 'concept'; }
    // 태그·키워드로 하나도 못 찾았을 때만 발문 유사도로 — 모자란다고 비슷한 문항을 끼우면 엉뚱한 게 섞였다(10/11 2차: 신발끈·넓이 이등분). 모자라면 모자란다고 말한다
    if (!list.length && plan.topic && cands.some(c => c.similarity != null)) {
        const top = Math.max(...cands.map(c => c.similarity ?? -1));
        const ranked = [...cands].sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1));
        const near = ranked.filter(c => (c.similarity ?? -1) >= top - delta);
        // 가까운 게 너무 적으면(주제가 사실상 단원 전체 — '기하 벡터 어려운 것' → 1개) 같은 단원 안에서 가까운 순으로
        list = near.length >= plan.count ? near : ranked;
        by = 'similarity';
    }
    return list.length ? { list, by } : { list: cands, by: 'unit' };
}

/** 같은 순서를 지키며 key 별로 돌아가며 섞는다 — 단원이 여럿이면(지수방정식+로그부등식) 한쪽으로 쏠리지 않게 */
function interleave<T>(arr: T[], key: (x: T) => string): T[] {
    const groups = new Map<string, T[]>();
    for (const x of arr) { const k = key(x); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(x); }
    if (groups.size < 2) return arr;
    const qs = [...groups.values()], out: T[] = [];
    for (let i = 0; out.length < arr.length; i++) for (const q of qs) if (q[i]) out.push(q[i]);
    return out;
}

/**
 * 난이도 범위를 고르게 덮도록 뽑는다: 난이도별로 묶어 쉬운 쪽부터 한 개씩 돌아가며(묶음 안에선 주제에 가까운 순, 단원은 번갈아).
 * 그래서 '1~10 전부 30문항'이면 각 난이도에서 3개씩, 없는 난이도는 이웃이 메운다.
 */
export function pickSpread(cands: Candidate[], n: number, order: ChatPlan['order']): Candidate[] {
    const byDiff = new Map<number, Candidate[]>();
    for (const c of cands) {
        const d = Number(c.difficulty) || 0;
        if (!byDiff.has(d)) byDiff.set(d, []);
        byDiff.get(d)!.push(c);
    }
    for (const [d, list] of byDiff) byDiff.set(d, interleave(list, c => c.unit));
    const levels = [...byDiff.keys()].sort((a, b) => a - b);
    const out: Candidate[] = [];
    for (let round = 0; out.length < n; round++) {
        let took = false;
        for (const d of levels) {
            const c = byDiff.get(d)![round];
            if (c) { out.push(c); took = true; if (out.length >= n) break; }
        }
        if (!took) break;
    }
    const diff = (c: Candidate) => Number(c.difficulty) || 0;
    if (order === 'easy_to_hard') out.sort((a, b) => diff(a) - diff(b));
    else if (order === 'hard_to_easy') out.sort((a, b) => diff(b) - diff(a));
    return out;
}

/** 출처·연도 같은 조건이 하나라도 있나 — 없으면 SQL 에 p_filter 를 안 보낸다(예전 함수와도 맞게) */
export const hasFilter = (p: ChatPlan) => Object.values(p.filters).some(v => Array.isArray(v) ? v.length > 0 : !!v);
