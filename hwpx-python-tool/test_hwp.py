import win32com.client as win32
import pythoncom
import time
import os
import subprocess

def test_hwp():
    print("Starting HWP process...")
    try:
        hwp_path = "C:\\Program Files (x86)\\Hnc\\HOffice9\\Bin\\Hwp.exe"
        subprocess.Popen([hwp_path])
        print(f"Launched {hwp_path}. Waiting 10s...")
        time.sleep(10)
    except Exception as e:
        print(f"Could not pre-launch HWP: {e}")

    print("Initializing COM...")
    pythoncom.CoInitialize()
    try:
        print("Dispatching HWP (connecting to active or starting new)...")
        hwp = win32.Dispatch("HWPFrame.HwpObject")
        print("HWP Dispatched.")
        
        # Try to make it visible to see if any dialog appears
        try:
            hwp.XHwpWindows.Item(0).Visible = True
            print("HWP Set to Visible.")
        except:
            print("Could not set visible.")

        print("Running FileNew...")
        hwp.HAction.Run("FileNew")
        
        print("Inserting Equation via EquationProperty...")
        pset = hwp.CreateSet("EquationProperty")
        hwp.HAction.GetDefault("EquationProperty", pset)
        pset.SetItem("Script", "a+b=c")
        hwp.HAction.Execute("EquationProperty", pset)
        print("Equation Inserted.")

        # Try multiple save strategies
        temp_path = os.path.abspath("test_render_final.png")
        if os.path.exists(temp_path): os.remove(temp_path)
        
        print("Strategy 1: Action Set FileSaveAs...")
        try:
            pset = hwp.CreateSet("FileSaveAs")
            pset.SetItem("FileName", temp_path)
            pset.SetItem("Format", "PNG")
            hwp.HAction.Execute("FileSaveAs", pset)
            time.sleep(2)
        except Exception as e:
            print(f"Strategy 1 Failed: {e}")

        if not os.path.exists(temp_path):
            print("Strategy 2: Basic SaveAs with positional args...")
            try:
                hwp.SaveAs(temp_path, "PNG", "Resolution:300")
                time.sleep(2)
            except Exception as e:
                print(f"Strategy 2 Failed: {e}")

        if not os.path.exists(temp_path):
            print("Strategy 3: Basic SaveAs without options...")
            try:
                hwp.SaveAs(temp_path, "PNG", "")
                time.sleep(2)
            except Exception as e:
                print(f"Strategy 3 Failed: {e}")

        print("Waiting for file...")
        for _ in range(20):
            if os.path.exists(temp_path):
                print(f"SUCCESS! Rendered to {temp_path}")
                return
            time.sleep(0.5)
        print("FAILED: All strategies failed to create the file.")

    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
    finally:
        pythoncom.CoUninitialize()

if __name__ == "__main__":
    test_hwp()
