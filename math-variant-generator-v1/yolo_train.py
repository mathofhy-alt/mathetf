import os, shutil, glob

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TRAIN_DATA_ROOT = os.path.join(BASE_DIR, "training_data")
DIST_DIR = os.path.join(BASE_DIR, "dist")

if not os.path.exists(TRAIN_DATA_ROOT) and os.path.exists(os.path.join(DIST_DIR, "training_data")):
    TRAIN_DATA_ROOT = os.path.join(DIST_DIR, "training_data")

print(f"[데이터 경로] {TRAIN_DATA_ROOT}")
MERGED_DIR = os.path.join(BASE_DIR, "yolo_dataset")
MERGED_IMAGES = os.path.join(MERGED_DIR, "images", "train")
MERGED_LABELS = os.path.join(MERGED_DIR, "labels", "train")

os.makedirs(MERGED_IMAGES, exist_ok=True)
os.makedirs(MERGED_LABELS, exist_ok=True)

print("[1/4] training_data/ 병합 중...")
img_count = 0
for pdf_folder in glob.glob(os.path.join(TRAIN_DATA_ROOT, "*")):
    img_dir = os.path.join(pdf_folder, "images")
    lbl_dir = os.path.join(pdf_folder, "labels")
    if not os.path.isdir(img_dir): continue
    for img_path in glob.glob(os.path.join(img_dir, "*.jpg")) + glob.glob(os.path.join(img_dir, "*.png")):
        stem = os.path.splitext(os.path.basename(img_path))[0]
        lbl_path = os.path.join(lbl_dir, stem + ".txt")
        if not os.path.exists(lbl_path): continue
        pdf_name = os.path.basename(pdf_folder)
        new_stem = f"{pdf_name}_{stem}"
        shutil.copy2(img_path, os.path.join(MERGED_IMAGES, new_stem + os.path.splitext(img_path)[1]))
        shutil.copy2(lbl_path, os.path.join(MERGED_LABELS, new_stem + ".txt"))
        img_count += 1

print(f"    병합 완료: {img_count}장")

print("[2/4] dataset.yaml 생성 중...")
yaml_path = os.path.join(MERGED_DIR, "dataset.yaml")
with open(yaml_path, "w", encoding="utf-8") as f:
    f.write(f"path: {MERGED_DIR}\ntrain: images/train\nval: images/train\nnc: 1\nnames: ['problem']\n")

if __name__ == '__main__':
    print("[3/4] YOLOv8 학습 시작...")
    from ultralytics import YOLO
    model = YOLO("yolov8n.pt")
    results = model.train(
        data=yaml_path,
        epochs=100,
        imgsz=1280,
        batch=4,
        name="problem_detector",
        project=os.path.join(BASE_DIR, "runs", "detect"),
        patience=20,
        workers=0,
        save=True,
        device="0" if __import__("torch").cuda.is_available() else "cpu"
    )

    print("[4/4] problem_detector.pt 복사 중...")
    best_pt = os.path.join(BASE_DIR, "runs", "detect", "problem_detector", "weights", "best.pt")
    if os.path.exists(best_pt):
        dst = os.path.join(BASE_DIR, "problem_detector.pt")
        shutil.copy2(best_pt, dst)
        print("✅ 최상단 폴더에 모델 복사 완료!")
