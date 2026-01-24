from pyhwpx import Hwp
import os
import time

def test_png_render():
    print("Initializing HWP...")
    hwp = Hwp(visible=False)
    try:
        print("Inserting equation...")
        # pyhwpx might not have insert_equation, let's use the low-level way
        # EquationProperty
        pset = hwp.HParameterSet.HEquationProperty
        hwp.HAction.GetDefault("EquationProperty", pset)
        pset.SetItem("Script", "a^2 + b^2 = c^2")
        hwp.HAction.Execute("EquationProperty", pset)
        
        print("Saving as PNG...")
        img_path = os.path.abspath("math_output.png")
        if os.path.exists(img_path):
            os.remove(img_path)
            
        # HAction "FileSaveAs" or simply SaveAs
        hwp.save_as(img_path, "PNG")
        
        time.sleep(1)
        if os.path.exists(img_path):
            print(f"Success! Saved to {img_path}")
            print(f"File size: {os.path.getsize(img_path)} bytes")
        else:
            print("Failed to save PNG.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        hwp.quit()

if __name__ == "__main__":
    test_png_render()
