import google.generativeai as genai
import json

genai.configure(api_key=open("gemini_api_key.txt").read().strip())
model = genai.GenerativeModel("gemini-2.5-pro")

with open("debug_abtest.json", encoding="utf-8") as f:
    json_data = f.read()

prompt = f"""
I have extracted the text from the attached PDF image into the following JSON.
The user says there is a CRITICAL TYPO where the math equation in my JSON doesn't visually match the math equation in the original image.
Please carefully compare the image against my JSON 'question' fields.
Where is the typo? Spot the EXACT character or equation that diffs.

JSON DATA:
{json_data}
"""

sample_file = genai.upload_file(path="dist/abtest_page1.png")
response = model.generate_content([sample_file, prompt])
print(response.text)
