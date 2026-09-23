/** @type {import('next').NextConfig} */
// Force Rebuild: Optimized Image Resize Logic Active
const nextConfig = {
    distDir: process.env.NEXT_PUBLIC_LOCAL_PREVIEW === '1' ? '.next-review' : '.next',
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    // 정적 생성 타임아웃 (기본 60초 → 180초).
    // /teacher 는 questions 의 exact count 를 도는데, DB 가 콜드일 때 이 쿼리 하나가
    // 43초 넘게 걸린다(2026-08-21 측정). 빌드 워커가 동시에 몰리면 60초를 넘겨
    // "Static page generation for /teacher is still timing out" 으로 빌드가 통째로 죽는다.
    staticPageGenerationTimeout: 180,
    experimental: {
        // [PERF] lucide-react 아이콘을 사용한 것만 번들에 포함 (tree-shaking 보강)
        optimizePackageImports: ['lucide-react'],
    },
    // [2026-09-14 전수조사] HSTS 는 Vercel 이 기본으로 붙이지만 나머지는 없었다.
    //   - X-Content-Type-Options: 브라우저가 파일 형식을 추측해 스크립트로 실행하는 것 방지
    //   - X-Frame-Options: 다른 사이트가 iframe 으로 감싸 클릭을 가로채는 것 방지
    //   - Referrer-Policy: 다른 사이트로 나갈 때 우리 URL 의 쿼리까지 넘기지 않음
    //   CSP 는 넣지 않는다 — GA·PortOne·Supabase 등 외부 스크립트 목록을 다 맞춰야 해서 깨질 위험이 더 크다.
    async headers() {
        return [{
            source: '/(.*)',
            headers: [
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            ],
        }];
    },
};

module.exports = nextConfig;
