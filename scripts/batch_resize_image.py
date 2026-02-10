import sys
import os
import json
import time
from PIL import Image
from multiprocessing import Pool, cpu_count

def resize_single(task):
    """
    Worker function to resize a single image.
    Task: (input_path, output_path, max_width, quality)
    """
    input_path, output_path, max_width, quality = task
    try:
        if not os.path.exists(input_path):
            return {"path": input_path, "success": False, "error": "Input missing"}
        
        with Image.open(input_path) as img:
            width, height = img.size
            if width > max_width:
                ratio = max_width / width
                new_height = int(height * ratio)
                img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
            
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            img.save(output_path, "JPEG", quality=quality, optimize=True)
            
            return {
                "path": input_path,
                "success": True,
                "in_size": os.path.getsize(input_path),
                "out_size": os.path.getsize(output_path)
            }
    except Exception as e:
        return {"path": input_path, "success": False, "error": str(e)}

def batch_process(json_input):
    try:
        data = json.loads(json_input)
        tasks = data.get("tasks", [])
        max_width = data.get("max_width", 1000)
        quality = data.get("quality", 80)
        
        if not tasks:
            return {"success": True, "results": [], "msg": "No tasks provided"}
        
        # Prepare arguments for multiprocessing
        worker_args = [
            (t["input"], t["output"], max_width, quality) 
            for t in tasks
        ]
        
        # Use CPU cores efficiently
        num_workers = min(len(tasks), cpu_count())
        start_time = time.time()
        
        with Pool(processes=num_workers) as pool:
            results = pool.map(resize_single, worker_args)
        
        elapsed = time.time() - start_time
        
        return {
            "success": True,
            "results": results,
            "elapsed_ms": int(elapsed * 1000),
            "worker_count": num_workers
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    # Expecting JSON string as single argument or via stdin
    try:
        if len(sys.argv) > 1:
            raw_input = sys.argv[1]
        else:
            raw_input = sys.stdin.read()
            
        result = batch_process(raw_input)
        print(json.dumps(result))
    except Exception as fatal:
        print(json.dumps({"success": False, "error": f"Fatal: {str(fatal)}"}))
