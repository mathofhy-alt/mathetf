-- 시험지 SEO 분석글 (제미나이 배치 생성 → /exam/[id] 페이지에서 읽기, 없으면 템플릿 폴백)
-- 생성: scripts/generate_exam_analysis.py (파싱된 문항 데이터 근거로만 작성, 지어내기 금지)
alter table exam_materials add column if not exists ai_analysis text;
alter table exam_materials add column if not exists ai_analysis_at timestamptz;

comment on column exam_materials.ai_analysis is 'gemini-3.5-flash가 파싱 데이터(단원·난이도·개념) 근거로 생성한 시험지 SEO 분석글. 없으면 페이지가 템플릿으로 폴백.';
