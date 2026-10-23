import { getLongIndex } from '@/lib/exam-long';

// [2026-10-22] 정적 public/robots.txt → 생성 라우트.
// 대표 결정: 구글봇은 장문 분석글이 붙은 시험지(+홈·모의고사·분석 보고서)에만 들어오게 한다.
//   크롤 양은 정해져 있는데, 다 열어 두면 분석글 없는 페이지를 돌다 나간다(10/22 서치콘솔: sitemap 을 9/25 이후 안 읽음,
//   시험지 상당수가 "구글이 모르는 URL").
//   ⚠ Googlebot 전용 블록이 있으면 구글은 '*' 블록을 무시한다 — 막을 것은 Disallow: / 하나로 다 덮인다.
//   ⚠ 네이버(Yeti)·다른 봇 규칙은 전과 같다(주 유입원).
//   분석글 목록은 저장소 색인(exam-analysis/_index.json)에서 읽는다 — 새 분석글이 올라가면 1시간 안에 배포 없이 반영.
export const revalidate = 3600;

const COMMON = [
    'Allow: /api/og-image',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    // 홈의 쿼리 URL은 본문·메타가 홈과 동일해 중복 문서가 된다.
    // (?school= 은 exam 상세의 '다운로드 하러 가기'가 만드는 링크, gad_* 는 광고 유입 파라미터)
    // 네이버 서치어드바이저 'description 중복' 지적 45건이 전부 이 형태였다.
    'Disallow: /?school=',
    'Disallow: /?gad_source=',
    'Disallow: /?gclid=',
    'Disallow: /?utm_',
    // [2026-09-03] 시험지출제(question-bank)의 쿼리 URL — 본문·title 이 /question-bank 와 같아 중복 문서가 된다.
    // 네이버는 canonical 로 중복 판정을 풀지 않는다. ?src= ?school= ?tour=1 모두 사용자 동선용이라 막아도 지장 없다.
    'Disallow: /question-bank?',
];

const TAIL = [
    'Sitemap: https://mathetf.com/sitemap.xml',
    // [2026-09-03] 자료가 이미지(webp) 중심이라 이미지 사이트맵을 따로 둔다.
    'Sitemap: https://mathetf.com/image-sitemap.xml',
    // [2026-10-05] 기출 없는 학교(NEIS 시험 100곳) — 색인 성과를 따로 보려고 나눴다.
    'Sitemap: https://mathetf.com/sitemap-neis.xml',
    // [2026-10-22] 장문 분석글이 붙은 시험지만 — 구글봇 허용 목록과 같은 집합.
    'Sitemap: https://mathetf.com/sitemap-exam-analysis.xml',
    '',
    '#DaumWebMasterTool:4e290b2d559b2197ee12ffc2e977ac55d04cfb8444693cfc70109b9c109dd8b2:9QC48RIDoACLXH3FbFNbCg==',
];

export async function GET() {
    const index = await getLongIndex(true);
    const google = [
        'User-agent: Googlebot',
        'Allow: /$',
        'Allow: /_next/',                                  // 화면을 그리는 CSS·JS — 막으면 렌더링이 깨진다
        'Allow: /api/og-image',
        `Allow: /${encodeURIComponent('모의고사')}`,        // 사관·경찰대 등 — 우리만 가진 자료
        'Allow: /insights',
        // [10/23] 입구 페이지 — 10/22 허용 목록에서 빠져 /schools·/지역·과목 허브가 구글봇에 막혀 있었다
        //   (/schools 는 '크롤링됨-색인 안 됨', /지역 은 '알 수 없는 URL'). 학교 페이지는 여전히 막는다.
        'Allow: /schools$',
        `Allow: /${encodeURIComponent('지역')}`,
        'Allow: /subject/',
        // ⚠ 사이트맵 파일도 허용해야 한다 — 구글은 사이트맵을 가져올 때도 robots 를 지킨다.
        //   10/23 배포 직후 /sitemap-exam-analysis.xml 이 서치콘솔에서 '가져올 수 없음'(Disallow: / 에 막힘).
        'Allow: /sitemap',             // sitemap.xml · sitemap-neis.xml · sitemap-exam-analysis.xml
        'Allow: /image-sitemap.xml',
        'Allow: /rss.xml',
        'Allow: /robots.txt',
        ...Object.keys(index).sort().map(id => `Allow: /exam/${id}$`),
        'Disallow: /',
    ];
    const text = [
        'User-agent: *', ...COMMON, '',
        '# 네이버 검색로봇 명시적 허용',
        'User-agent: Yeti', ...COMMON, '',
        '# [2026-10-22] 구글봇: 장문 분석글이 붙은 시험지만',
        ...google, '',
        ...TAIL,
    ].join('\n');
    return new Response(text + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
