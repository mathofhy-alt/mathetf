import os
import urllib.request
import json

def generate_hwp_dict():
    # Use the same API key logic as gemini_client.py
    api_key = "AIzaSyAGTur0rIYSwjURKcWnV6P05BUbWTSwE0I"
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable not set.")
        return

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={api_key}"
    
    prompt = """
    당신은 한국 고등학교 수학(고1, 수학1, 수학2, 미적분, 확률과 통계, 기하) 문제를 텍스트로 풀어내는 수식 전문 AI입니다.
    당신이 수학 문제나 해설을 텍스트로 출력할 때 사용하는 **모든 특수 기호, 연산자, 문자, 괄호 등 LaTeX 매크로 명령어**의 종합적인 목록을 작성해 주세요.
    최소 100개 이상의 명령어를 뽑아내야 하며, 누락되는 기호가 없도록 꼼꼼히 정리해 주세요.
    
    그리고 각 LaTeX 명령어가 **한글(HWP) 수식 편집기 문법으로 어떻게 번역되어야 하는지**를 1:1로 매핑해 주세요.
    
    결과는 반드시 아래의 JSON 사전(Dictionary) 형식으로만 출력해 주세요. 다른 설명은 일절 출력하지 마세요.
    
    ```json
    {
      "\\\\alpha": "alpha",
      "\\\\times": "TIMES",
      "\\\\cdots": "cdots",
      "\\\\equiv": "equiv",
      "\\\\int": "int",
      "\\\\begin{cases}": "cases {",
      "\\\\pmod": "pmod"
    }
    ```
    """

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1}
    }

    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), method="POST")
    req.add_header('Content-Type', 'application/json')

    try:
        print("요청을 보내는 중... (약 10~20초 소요될 수 있습니다)")
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            
            # 텍스트 추출
            response_text = result['candidates'][0]['content']['parts'][0]['text']
            
            # JSON 블록 추출
            import re
            json_match = re.search(r'```json\n(.*?)\n```', response_text, re.DOTALL)
            
            if json_match:
                json_str = json_match.group(1)
                
                # 결과 저장
                with open('gemini_hwp_dict.json', 'w', encoding='utf-8') as f:
                    f.write(json_str)
                
                print("\n✅ 성공적으로 gemini_hwp_dict.json 파일을 생성했습니다!")
                print(f"추출된 명령어 갯수: {len(json.loads(json_str))}개")
            else:
                print("\n❌ 실패: JSON 코드 블록을 찾을 수 없습니다.")
                print("전체 원본 응답:\n", response_text)
                
    except Exception as e:
        print(f"오류 발생: {e}")

if __name__ == '__main__':
    generate_hwp_dict()
