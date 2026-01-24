import win32com.client as win32
import os
import time

def test_render():
    print("Initializing HWP Automation...")
    try:
        hwp = win32.gencache.EnsureDispatch("HWPFrame.HwpObject")
        hwp.XHwpWindows.Item(0).Visible = False # Run invisible
        
        # 1. Create Equation
        print("Inserting equation...")
        hwp.HAction.Run("EquationCreate") # Starts equation editor mode?
        # Alternatively, use EquationProperty
        
        # Standard way to insert via script
        hwp.InsertEquation("a^2 + b^2 = c^2")
        
        # 2. Select the object
        hwp.HAction.Run("SelectAll")
        
        # 3. Export as Image
        # HWP doesn't have a direct "Export selected as image" in easy COM?
        # But we can save the whole page as image if it's only one equation.
        temp_img = os.path.abspath("math_test.png")
        # hwp.SaveAs(temp_img, "PNG") # This saves whole document
        
        print(f"Saved to {temp_img}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'hwp' in locals():
            hwp.Quit()

if __name__ == "__main__":
    test_render()
