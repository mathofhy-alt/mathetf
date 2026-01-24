import win32com.client
import os
import time

def test_dynamic_render():
    print("Initializing HWP (Dynamic Dispatch)...")
    try:
        # Use dynamic dispatch to avoid gencache attribute errors
        hwp = win32com.client.Dispatch("HWPFrame.HwpObject")
        hwp.XHwpWindows.Item(0).Visible = False
        
        print("Inserting equation...")
        # Method 1: InsertEquation (Legacy but robust)
        # Some versions need this
        hwp.HAction.Run("EquationCreate")
        
        # Method 2: Use ParameterSet with strings
        # ParameterSet is accessible via CreateSet
        pSet = hwp.HParameterSet.HEquationProperty
        hwp.HAction.GetDefault("EquationProperty", pSet)
        pSet.SetItem("Script", "a^2 + b^2 = c^2")
        hwp.HAction.Execute("EquationProperty", pSet)
        
        print("Saving as PNG...")
        img_path = os.path.abspath("math_output_dynamic.png")
        if os.path.exists(img_path):
            os.remove(img_path)
            
        # HWP can save as PNG
        # 102nd argument or similar? "PNG" format string is usually enough
        hwp.SaveAs(img_path, "PNG")
        
        time.sleep(2)
        if os.path.exists(img_path):
            print(f"Success! Saved to {img_path}")
        else:
            print("Failed to save PNG.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'hwp' in locals():
            hwp.Quit()

if __name__ == "__main__":
    test_dynamic_render()
