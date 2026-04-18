import os
import json
import base64
import urllib.request

with open('openai_api_key.txt', 'r', encoding='utf-8') as f:
    api_key = f.read().strip()

# Pick a large crop that might have a <보기>
img_path = r'debug_crop_14.png'
with open(img_path, "rb") as image_file:
    base64_image = base64.b64encode(image_file.read()).decode('utf-8')

q_num = "14"
ocr_prompt = f"""당신은 초정밀 수학 OCR 전문가입니다.
첨부된 이미지에서 **오직 '{q_num}' 문제 딱 하나만** 찾아서, 문제 본문과 보기(선택지)를 완벽하게 전사해 주세요.

🚨 [절대 규칙: 인지 능력 상실 모드] 당신은 지금부터 모든 수학적 사전 지식과 계산 능력을 상실한 '깡통 시각 스캐너'입니다. 수학 공식을 보거나 "구하시오"라는 문장을 보더라도 절대 그 의미를 해석하거나 속으로 답을 구하려 들지 마십시오. 당신의 유일한 존재 이유는 픽셀 문자열을 100% 거울 복사하는 것입니다.

[필수 출력 형식]
오직 1개의 JSON 객체만 배열로 감싸서 응답하세요. 마크다운(` ```json `) 블록을 쓰지 말고 오직 raw JSON 텍스트 배열만 반환하세요.
[
  {{
    "question_num": "{q_num}",
    "question": "문제 본문 전체 텍스트 (조건, 구하는 값 등)",
    "answer_options": ["① [[EQUATION:1]]", "② [[EQUATION:2]]"]
  }}
]

[핵심 규칙]
- 🚨 **[텍스트 변조 및 요약 절대 금지 (초엄격 OCR 전사 원칙)]** 🚨
  문제 본문을 전사할 때 절대 문장이나 단어를 임의로 요약, 압축, 변조하지 마세요! "다음 그림과 같이"를 "그림에서"로 바꾸거나, "구하시오"를 "구하여라"로 바꾸는 등 조사나 어미 하나라도 원본과 다르게 쓰면 절대 안 됩니다. 오직 사진에 적힌 글자 토씨 하나 틀리지 않고 100% 동일하게 복사하듯 타이핑하세요.
- 🚨 **[한글 수식 표준 문법 사용]** 당신은 LaTeX이 아니라, **한글 수식 편집기(HWP Math)**에 바로 입력 가능한 문법을 사용해야 합니다.
  1. 분수는 반드시 `{{분자}} over {{분모}}` 형태로 작성하세요. 절대 \\frac을 쓰지 마세요.
  2. 켤레복소수는 `bar {{ ... }}` 또는 `overline {{ ... }}` 를 사용하세요. (예: `bar {{alpha}}`)
  3. 모든 그리스 문자 및 특수 기호는 백슬래시(\\) 없이 이름만 적거나 한글 수식 표준을 따르세요. (예: `alpha`, `beta`, `inf`, `times`, `sum`, `root`, `pi` 등)
  4. 🚨 편의상 분수를 감싸는 괄호가 있다면 일반 괄호 `( )` 대신 반드시 `LEFT ( ... RIGHT )`를 사용해야 크기가 자동 조절됩니다.
  5. **부등호 기호 주의**: `<=`나 `>=` 대신 반드시 단일 선 부등호인 `le` (또는 `<=`) 와 `ge` (또는 `>=`) 대신 **`le` 와 `ge`** 명령어 자체를 사용하세요. (예: `x le 3`)
- 보기(answer_options) 배열 안에 포함되는 모든 숫자, 변수, 기호, 수식 등은 반드시 `[[EQUATION:...]]` 태그로 감싸야 합니다!

[수식 포맷팅 (매우 중요)]
- 모든 수학 수식, 변수, 숫자, 기호는 반드시 아래의 태그 형식으로 감싸야 합니다.
  [[EQUATION:수식]]
- 숫자 하나나 단순 알파벳 변수도 무조건 감싸세요 (예: [[EQUATION:1]], [[EQUATION:x]])
- 🚨 절대 `$수식$`, `$$수식$$`, `\(수식\)`, `\[수식\]` 같은 마크다운 수식 래퍼를 사용하지 마세요!!! 무조건 `[[EQUATION:수식]]` 형태로만 감싸야 합니다.
- 🚨 **[문항 본문 특별 주의]** `question` 필드 안에서도 예외 없이 `[[EQUATION:...]]` 태그로 감싸야 합니다.
- 🚨 **[치명적 태그 오류 주의]** 태그를 열 때는 `[[EQUATION:` 로 열고, 닫을 때는 `]]` 로 정확하게 닫아야 합니다.

- 🚨 **[<보기> 박스 문항 특별 주의 (선지와 혼동 금지! 다중 문항 누락 폭주 경고!)]** 🚨
  한 페이지에 여러 문제가 빽빽하게 있을 때, AI가 문서 분석에 피로를 느껴 문제 내부의 <보기> 명제 상자(ㄱ. ... ㄴ. ... ㄷ. ...)를 통째로 스킵하고 날려버리는 악질적인 버그가 관찰되었습니다!
  <보기> 상자 안에 제시된 'ㄱ. ...', 'ㄴ. ...', 'ㄷ. ...' 등의 내용은 **반드시 문제 본문(question 필드)의 끝부분에 모두 포함하여 100% 전사**해야 합니다. 절대 귀찮다고 건너뛰지 마십시오! (이것은 1~5번 객관식 선지가 아니라 본문의 심장부입니다)
- 🚨 **[객관식 선지 중복 기재 절대 금지]** 🚨
  `question` 필드 안에는 ①, ②, ③, ④, ⑤ 와 같은 객관식 선지 내용이 단 한 글자도 들어가서는 안 됩니다. 무조건 `answer_options` 배열 안으로만 완벽하게 분리하십시오.
- 문항 번호(예: "15.", "16번")는 제외하고 문제 본문 텍스트만 작성하세요."""

url = "https://api.openai.com/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {api_key}"
}
data = {
    "model": "gpt-4o",
    "messages": [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": ocr_prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
            ]
        }
    ],
    "temperature": 0.1,
    "max_tokens": 3000
}

req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers, method="POST")
try:
    with urllib.request.urlopen(req) as response:
        resp_json = json.loads(response.read().decode('utf-8'))
        print('================ RESPONSE ================')
        print(resp_json['choices'][0]['message']['content'])
        print('==========================================')
except urllib.error.HTTPError as e:
    err_msg = e.read().decode('utf-8')
    print(f"HTTP {e.code}: {err_msg}")
