import re

def main():
    with open("gemini_client.py", "r", encoding="utf-8") as f:
        content = f.read()

    # Search for the dangerous "과감히 버리고" instruction and replace it
    
    old_text = "원본 텍스트 앞뒤로 다른 문제의 파편이 섞여 있다면 그 부분만 과감히 버리고, 오직 본 문항({q_num}번)의 구조를 1:1 번역 타자 쳐서 `question`과 `answer_options`에 채워 넣으세요."
    new_text = "이 텍스트 안에 있는 모든 수식과 문장을 **단 한 글자도, 단 하나의 수식도 절대 빠뜨리지 말고(버리지 말고) 100% 모두** `question`과 `answer_options` 안에 1:1로 번역해 넣으세요."
    
    if old_text in content:
        content = content.replace(old_text, new_text)
        print("Success: Replaced first dangerous prompt instruction.")
    else:
        print("Error: Could not find first instruction.")
        
    old_text_hybrid = "원본 텍스트 앞뒤로 다른 부분(다른 문제 파편 등)이 섞여 있다면 그 부분만 과감히 버리고, 오직 본 문항({q_num}번)의 구조를 1:1 타자 쳐서 `question`과 `answer_options`에 채워 넣으세요."
    new_text_hybrid = "이 텍스트 안에 있는 모든 수식과 문장을 **단 한 글자도, 단 하나의 수식도 절대 빠뜨리지 말고(버리지 말고) 100% 모두** `question`과 `answer_options` 안에 1:1로 번역해 넣으세요."
    
    if old_text_hybrid in content:
        content = content.replace(old_text_hybrid, new_text_hybrid)
        print("Success: Replaced hybrid dangerous prompt instruction.")
    else:
        print("Error: Could not find hybrid instruction.")

    with open("gemini_client.py", "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
