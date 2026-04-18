import google.generativeai as genai
import os

genai.configure(api_key=open("gemini_api_key.txt").read().strip())
model = genai.GenerativeModel("gemini-2.5-pro")

prompt = """
Look at the equations in Problem 1 and Problem 2 VERY CAREFULLY.
Transcribe the mathematical equations EXACTLY as they appear into standard LaTeX.
Pay extraordinary attention to numerators and denominators.
Pay extraordinary attention to negative signs, exponents, and limits.
Output your transcription clearly.
"""

sample_file = genai.upload_file(path="dist/abtest_page1.png")
response = model.generate_content([sample_file, prompt])
print(response.text)
