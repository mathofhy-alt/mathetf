import codecs
import re

with codecs.open('gemini_client.py', 'r', 'utf-8') as f:
    content = f.read()

# Two-Pass prompt1 Replace
old_p1_pattern = r"아래 첨부된 '원본 텍스트'에서 \*\*오직 '\{q_num\}'번 문제\*\*만 찾아내세요\. 다른 번호가 섞여 있더라도 절대 추출하지 마세요\.\s*찾아낸 '\{q_num\}'번 문제의 텍스트를 보고 1:1 번역 타자만 쳐서 `question`과 `answer_options` 영역에 채워 넣으세요\."

new_p1 = "아래 첨부된 '원본 텍스트'는 **무조건 제 {q_num}번 문제**의 내용입니다. (OCR 오작동으로 텍스트에 문항 번호가 안 보이거나 다르더라도 의심하지 말고 {q_num}번으로 처리하세요.)\n원본 텍스트 앞뒤로 다른 문제의 파편이 섞여 있다면 그 부분만 과감히 버리고, 오직 본 문항({q_num}번)의 구조를 1:1 번역 타자 쳐서 `question`과 `answer_options`에 채워 넣으세요."

content = re.sub(old_p1_pattern, new_p1, content)


# Hybrid prompt Replace
old_h1_pattern = r"첨부된 이미지에서 \*\*오직 '\{q_num\}'번 문제 영역만\*\* 찾으세요\. \(이미지에 다른 번호 문제가 함께 보이더라도 절대 무시하고, 반드시 시작 번호가 '\{q_num\}'인 문제만 정확히 추출해야 합니다\.\)\s*이 이미지를 보고 뇌를 완전히 비운 채, 눈에 보이는 픽셀 그대로 단 1개의 기호 변조 없이 `question`과 `answer_options` 영역에 전사하세요\."

new_h1 = "첨부된 이미지는 **무조건 제 {q_num}번 문제**입니다. (번호가 잘려 안 보이거나 잘못 적혀있더라도 의심하지 말고 {q_num}번으로 추출하세요.)\n이미지 위아래로 다른 문제의 파편이 살짝 보인다면 무시하고, 본 문항({q_num}번)의 픽셀 구조 그대로 단 1개의 기호 변조 없이 `question`과 `answer_options` 영역에 전사하세요."

content = re.sub(old_h1_pattern, new_h1, content)

with codecs.open('gemini_client.py', 'w', 'utf-8') as f:
    f.write(content)
print("gemini_client.py updated successfully!")
