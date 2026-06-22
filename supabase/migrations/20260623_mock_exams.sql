-- 모의고사 자료실 (전국연합·평가원·수능·경찰대·사관학교)
-- 회차마다 원본/변형 × PDF/HWP 4개 파일 + 워터마크 없는 미리보기.
create table if not exists public.mock_exams (
    id                 uuid primary key default gen_random_uuid(),
    category           text not null,          -- 전국연합 | 평가원 | 수능 | 경찰대 | 사관학교
    exam_year          int  not null,
    grade              text,                    -- 고1 | 고2 | 고3
    month              int,                     -- 시행월 (3/6/9/11 ...)
    subject            text default '수학',
    title              text not null,
    slug               text not null unique,
    original_pdf_path  text,
    original_hwp_path  text,
    variant_pdf_path   text,
    variant_hwp_path   text,
    preview_urls       jsonb,                   -- 워터마크 없는 미리보기 공개 URL 배열
    created_at         timestamptz not null default now()
);

create index if not exists idx_mock_exams_category on public.mock_exams (category);
create index if not exists idx_mock_exams_created  on public.mock_exams (created_at desc);

-- RLS on: 일반 클라이언트 차단. 조회·쓰기는 service-role(서버 라우트)만.
alter table public.mock_exams enable row level security;

-- 비공개 버킷: 원본/변형 파일 (다운로드는 서버가 로그인 확인 후 서빙)
insert into storage.buckets (id, name, public)
values ('mock-materials', 'mock-materials', false)
on conflict (id) do nothing;

-- 공개 버킷: 미리보기 이미지(워터마크 없음)
insert into storage.buckets (id, name, public)
values ('mock-previews', 'mock-previews', true)
on conflict (id) do nothing;
