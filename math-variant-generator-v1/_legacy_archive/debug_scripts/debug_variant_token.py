import asyncio
import google.generativeai as genai
import os

with open('../gemini_api_key.txt') as f:
    genai.configure(api_key=f.read().strip())

model = genai.GenerativeModel("gemini-1.5-flash")

async def test_gen():
    q_num = "1"
    original_q = "다음 이차방정식 x^2 - 4 = 0 의 해를 구하시오."
    original_opts = "['① 1', '② 2', '③ 3', '④ 4', '⑤ 5']"
    difficulty_instr = "[🟢 하 (쉬운 변형) 전략]"
    curriculum_instr = "[📚 과정 제약: 고1 1학기]"
    
    prompt = f"""[원본 해설 + 변형문제 생성 전담 모드]
아래 원본 수학 문제에 대해 다음 두 가지를 한 번에 수행하세요:
1) 원본 문제의 해설 작성
2) 변형문제 3개 + 각 해설 작성

[원본 문제 (제 {q_num}번)]
{original_q}

[원본 보기]
{original_opts}

{difficulty_instr}

{curriculum_instr}

[수식 작성 규칙 — 반드시 준수]
- 모든 '수식', '기호', '변수', '일반 숫자' 하나까지 예외 없이 무조건 [[EQUATION:HWP수식]] 태그로 감싸세요. (예: 1, 2, x, y 모두 포함)
- 분수: {{분자}} over {{분모}}  (예: [[EQUATION:{{1}} over {{2}}]])
- 루트: sqrt {{A}},  그리스 문자: alpha beta gamma pi (백슬래시 없이)
- 지수/아래첨자: x^{{2}}, x_{{n}},  연산자: TIMES, DIV, +-, CDOT
- 괄호: LEFT ( 식 RIGHT ),  단순 변수/숫자도 [[EQUATION:x]], [[EQUATION:5]] 로 감싸세요.
- 해설 문체: '~한다', '~이다' 해라체. 마지막은 '따라서 답은 [답]이다.' 로 마무리.
- 🚨 **[오답/모순 증명 필수]** 경우를 나누어 푸는 문제(예: c=2 또는 c=4)에서 특정 경우가 답이 되더라도, **나머지 오답 케이스(모순이 발생하는 경우)가 왜 안 되는지에 대한 증명 과정도 해설에 반드시 포함**하세요.
- 🚨 **[직관적/그래프 풀이 우선]** 복잡하고 긴 대수적 계산(방정식, 부등식의 기계적 전개식 등)보다는, **함수 그래프의 기하학적 성질(대칭성, 넓이, 교점, 주기성, 평행이동 등)**이나 직관적인 해석을 이용해 풀 수 있는 문제라면 무조건 그 방법을 우선하여 해설을 작성하세요.

[응답 형식]
아래 제공된 JSON 배열 템플릿의 형식을 100% 동일하게 유지하여, 4개의 객체가 정확히 채워진 JSON 하나만 출력하세요. 다른 텍스트는 절대 쓰지 마세요.

```json
[
  {{
    "question_num": "{q_num}",
    "question": "(원본 문제 본문 그대로)",
    "answer_options": ["(원본 보기가 있으면 배열에 넣고, 없으면 빈 배열 [])"],
    "explanation": "(원본 문제의 정확한 해설)"
  }},
  {{
    "question_num": "{q_num}-변형1",
    "question": "(첫 번째 변형 문제 본문 생성)",
    "answer_options": ["(객관식이면 5개 작성, 주관식이면 빈 배열 [])"],
    "explanation": "(첫 번째 변형 문제의 정확한 해설)"
  }},
  {{
    "question_num": "{q_num}-변형2",
    "question": "(두 번째 변형 문제 본문 생성)",
    "answer_options": ["(객관식이면 5개 작성, 주관식이면 빈 배열 [])"],
    "explanation": "(두 번째 변형 문제의 정확한 해설)"
  }},
  {{
    "question_num": "{q_num}-변형3",
    "question": "(세 번째 변형 문제 본문 생성)",
    "answer_options": ["(객관식이면 5개 작성, 주관식이면 빈 배열 [])"],
    "explanation": "(세 번째 변형 문제의 정확한 해설)"
  }}
]
```
🚨 [경고] 절대 중간에 생성을 중단하거나 객체를 빼먹지 마세요! 위 4개 객체가 배열 안에 모두 들어있어야 합니다.
"""
    try:
        resp = await model.generate_content_async(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.65,
                max_output_tokens=16384,
                response_mime_type="application/json"
            )
        )
        print("Length of response:", len(resp.text))
        print("Response Snippet:")
        print(resp.text[:300])
        print("...")
        print(resp.text[-300:])
        
        finish_reason = getattr(resp.candidates[0], 'finish_reason', None)
        print("Finish Reason:", finish_reason)
        print("\nArray count check:")
        print("Objects starting with {:", resp.text.count('{'))
        print("Objects ending with }:", resp.text.count('}'))
        
    except Exception as e:
        print("Error:", e)

asyncio.run(test_gen())
