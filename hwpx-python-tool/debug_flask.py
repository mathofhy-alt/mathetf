from flask import Flask
from apscheduler.schedulers.background import BackgroundScheduler
import time
import os

# Try importing the renderer (but not using it yet, just import)
try:
    from math_renderer import get_renderer
    print("Renderer imported successfully")
except ImportError as e:
    print(f"Renderer import failed: {e}")

app = Flask(__name__)

scheduler = BackgroundScheduler()
scheduler.start()

import signal
import sys

def signal_handler(sig, frame):
    print("\nShutting down server (TEST SIGNAL HANDLER)...")
    try:
        from math_renderer import get_renderer
        renderer = get_renderer()
        renderer.quit()
    except Exception as e: 
        print(f"Error in shutdown: {e}")
    scheduler.shutdown()
    os._exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

@app.route('/')
def hello():
    return "Hello World with Scheduler"

if __name__ == '__main__':
    print("Starting debug server with scheduler...")
    try:
        app.run(host='0.0.0.0', port=5001, debug=True, use_reloader=False)
    finally:
        scheduler.shutdown()

