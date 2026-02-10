import os
import json
import subprocess
import time

def test_batch():
    python_path = r"hwpx-python-tool\venv\Scripts\python.exe"
    script_path = r"scripts\batch_resize_image.py"
    
    # Create test images if possible or use existing ones if known
    # For now, let's just try to call it with empty or mock tasks to see if it responds
    test_input = {
        "tasks": [],
        "max_width": 1000,
        "quality": 80
    }
    
    start = time.time()
    process = subprocess.Popen(
        [python_path, script_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    stdout, stderr = process.communicate(input=json.dumps(test_input))
    elapsed = time.time() - start
    
    print(f"Status Code: {process.returncode}")
    print(f"STDOUT: {stdout}")
    print(f"STDERR: {stderr}")
    print(f"Time: {elapsed:.2f}s")

if __name__ == "__main__":
    if os.path.exists(r"hwpx-python-tool\venv\Scripts\python.exe"):
        test_batch()
    else:
        print("Python venv not found. Skipping test.")
