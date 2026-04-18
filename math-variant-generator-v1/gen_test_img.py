import sys
import os

# Create a simple synthetic HTML file with the math problem
html_content = """
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Malgun Gothic', sans-serif; padding: 40px; font-size: 18px; line-height: 1.6; }
  .problem-box { border: 1px solid black; padding: 20px; margin-top: 15px; margin-bottom: 20px; }
  .options { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 10px; }
</style>
</head>
<body>
  <div>
    <strong>15.</strong> -1 &le; <i>x</i> &le; 3 에서 이차함수 <i>f(x)</i> = (<i>x</i> - <i>a</i>)<sup>2</sup> + <i>b</i> 의 최솟값이 4일 때, 두 실수 <i>a, b</i> 에 대하여 옳은 것을 &lt;보기&gt;에서 있는 대로 고른 것은?
  </div>
  
  <div class="problem-box">
    &lt;보기&gt;<br>
    ㄱ. <i>a</i> = 2 일 때, <i>b</i> = 4 이다.<br>
    ㄴ. <i>a</i> &le; 1 일 때, <i>b</i> = -<i>a</i><sup>2</sup> + 2<i>a</i> + 5 이다.<br>
    ㄷ. <i>a</i> + <i>b</i> 의 최댓값은 7이다.
  </div>
  
  <div class="options">
    <span>① ㄱ</span>
    <span>② ㄷ</span>
    <span>③ ㄱ, ㄴ</span>
    <span>④ ㄱ, ㄷ</span>
    <span>⑤ ㄴ, ㄷ</span>
  </div>
</body>
</html>
"""

with open("temp_test_problem.html", "w", encoding="utf-8") as f:
    f.write(html_content)

print("Generated temp_test_problem.html")
