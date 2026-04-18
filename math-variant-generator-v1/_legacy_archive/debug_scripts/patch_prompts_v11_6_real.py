import re

def main():
    with open("gemini_client.py", "r", encoding="utf-8") as f:
        content = f.read()

    # Pass 1 Two-Pass Prompt Fix
    old_prompt1 = """[수식 번역가 모드 - 해설 작성 불가]
아래 첨부된 '원본 텍스트'는 **무조건 제 {q_num}번 문제**의 내용입니다. (OCR 오작동으로 텍스트에 문항 번호가 안 보이거나 다르더라도 의심하지 말고 {q_num}번으로 처리하세요.)
이 텍스트 안에 있는 모든 수식과 문장을 **단 한 글자도, 단 하나의 수식도 절대 빠뜨리지 말고(버리지 말고) 100% 모두** `question`과 `answer_options` 안에 1:1로 번역해 넣으세요."""

    new_prompt1 = """[수식 번역가 모드 - 해설 작성 불가]
아래 첨부된 '원본 텍스트'에는 제 {q_num}번 문제와 그 주변 다른 문항들의 텍스트가 섞여 있을 수 있습니다.
당신의 임무는 오직 **제 {q_num}번 문제 단 하나**에 해당하는 내용만 확실하게 발췌하는 것입니다.
단, **{q_num}번 문제에 속하는 수식과 텍스트만큼은 절대 단 한 글자도 임의로 빠뜨리거나 버리지 말고 100% 온전히** `question`과 `answer_options` 안에 1:1로 번역해야 합니다. (번호가 잘렸더라도 문맥상 {q_num}번 본문의 일부라면 무조건 살려야 합니다.)"""

    if old_prompt1 in content:
        content = content.replace(old_prompt1, new_prompt1)
        print("Success: Replaced Pass 1 prompt.")
    else:
        print("Error: Could not find Pass 1 prompt.")

    # Hybrid Prompt Fix
    old_hybrid = """[Step 1: 맹인 타이피스트 모드 (문제 추출)]
첨부된 이미지는 **무조건 제 {q_num}번 문제 하나만의 전체 내용**입니다.
이 이미지 안에 있는 모든 수식과 문장을 **단 한 글자도, 단 하나의 수식도 절대로 빠뜨리지 말고 100% 모두** `question`과 `answer_options` 안에 1:1로 전사하세요. (번호가 잘려 안 보이거나 잘못 적혀있더라도 의심하지 마세요.)"""

    new_hybrid = """[Step 1: 맹인 타이피스트 모드 (문제 추출)]
첨부된 이미지에는 제 {q_num}번 문제뿐만 아니라 위아래로 다른 문제의 파편이 섞여 있을 수 있습니다. 무조건 **제 {q_num}번 문제 단 하나**에 해당하는 영역에만 초점을 맞추세요.
단, **{q_num}번 문제에 속하는 수식과 픽셀 구조만큼은 절대 단 한 글자도 임의로 빠뜨리거나 버리지 말고 100% 온전히** `question`과 `answer_options` 영역에 1:1로 전사해야 합니다. (번호가 잘려서 안 보이더라도 문맥상 본문의 일부라면 무조건 살리세요.)"""

    if old_hybrid in content:
        content = content.replace(old_hybrid, new_hybrid)
        print("Success: Replaced Hybrid prompt.")
    else:
        print("Error: Could not find Hybrid prompt.")

    with open("gemini_client.py", "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
