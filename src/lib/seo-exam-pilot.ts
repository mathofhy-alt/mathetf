// 2026-06-22~09-21 Search Console 시험지 URL 중 실제 미리보기와 문항이
// 운영 DB에 남아 있는 상위 30회차. 13위 URL은 DB에서 없어 제외했다.
export const SEO_EXAM_PILOT_IDS = new Set([
    '6edf5fe6-1376-4a57-93e3-6cb2875c30c5',
    '9384cd62-48dc-47dc-aab4-7cdfc647103e',
    'a8976f14-dd78-4059-897f-16d6d7074cd5',
    '2ec8d9c1-b75b-4763-aa5e-5844165adef9',
    '89e02c67-f5e0-4aa5-b5ce-c210dae27e94',
    'aaa241c2-e0d3-4660-8d2d-3326f6c74695',
    '753647de-29f2-44f4-9c70-16339c9be223',
    'db9e50e7-0c35-4774-ab05-7a31841e9f15',
    '0b9fb5db-bf76-4b35-85da-ab77a5aa9413',
    '5e84dd40-94f6-4f18-ac33-3b73e261afd5',
    'f8e8d848-b04f-4014-bfa0-1183ccd59c1f',
    '6d7c4385-a61b-4d3d-9331-a5c4fa11ebe5',
    '2fac8a00-dc70-4958-ae7b-d0998c579b66',
    '50bc092b-c7a5-4b74-bc30-397323a0983a',
    'be1e2ca1-d988-43a7-9545-ee4cd29b048f',
    '403b202c-cceb-41a0-8c57-284cfeb4d9dc',
    'c50e5f80-117d-4cbe-9576-dac93cdef844',
    '2095f801-dd8f-40d1-ba69-8919ae8601f6',
    '3654d878-0e11-484d-aa15-bf3bcddaecd9',
    '7f86b5cf-4387-4459-b4bf-8e109ae21f49',
    '0332ff3c-5b4f-48aa-9aa4-716eba9140b7',
    '8ecbe17d-8300-446b-8b33-4b10e3822743',
    'b10f1723-df8e-4471-ad04-58298f632f7c',
    '16d81c4b-00b5-4c5e-808d-501a7f755ded',
    '46af1b3a-eaf1-4555-ac0c-d054dc79c786',
    '2f35ca02-e669-4c61-8743-03a2af7c983a',
    '59eae008-8a77-46bf-8974-f2c2674ad81c',
    '9182fc21-e0bd-4a43-b31a-40c9203fe3a3',
    '8b2aa0b4-f449-40f0-9c7c-9cfe35e6c90e',
    '696b769d-1874-4ceb-88af-eb3bd28f5dca',
]);

// 같은 검색 기간의 다음 유효 30회차. 39위 URL도 DB에서 없어 제외했다.
// 공통 링크와 보고서는 양쪽에 적용하고 문항 구성 문구만 파일럿에 적용한다.
export const SEO_EXAM_CONTROL_IDS = new Set([
    'c3ab5f87-d3cc-4158-82e6-0c8d0bf2d17d',
    'f872a55a-282c-455a-8d0f-d152205dfd7d',
    '2077c24f-b4c3-4298-9057-f8c53a1d673b',
    '4f2e64f0-9d34-4a34-b3e8-67946c9fe91d',
    'a9523474-e26b-49b3-b1fb-a2a04e0c521e',
    '5fb809c9-7089-4240-90f8-77c1013a0618',
    'b751951d-2c95-4305-9186-8db71e923575',
    '188940f8-4579-4225-bdf0-45d4035158d2',
    'e24eb905-9362-4453-b4d9-658c512841ae',
    '9e13992f-0445-4660-9148-a74fb182f5c5',
    'ac5e8198-ac3f-40dd-b989-24843376b321',
    '8767f292-bb6d-42de-9351-3f3b10ca74f5',
    '9446ba6b-82db-4c72-88ab-2cb55fc02b3b',
    '0663e01b-a6d4-43b8-84ec-3db0a98d0544',
    '726da243-1819-49b5-8660-c3f10df0a8e5',
    'b75cfd78-af82-462e-a4e5-494a9df57fc3',
    'e04c244e-ea80-419f-bac8-94a6587b0688',
    '8ad5f236-1d8c-4c36-a772-b463ec85f7ca',
    'a02ff811-212e-4cf1-acec-080d0c9fbc7d',
    '8ed729c0-862b-4d61-9512-4b037a9c168d',
    '5150299d-f734-41e1-8083-01dbebea173b',
    'c0a03791-7535-47ed-a926-783b746136e8',
    'a05d284e-b36a-4fbc-b1ad-179bd33edaa2',
    'dd8ddccd-64d5-45da-b928-3f3687b0c714',
    '69c02728-4369-4951-9e2c-9c7b682cce26',
    'eb61b865-9f7f-42a7-9b57-1df3a5bd2de0',
    '358bdfb4-5f87-4055-91eb-2729fdbf89a2',
    '0c13ceb1-c2dc-4b78-aa48-b27a84af6ac0',
    '64315df3-65ff-43f5-96ca-e6a768a41b6c',
    '5c275a98-ae99-4590-add0-1d98505ca1c7',
]);

type Composition = {
    total: number;
    byUnit: { unit: string; count: number }[];
    easy: number;
    mid: number;
    hard: number;
};

type Benchmark = {
    schools: number;
    questions: number;
    units: { name: string; count: number }[];
};

export function buildSeoPilotAnalysis(comp: Composition, benchmark?: Benchmark): string[] {
    if (comp.total <= 0 || comp.byUnit.length === 0) return [];
    const top = comp.byUnit[0];
    const second = comp.byUnit[1];
    const share = (count: number) => Math.round(count / comp.total * 100);
    const tied = comp.byUnit.filter(unit => unit.count === top.count).map(unit => unit.unit);
    const leading = tied.length > 1
        ? `${tied.join('·')} 단원이 각각 ${top.count}문항(${share(top.count)}%)으로 공동 최다입니다.`
        : `${top.unit} 단원이 ${top.count}문항(${share(top.count)}%)으로 가장 많습니다.`;
    const range = second
        ? `상위 두 단원(${top.unit}·${second.unit})이 ${top.count + second.count}문항(${share(top.count + second.count)}%)을 차지하고, 나머지 ${comp.byUnit.length - 2}개 단원에 ${comp.total - top.count - second.count}문항이 분포합니다.`
        : `등록된 문항은 모두 ${top.unit} 단원으로 분류됩니다.`;
    const reuse = second
        ? `같은 범위로 다시 출제한다면 ${top.unit} ${top.count}문항, ${second.unit} ${second.count}문항을 기준으로 삼아 이 회차의 단원 비율을 재현할 수 있습니다.`
        : `${top.unit} 범위만 선택하면 이 회차와 같은 단원 범위로 재출제할 수 있습니다.`;
    const comparison = benchmark?.units.find(unit => unit.name === top.unit);
    const gap = comparison && benchmark
        ? (top.count / comp.total - comparison.count / benchmark.questions) * 100
        : 0;
    const compared = comparison && benchmark && Math.abs(gap) >= 5
        ? `${top.unit} 비중은 이 회차 ${share(top.count)}%로, 2025년 같은 과목·시험 종류 ${benchmark.schools}개교 집계의 ${(comparison.count / benchmark.questions * 100).toFixed(1)}%보다 ${Math.abs(gap).toFixed(1)}%포인트 ${gap > 0 ? '높습니다' : '낮습니다'}. 집계 대상이 다른 회차들을 포함하므로 동일 학교의 연도별 변화로 해석하지 않습니다.`
        : null;
    return [
        `등록된 ${comp.total}문항의 단원 분류를 집계했습니다. ${leading} ${range}`,
        `난이도 자동 분류 기준으로 쉬움 ${comp.easy}문항, 보통 ${comp.mid}문항, 어려움 ${comp.hard}문항입니다. ${reuse}`,
        ...(compared ? [compared] : []),
    ];
}
