import win32com.client as win32
import pythoncom
import os
import time
import base64
import uuid
import subprocess
import threading
import queue
import logging

class HwpMathRenderer:
    def __init__(self):
        self.hwp = None
        self.request_queue = queue.Queue()
        self.worker_thread = threading.Thread(target=self._worker, daemon=True)
        self.worker_thread.start()
        self._log("HwpMathRenderer initialized (Worker Thread Mode)")

    def _log(self, msg):
        try:
            with open("renderer.log", "a", encoding="utf-8") as f:
                f.write(f"[{time.ctime()}] {msg}\n")
        except: pass
        print(msg)

    def _init_hwp(self):
        """
        Modified to NEVER spawn HWP automatically.
        It waits for the user to launch HWP manually.
        """
        try:
            pythoncom.CoInitialize()
            
            # 1. Existing connection check
            if self.hwp:
                try:
                    self.hwp.HAction.Run("FileNew")
                    return True
                except:
                    self.hwp = None
            
            # 2. Loop until we connect to a MANUALLY launched instance
            # Try GetActiveObject first, then Dispatch
            try:
                from win32com.client import GetActiveObject
                self.hwp = GetActiveObject("HWPFrame.HwpObject")
                self._log("  Connected to existing HWP instance (GetActiveObject).")
                try: self.hwp.XHwpWindows.Item(0).Visible = True
                except: pass
                return True
            except:
                try:
                    # Fallback: Sometimes Dispatch finds existing instance when GetActiveObject fails
                    self.hwp = win32.Dispatch("HWPFrame.HwpObject")
                    self._log("  Connected to HWP instance (Dispatch).")
                    try: self.hwp.XHwpWindows.Item(0).Visible = True
                    except: pass
                    return True
                except:
                    self._log("  Waiting for HWP... Please Open Hancom Office (Hwp.exe) MANUALLY.")
                    time.sleep(5.0)
                    return False

        except Exception as e:
            self._log(f"CRITICAL: Init Failure: {e}")
            self.hwp = None
            return False

    def _worker(self):
        """Dedicated thread for HWP operations."""
        pythoncom.CoInitialize()
        while True:
            try:
                # Get request
                req = self.request_queue.get()
                if req is None: break # Shutdown
                
                script, result_queue = req
                
                # Perform rendering
                try:
                    img_data = self._do_render(script)
                    result_queue.put(img_data)
                except Exception as e:
                    self._log(f"Worker render error: {e}")
                    result_queue.put(None)
                finally:
                    self.request_queue.task_done()
            except Exception as e:
                self._log(f"Worker loop fatal error: {e}")
                time.sleep(1)

    def _do_render(self, script):
        if not self._init_hwp():
            return None

        self._log(f"Rendering: {script}")
        try:
            hwp = self.hwp
            
            # Clear document instead of FileNew (prevents 'Save Changes?' prompt)
            try:
                hwp.MovePos(2) # Move to top
                hwp.HAction.Run("SelectAll")
                hwp.HAction.Run("Delete")
            except:
                pass # If file is empty or fails, proceed
            
            # Insert Equation
            success = False
            try:
                pset = hwp.CreateSet("EquationProperty")
                hwp.HAction.GetDefault("EquationProperty", pset)
                pset.SetItem("Script", script)
                hwp.HAction.Execute("EquationProperty", pset)
                success = True
            except:
                try:
                    hwp.InsertEquation(script)
                    success = True
                except: pass
            
            if not success: return None

            # Save PNG (300 DPI)
            temp_id = str(uuid.uuid4())
            temp_path = os.path.abspath(f"temp_math_{temp_id}.png")
            alt_path = temp_path.replace(".png", "001.png")
            
            save_success = False
            try:
                pset = hwp.CreateSet("FileSaveAs")
                hwp.HAction.GetDefault("FileSaveAs", pset)
                pset.SetItem("FileName", temp_path)
                pset.SetItem("Format", "PNG")
                pset.SetItem("Resolution", 300)
                hwp.HAction.Execute("FileSaveAs", pset)
                save_success = True
            except:
                try:
                    hwp.SaveAs(temp_path, "PNG", "Resolution:300")
                    save_success = True
                except:
                    try:
                        hwp.SaveAs(temp_path, "PNG", "")
                        save_success = True
                    except: pass
            
            # File check
            image_path = None
            for _ in range(50):
                if os.path.exists(temp_path): image_path = temp_path; break
                if os.path.exists(alt_path): image_path = alt_path; break
                time.sleep(0.1)

            if not image_path:
                self._log(f"  Error: PNG save timeout for {script[:20]}...")
                return None

            with open(image_path, "rb") as f:
                data = f.read()

            self._log(f"  Success: PNG saved ({len(data)} bytes)")

            try:
                if os.path.exists(temp_path): os.remove(temp_path)
                if os.path.exists(alt_path): os.remove(alt_path)
            except: pass
            
            return base64.b64encode(data).decode('utf-8')
        except Exception as e:
            self._log(f"Render Core Crash: {e}")
            self.hwp = None
            return None

    def render(self, script):
        """Submit a request to the worker thread and wait for result."""
        result_queue = queue.Queue()
        self.request_queue.put((script, result_queue))
        
        # Wait with 120s timeout
        try:
            return result_queue.get(timeout=120)
        except queue.Empty:
            self._log(f"Render timeout in client queue ({script[:20]}...)")
            return None

    def quit(self):
        self.request_queue.put(None)
        if self.worker_thread.is_alive():
            self.worker_thread.join(timeout=5)
        # No more killing processes automatically

# Global Singleton
_renderer_instance = None
def get_renderer():
    global _renderer_instance
    if _renderer_instance is None:
        _renderer_instance = HwpMathRenderer()
    return _renderer_instance
