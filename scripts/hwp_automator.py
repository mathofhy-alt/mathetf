import sys
import os
import io
import json
import argparse
import time
import win32com.client as win32

# Encoding Fix
sys.stdout = io.TextIOWrapper(sys.stdout.detach(), encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.detach(), encoding='utf-8')

try:
    from hwpx_manager import create_temp_hwpx
except ImportError:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from hwpx_manager import create_temp_hwpx

def merge_using_automation(json_path, template_path, output_path):
    print("Starting HWP Automation (Insert Mode)...")
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    hwp = None
    try:
        # Initialize HWP
        hwp = win32.gencache.EnsureDispatch("HWPFrame.HwpObject")
        hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
        hwp.XHwpWindows.Item(0).Visible = True
        
        # Open Template
        print(f"Opening template file: {template_path}")
        hwp.Open(template_path)
        hwp.MovePos(3) # Move to End of Document

        total_questions = len(data)
        print(f"Processing {total_questions} questions...")

        for idx, item in enumerate(data):
            content_xml = item.get('text', '')
            # Start with NO header to force unified style (Step 692)
            # header_xml = item.get('header', None) 
            
            if not content_xml: continue
            
            # Create a temporary HWPX file for this chunk
            # Pass None for header to force default styles (Ctrl+2/Body)
            temp_file = create_temp_hwpx(content_xml, template_path, None)
            
            if temp_file and os.path.exists(temp_file):
                print(f"Inserting Question {idx+1}/{total_questions}...")
                
                # Insert and Apply Style (Ctrl+2) Per Question (Step 704 Logic)
                try:
                    # 1. Capture Start Position
                    try:
                        start_list, start_para, start_pos = hwp.GetPos()
                    except:
                        # Fallback for some pywin32 versions returning objects
                        pos_obj = hwp.GetPos()
                        start_list, start_para, start_pos = pos_obj
                    
                    # 2. Insert
                    hwp.Insert(temp_file)
                    
                    # 3. Capture End Position
                    try:
                        end_list, end_para, end_pos = hwp.GetPos()
                    except:
                        pos_obj = hwp.GetPos()
                        end_list, end_para, end_pos = pos_obj
                    
                    # 4. Select Range (Start -> End)
                    # Move to Start
                    hwp.SetPos(start_list, start_para, start_pos)
                    # Start Selection Mode (F3)
                    hwp.Run("Select")
                    # Move to End (Expands selection)
                    hwp.SetPos(end_list, end_para, end_pos)
                    
                    # 5. Apply Style (Ctrl+2) for Body Text
                    hwp.Run("StyleShortcut2")
                    
                    # 6. Deselect and Move to End
                    hwp.Run("Cancel")
                    hwp.MovePos(3) # Document End
                    
                    hwp.Run("BreakPara") # Spacing
                    hwp.Run("BreakPara") # Spacing
                    
                except Exception as e:
                    print(f"Error inserting file {temp_file}: {e}")
                
                # Cleanup temp file
                try: os.remove(temp_file)
                except: pass
            else:
                print(f"Failed to create temp file for Q{idx+1}")

        # [User Request]: Process EndNotes (미주) - Apply Ctrl+2 twice
        print("Processing EndNotes...")
        try:
            ctrl = hwp.HeadCtrl
            while ctrl:
                if ctrl.CtrlID == "en": # EndNote
                    try:
                        # Move to the EndNote position
                        anchor = ctrl.GetAnchorPos(0)
                        if anchor: 
                            if isinstance(anchor, tuple):
                                hwp.SetPos(*anchor)
                            else:
                                # If it's a Set object (Item("List"), etc)
                                # Try-except block for safe property access
                                try:
                                    hwp.SetPos(anchor.Item("List"), anchor.Item("Para"), anchor.Item("Pos"))
                                except:
                                    # Fallback: maybe just MovePos(201) and find? No, SetPos is best.
                                    pass
                            
                            # Enter Note
                            hwp.Run("NoteModify")
                            
                            # Apply Style
                            hwp.Run("SelectAll") # Inside the note implies note content
                            hwp.Run("StyleShortcut2")
                            # User requested twice
                            hwp.Run("StyleShortcut2") 
                            
                            # Exit Note
                            hwp.Run("CloseEx")
                    except Exception as e_note:
                        print(f"Error processing EndNote: {e_note}")
                        # If stuck in note, try exit
                        try: hwp.Run("CloseEx") 
                        except: pass
                        
                ctrl = ctrl.Next
        except Exception as e:
            print(f"Error iterating controls: {e}")

        # Save Final Output
        hwp.SaveAs(output_path, "HWPX")
        print(f"Successfully saved to {output_path}")

    except Exception as e:
        print(f"Automation Error: {e}")
        import traceback
        traceback.print_exc()
        raise e
    finally:
        if hwp:
            hwp.Quit()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('json_path')
    parser.add_argument('template_path')
    parser.add_argument('output_path')
    args = parser.parse_args()
    
    merge_using_automation(args.json_path, args.template_path, args.output_path)
