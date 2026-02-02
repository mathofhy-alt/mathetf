
import sys
import os
from PIL import Image

def resize(input_path, output_path):
    try:
        with Image.open(input_path) as img:
            # Check dimensions
            width, height = img.size
            if width > 1000:
                # Calculate new height
                ratio = 1000 / width
                new_height = int(height * ratio)
                # High quality downsampling
                img = img.resize((1000, new_height), Image.Resampling.LANCZOS)
            
            # Safe Conversion to RGB (Handles RGBA, P, CMYK, L, etc.)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Save as JPEG with 80 quality (Standard Web Optimization)
            img.save(output_path, "JPEG", quality=80, optimize=True)
            return True
    except Exception as e:
        print(f"Error: {e}")
        return False

def log(msg):
    with open("python_resize.log", "a", encoding="utf-8") as f:
        f.write(msg + "\n")

if __name__ == "__main__":
    try:
        if len(sys.argv) < 3:
            log("Error: Args missing")
            print("Usage: resize_image.py <input> <output>")
            sys.exit(1)
        
        input_file = sys.argv[1]
        output_file = sys.argv[2]
        
        log(f"Start: {input_file} -> {output_file}")

        if not os.path.exists(input_file):
            log(f"Input missing: {input_file}")
            print(f"Input file not found: {input_file}")
            sys.exit(1)

        success = resize(input_file, output_file)
        if success:
            if os.path.exists(output_file):
                in_size = os.path.getsize(input_file)
                out_size = os.path.getsize(output_file)
                log(f"Success: {in_size} -> {out_size}")
            print("SUCCESS")
        else:
            log("Resize func returned False")
            sys.exit(1)
    except Exception as e:
        log(f"Exception: {e}")
        sys.exit(1)
