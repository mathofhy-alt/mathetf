import asyncio
import google.generativeai as genai
import fitz
import tempfile
from PIL import Image

async def analyze_visuals():
    gemini_key = open("gemini_api_key.txt", "r", encoding="utf-8").read().strip()
    genai.configure(api_key=gemini_key)
    model = genai.GenerativeModel("gemini-2.5-pro")

    doc = fitz.open("dist/abtest.pdf")
    page = doc[0]
    mat = fitz.Matrix(2, 2)
    pix = page.get_pixmap(matrix=mat)
    mode = "RGBA" if pix.alpha else "RGB"
    img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
    if mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        img_path = tmp.name
    img.save(img_path)

    sample_file = genai.upload_file(path=img_path)

    prompt = """
    이 이미지는 두 개의 수학 문제(1번, 2번)를 포함하고 있습니다. 문제를 풀지 말고, 내 질문에 시각적으로 정확하게 대답해주세요.
    
    질문 1: 1번 문제의 두 번째 수식(분수가 포함된 큰 수식)을 자세히 보세요.
    첫 번째 분수는 분자가 5beta 이고 분모가 alpha 인가요? 아니면 bar 가 어디에 어떻게 붙어있나요?
    두 번째 분수는 분자가 5 bar beta 이고 분모가 bar alpha 인가요? 눈에 보이는 그대로, 켤레복소수 막대(bar)가 정확히 어느 글자 위에 그어져 있는지 묘사해주세요.

    질문 2: 2번 문제의 <보기> 부분에서 'ㄷ' 항목을 정확히 읽어주세요. "의 최댓값은" 이라고 적혀있나요 아니면 "의 최솟값은" 이라고 적혀있나요? 단어 하나하나 정확하게 써주세요.
    """

    resp = await model.generate_content_async([sample_file, prompt])
    print(resp.text)

if __name__ == "__main__":
    asyncio.run(analyze_visuals())
