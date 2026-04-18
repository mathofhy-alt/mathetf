import sys
import PIL.Image
import google.generativeai as genai

api_key = open("gemini_api_key.txt", encoding="utf-8").read().strip()
genai.configure(api_key=api_key)
model = genai.GenerativeModel('gemini-1.5-pro')

paths = [
    r"C:/Users/matho/AppData/Roaming/Code/User/workspaceStorage/7af3a8cd694bd270baeba5953507d46c/DeepMind.gemini-vs-code-dev/image_cbecccb892dd.png",
    r"C:/Users/matho/AppData/Roaming/Code/User/workspaceStorage/7af3a8cd694bd270baeba5953507d46c/DeepMind.gemini-vs-code-dev/image_cf4dd2e399ca.png"
]

for p in paths:
    img = PIL.Image.open(p)
    response = model.generate_content([
        "Look at this image. This is a screenshot of a mathematical equation rendered in HWP (Hancom Office). Please describe EXACTLY what is written inside it character by character. Is there any weird spacing or rendering errors? Output the literal string you see.",
        img
    ])
    print(f"=== {p[-8:]} ===")
    print(response.text)
