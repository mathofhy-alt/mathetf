"""e2.pdf 직접 변환 테스트 (CLI)"""
import asyncio, os, sys, json

# dist 폴더 기준으로 실행해야 API 키 파일 읽힘
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")

def read_file(name):
    p = os.path.join(BASE, name)
    return open(p, encoding="utf-8").read().strip() if os.path.exists(p) else ""

GEMINI_KEY  = read_file("gemini_api_key.txt")
MATHPIX_ID  = read_file("mathpix_app_id.txt")
MATHPIX_KEY = read_file("mathpix_app_key.txt")
PDF_PATH    = os.path.join(BASE, "e2.pdf")

print(f"Gemini key: {'OK' if GEMINI_KEY else 'MISSING'}")
print(f"Mathpix id: {'OK' if MATHPIX_ID else 'MISSING'}")
print(f"Mathpix key: {'OK' if MATHPIX_KEY else 'MISSING'}")
print(f"PDF: {PDF_PATH}")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gemini_client import GeminiMathParser
from hml_generator import HMLGenerator

parser = GeminiMathParser(
    api_key=GEMINI_KEY,
    model_name="대안 2: Mathpix(OCR) + Gemini Pro(해설) - 무결점/유료",
    curriculum="고1 수준 (공통수학)",
    mathpix_app_id=MATHPIX_ID,
    mathpix_app_key=MATHPIX_KEY
)

def log(msg):
    print(msg, flush=True)

problems = asyncio.run(parser.extract_math_problems(PDF_PATH, log_callback=log))

if problems:
    print(f"\n✅ {len(problems)}개 문항 추출 완료")
    out_json = os.path.join(BASE, "e2_debug_cli.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(problems, f, ensure_ascii=False, indent=2)
    print(f"JSON 저장: {out_json}")

    gen = HMLGenerator()
    for i, p in enumerate(problems, 1):
        gen.add_problem(p, i)
    out_hml = os.path.join(BASE, "e2_cli.hml")
    gen.save(out_hml)
    print(f"HML 저장: {out_hml}")
else:
    print("❌ 추출 실패")
