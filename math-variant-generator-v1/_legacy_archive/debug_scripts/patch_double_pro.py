import os

def patch_main_pro():
    with open("main.py", "r", encoding="utf-8") as f:
        content = f.read()

    old_values = '"Phase 1: 3-Flash, Phase 2: 3.1-Pro"'
    new_values = '"Phase 1: 3.1-Pro, Phase 2: 3.1-Pro"'
    content = content.replace(old_values, new_values)

    with open("main.py", "w", encoding="utf-8") as f:
        f.write(content)
    print("main.py patched for Double Pro.")

def patch_gemini_pro():
    with open("gemini_client.py", "r", encoding="utf-8") as f:
        content = f.read()

    # Replacing the initialization block
    old_init = """        # Hardcode Hybrid Dual-Pass Models
        self.model = genai.GenerativeModel("gemini-3-flash-preview") # Fallback for discovery
        self.flash_model = genai.GenerativeModel("gemini-3-flash-preview") # Phase 1 Typist
        self.pro_model = genai.GenerativeModel("gemini-3.1-pro-preview") # Phase 2 Solver"""
        
    new_init = """        # Hardcode Hybrid Dual-Pass Models
        self.model = genai.GenerativeModel("gemini-3.1-pro-preview") # Fallback for discovery
        self.flash_model = genai.GenerativeModel("gemini-3.1-pro-preview") # Phase 1 Typist (Pro)
        self.pro_model = genai.GenerativeModel("gemini-3.1-pro-preview") # Phase 2 Solver (Pro)"""
        
    content = content.replace(old_init, new_init)

    with open("gemini_client.py", "w", encoding="utf-8") as f:
        f.write(content)
    print("gemini_client.py patched for Double Pro.")

if __name__ == "__main__":
    patch_main_pro()
    patch_gemini_pro()
