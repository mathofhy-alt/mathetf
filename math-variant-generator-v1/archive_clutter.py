import os
import shutil
import glob

archive_dir = '_legacy_archive'
dirs_to_create = ['specs', 'debug_scripts', 'debug_data', 'old_exes', 'others']

for d in dirs_to_create:
    os.makedirs(os.path.join(archive_dir, d), exist_ok=True)

moved_count = 0

def move_files(pattern, dest_sub):
    global moved_count
    for f in glob.glob(pattern):
        # 보호할 파일
        if os.path.basename(f) == 'MathVariantGen_v1.spec': continue
        if os.path.basename(f) == 'archive_clutter.py': continue
        if os.path.basename(f) == 'run_headless_test.py': continue
        
        if os.path.isfile(f):
            dest = os.path.join(archive_dir, dest_sub, os.path.basename(f))
            if os.path.exists(dest):
                try: os.remove(dest)
                except: pass
            
            try:
                shutil.move(f, os.path.join(archive_dir, dest_sub))
                print(f"Moved: {f} -> {dest_sub}")
                moved_count += 1
            except Exception as e:
                print(f"Failed to move {f}: {e}")

# 실행
print("Starting archive process...")

# 1. Spec files
move_files('*.spec', 'specs')

# 2. Exes
move_files('MathPDF2HML_v*.exe', 'old_exes')

# 3. Scripts
move_files('patch_*.py', 'debug_scripts')
move_files('debug_*.py', 'debug_scripts')
move_files('crop_only*.py', 'debug_scripts')
move_files('test_*.py', 'debug_scripts')
move_files('*_patched.py', 'debug_scripts')

# 4. Debug Data
move_files('debug_*.json', 'debug_data')
move_files('debug_*.png', 'debug_data')
move_files('debug_*.txt', 'debug_data')
move_files('debug_*.patch', 'debug_data')
move_files('debug_*.hml', 'debug_data')

# 5. Dist folder debug json files
for f in glob.glob('dist/debug_*.json'):
    try:
        dest = os.path.join(archive_dir, 'debug_data', os.path.basename(f))
        if os.path.exists(dest): os.remove(dest)
        shutil.move(f, os.path.join(archive_dir, 'debug_data'))
        print(f"Moved: {f} -> debug_data")
        moved_count += 1
    except:
        pass

# 6. Legacy output txt/hml
move_files('out_*.txt', 'debug_data')
move_files('*_output.json', 'debug_data')
move_files('*_output.hml', 'debug_data')

print(f"Done. Successfully archived {moved_count} files to {archive_dir}.")
