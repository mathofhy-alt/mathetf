# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('gemini_hwp_dict.json', '.')],
    hiddenimports=[
        'gemini_client', 'crop_review_dialog', 'json_repair'
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['ultralytics', 'torch', 'torchvision'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='MathVariantGen_v1',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
