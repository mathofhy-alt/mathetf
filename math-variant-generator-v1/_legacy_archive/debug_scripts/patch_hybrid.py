import os

def patch_main():
    with open("main.py", "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Save Label reference
    old_label = 'tk.Label(main_frame, text="AI 모델 (버전) 선택:").pack(anchor="w")'
    new_label = 'self.model_label = tk.Label(main_frame, text="AI 모델 (버전) 선택:")\n        self.model_label.pack(anchor="w")'
    content = content.replace(old_label, new_label)

    # 2. Update _on_provider_change
    old_provider = """        if current_provider == "Gemini":
            self.api_key_label.config(text="Gemini API 키 (자동 저장):")
            self.model_combo.config(values=self.gemini_models)
            if self.selected_model.get() not in self.gemini_models:
                self.selected_model.set(self.gemini_models[0])
            self.api_key.set(self.gemini_key)
            self.gemini_fallback_frame.pack_forget() # Hide secondary key
        else:
            self.api_key_label.config(text="OpenAI API 키 (자동 저장):")
            self.model_combo.config(values=self.openai_models)
            if self.selected_model.get() not in self.openai_models:
                self.selected_model.set(self.openai_models[0])
            self.api_key.set(self.openai_key)
            self.gemini_fallback_frame.pack(fill="x", pady=(0, 10)) # Show secondary key"""
            
    new_provider = """        if current_provider == "Gemini":
            self.api_key_label.config(text="Gemini API 키 (자동 저장):")
            self.model_label.config(text="AI 모델 (V8 투패스 하이브리드 고정):")
            self.model_combo.config(values=["Phase 1: 3-Flash, Phase 2: 3.1-Pro"])
            self.selected_model.set("Phase 1: 3-Flash, Phase 2: 3.1-Pro")
            self.model_combo.config(state="disabled")
            self.api_key.set(self.gemini_key)
            self.gemini_fallback_frame.pack_forget() # Hide secondary key
        else:
            self.api_key_label.config(text="OpenAI API 키 (자동 저장):")
            self.model_label.config(text="AI 모델 (버전) 선택:")
            self.model_combo.config(state="readonly")
            self.model_combo.config(values=self.openai_models)
            if self.selected_model.get() not in self.openai_models:
                self.selected_model.set(self.openai_models[0])
            self.api_key.set(self.openai_key)
            self.gemini_fallback_frame.pack(fill="x", pady=(0, 10)) # Show secondary key"""
            
    content = content.replace(old_provider, new_provider)

    with open("main.py", "w", encoding="utf-8") as f:
        f.write(content)
    print("main.py patched.")

def patch_gemini():
    with open("gemini_client.py", "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update Init
    old_init = """    def __init__(self, api_key: str, model_name: str, curriculum: str = "고1 수준 (공통수학)"):
        self.api_key = api_key
        # Ensure correct model name for Gemini 3
        if model_name == "gemini-3-flash-preview":
            self.model_name = "gemini-3-flash-preview"
        elif model_name == "gemini-3.1-pro-preview":
            self.model_name = "gemini-3.1-pro-preview"
        else:
            self.model_name = model_name
            
        self.curriculum = curriculum
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_name)"""
        
    new_init = """    def __init__(self, api_key: str, model_name: str = None, curriculum: str = "고1 수준 (공통수학)"):
        self.api_key = api_key
        self.curriculum = curriculum
        genai.configure(api_key=self.api_key)
        
        # Hardcode Hybrid Dual-Pass Models
        self.model = genai.GenerativeModel("gemini-3-flash-preview") # Fallback for discovery
        self.flash_model = genai.GenerativeModel("gemini-3-flash-preview") # Phase 1 Typist
        self.pro_model = genai.GenerativeModel("gemini-3.1-pro-preview") # Phase 2 Solver
"""
    content = content.replace(old_init, new_init)

    # 2. Update phase 1 and 2 models
    # Find `self.model.generate_content_async` inside _extract_single_problem Phase 1 and Phase 2.
    # Phase 1:
    phase1_replace = "resp1 = await self.model.generate_content_async"
    phase1_new = "resp1 = await self.flash_model.generate_content_async"
    content = content.replace(phase1_replace, phase1_new)
    
    # Phase 2:
    phase2_replace = "resp2 = await self.model.generate_content_async"
    phase2_new = "resp2 = await self.pro_model.generate_content_async"
    content = content.replace(phase2_replace, phase2_new)
    
    # Variant generation
    variant_replace = "resp = await self.model.generate_content_async"
    # Wait, _generate_single_variant uses `self.model`. Let's change it to use `self.pro_model` since variants require logic.
    # But wait! _process_page_inner uses `self.model` for problem discovery.
    # So `self.model` being flash is perfect for both! Wait, variants might be better with `self.pro_model`. Let's just manually replace variants.
    def replace_variant_model(src):
        if "    def _generate_single_variant" in src:
            idx = src.find("    def _generate_single_variant")
            idx2 = src.find("resp = await self.model.generate_content_async", idx)
            if idx2 != -1:
                src = src[:idx2] + "resp = await self.pro_model.generate_content_async" + src[idx2+len("resp = await self.model.generate_content_async"):]
        return src
    
    content = replace_variant_model(content)

    with open("gemini_client.py", "w", encoding="utf-8") as f:
        f.write(content)
    print("gemini_client.py patched for Hybrid Models.")

if __name__ == "__main__":
    patch_main()
    patch_gemini()
