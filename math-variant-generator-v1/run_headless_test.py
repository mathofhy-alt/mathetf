import asyncio
from gemini_client import GeminiMathParser
from hml_generator import HMLGenerator
import time
import os

async def main():
    api_key = open("gemini_api_key.txt", encoding="utf-8").read().strip()
    
    # model.txt 등에서 설정값을 읽어옵니다
    model_name = "gemini-1.5-pro"
    if os.path.exists("dist/model.txt"):
        with open("dist/model.txt", encoding="utf-8") as f:
            t = f.read().strip()
            if t: "대안 2: Mathpix(OCR) + Gemini Pro(해설) - 무결점/유료"
            model_name = t
            
    curriculum = "고1 수준 (공통수학)"
    if os.path.exists("curriculum.txt"):
        with open("curriculum.txt", encoding="utf-8") as f:
            curriculum = f.read().strip()

    mathpix_id = ""
    mathpix_key = ""
    if os.path.exists("mathpix_app_id.txt"): mathpix_id = open("mathpix_app_id.txt").read().strip()
    if os.path.exists("mathpix_app_key.txt"): mathpix_key = open("mathpix_app_key.txt").read().strip()

    parser = GeminiMathParser(
        api_key=api_key, 
        model_name=model_name, 
        curriculum=curriculum,
        mathpix_app_id=mathpix_id,
        mathpix_app_key=mathpix_key
    )
    
    def log_it(msg):
        print(msg)

    pdf_path = os.path.join("dist", "2026단대2.pdf")
    print(f"==================================================")
    print(f"Starting headless extraction ON {pdf_path}")
    print(f"Model: {model_name}")
    print(f"Curriculum: {curriculum}")
    print(f"==================================================")
    
    start_time = time.time()
    try:
        # 1. 자동 크롭 판정
        print("Detecting crops...")
        page_data_list = await parser.detect_crops(pdf_path, log_callback=log_it)
        
        total_detected = sum(len(p['problem_list']) for p in page_data_list)
        print(f"Total problems detected by YOLO: {total_detected}")
        
        if total_detected == 0:
            print("No problems detected by YOLO. We can't proceed with variant gen via headless auto.")
            return
            
        print("Starting Variant Generation Pipeline...")
        # 2. 강제로 확인창(Confirmation modal)을 스킵하고 바로 변형 생성 돌입!
        # parser.extract_variants_from_crops takes page_data_list (which confirmed_data normally is)
        results = await parser.extract_variants_from_crops(
            page_data_list, 
            log_callback=log_it, 
            variant_difficulty="2단계: 중"
        )
        
        print(f"\n==== EXTRACTION DONE ({time.time() - start_time:.2f}s) ====")
        print(f"Total problems generated: {len(results) if results else 0}")
        
        if results:
            print("Extracted Question IDs:")
            for r in results:
                print(" -", r.get("question_num", "UNKNOWN"))
            
            generator = HMLGenerator()
            for i, prob in enumerate(results, 1):
                generator.add_problem(prob, i)
            out_file = os.path.join("dist", "2026단대2_변형결과.hml")
            generator.save(out_file)
            print(f"Successfully saved {out_file}")
            
    except Exception as e:
        print("\nFATAL SCRIPT ERROR:", e)

if __name__ == "__main__":
    asyncio.run(main())
