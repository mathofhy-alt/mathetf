너는 고등학교 수학 강사로서 자체 문제집 문항을 심사한다. 현재 폴더의 `{SLOT}_problem.txt`(문제)와 `catalog.json` 의 원인 {CAUSE} 설명만 읽어라. 다른 칸의 파일·해설은 열지 마라.

1. 문제를 직접 푼다.
2. 원인 {CAUSE} 의 실수를 한 학생처럼 풀어 본다 — 그 실수를 하면 정말 틀리는가? 그때 나오는 값이 선지(객관식)에 있는가?
3. 난이도가 요청({LEVEL})에 맞는가: 기본=그 실수 하나만 겨냥한 2~3점, 중=다른 개념과 섞은 3~4점, 상=4점 킬러.
4. 시험다움: 실제 내신 시험지에 실릴 형태·길이인가, 답이 수 하나인가, 교과서 용어·기호만 쓰는가, 억지 설정이 없는가.

`{SLOT}_judge.json` (UTF-8):
{"trap_works": true/false, "trap_reason": "한 줄", "level_ok": true/false, "level_reason": "한 줄",
 "exam_like": true/false, "exam_like_reason": "false 일 때 한 줄", "wording": ["교과서 밖 용어·기호·번역투 — 없으면 빈 목록"]}
다른 파일은 만들지 마라. 끝나면 "완료" 한 줄만.
