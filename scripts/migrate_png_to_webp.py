import os
import requests
import io
import re
from PIL import Image

def load_env():
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
    env_vars = {}
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip() and not line.startswith('#'):
                parts = line.strip().split('=', 1)
                if len(parts) == 2:
                    env_vars[parts[0]] = parts[1]
    return env_vars

def main():
    env = load_env()
    SUPABASE_URL = env.get("NEXT_PUBLIC_SUPABASE_URL")
    SUPABASE_KEY = env.get("SUPABASE_SERVICE_ROLE_KEY")

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Missing Supabase credentials in .env.local")
        return

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    print("Fetching PNG records from question_images...")
    resp = requests.get(f"{SUPABASE_URL}/rest/v1/question_images?format=eq.png", headers=headers)
    resp.raise_for_status()
    images = resp.json()

    if not images:
        print("No PNG images found to convert.")
        return

    print(f"Found {len(images)} PNG images. Starting conversion...")

    success_count = 0
    fail_count = 0

    for img_row in images:
        old_url = img_row.get('data')
        img_id = img_row.get('id')
        
        if not old_url:
            continue
            
        print(f"Processing ID: {img_id}")
        
        # Download image
        img_resp = requests.get(old_url)
        if img_resp.status_code != 200:
            print(f"  [ERROR] Failed to download image from {old_url}")
            fail_count += 1
            continue

        try:    
            img = Image.open(io.BytesIO(img_resp.content))
            
            # Convert to WebP
            webp_buffer = io.BytesIO()
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGBA")
            else:
                img = img.convert("RGB")
                
            img.save(webp_buffer, format="WEBP", quality=85)
            webp_bytes = webp_buffer.getvalue()
        except Exception as e:
            print(f"  [ERROR] Error converting image {img_id}: {e}")
            fail_count += 1
            continue
            
        # Parse bucket and path
        # Example: https://.../storage/v1/object/public/hwpx/manual_captures/file.png
        match = re.search(r'/storage/v1/object/public/([^/]+)/(.*)', old_url)
        if not match:
            print(f"  [ERROR] Could not parse bucket and path from URL: {old_url}")
            fail_count += 1
            continue
            
        bucket = match.group(1)
        path = match.group(2)
        new_path = path.rsplit('.png', 1)[0] + '.webp'
        
        upload_url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{new_path}"
        
        upload_resp = requests.post(upload_url, headers={
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "image/webp"
        }, data=webp_bytes)

        if upload_resp.status_code not in (200, 201):
            if "Duplicate" in upload_resp.text or "already exists" in upload_resp.text:
                print(f"  [INFO] WebP already exists in storage. Proceeding to update DB.")
            else:
                print(f"  [ERROR] Failed to upload WebP for ID {img_id}: {upload_resp.text}")
                fail_count += 1
                continue
        
        # Get public URL
        new_url = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{new_path}"
        
        # Update question_images table
        update_resp = requests.patch(f"{SUPABASE_URL}/rest/v1/question_images?id=eq.{img_id}", headers=headers, json={
            "format": "webp",
            "data": new_url,
            "size_bytes": len(webp_bytes)
        })
        
        if update_resp.status_code not in (200, 204):
            print(f"  [ERROR] Failed to update database for ID {img_id}: {update_resp.text}")
            fail_count += 1
            continue
            
        print(f"  [SUCCESS] Migrated {img_id} to WebP.")
        success_count += 1

    print(f"\nMigration complete! Success: {success_count}, Failed: {fail_count}")

if __name__ == '__main__':
    main()
