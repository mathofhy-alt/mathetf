import os
from pypdf import PdfReader, PdfWriter
import tempfile
import google.generativeai as genai

api_key = "AIzaSyDvlzRyfxFJ76h6pVddExvp3TKSe1hp57M"
genai.configure(api_key=api_key)

model = genai.GenerativeModel('gemini-3-flash-preview')

reader = PdfReader("dist/this.pdf")
page = reader.pages[2] # 3rd page

import copy
bottom_half = copy.copy(page)

# getting the height
height = float(bottom_half.mediabox.height)
# Keep only the bottom half
bottom_half.mediabox.top = height / 2

writer = PdfWriter()
writer.add_page(bottom_half)

# Use NamedTemporaryFile correctly for Windows
with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
    temp_path = tmp.name
with open(temp_path, 'wb') as f:
    writer.write(f)

sample_file = genai.upload_file(path=temp_path)

prompt = """Find all math problems and list them. Output ONLY the original text of the problems. No JSON needed, just raw text."""

response = model.generate_content([sample_file, prompt])
print("RESPONSE from Bottom Half:")
print(response.text)
