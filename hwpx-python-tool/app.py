"""
Flask 웹 애플리케이션
HWPX 파일 업로드, 파싱, 문제 선택, 재조합 기능 제공
"""

import os
import time
import uuid
from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
from apscheduler.schedulers.background import BackgroundScheduler

from hwpx_parser import HwpxParser, parse_hwpx_file
from hwpx_builder import create_hwpx_from_selection


app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ["http://localhost:3000"]}})
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB 제한
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['OUTPUT_FOLDER'] = 'output'
app.config['EXTRACT_FOLDER'] = 'extracts'

# 디렉토리 생성
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)
os.makedirs(app.config['EXTRACT_FOLDER'], exist_ok=True)

# 세션 저장소 (실제 서비스에서는 Redis 등 사용)
sessions = {}


def cleanup_old_files():
    """24시간 이상 된 임시 파일 삭제"""
    now = time.time()
    cutoff_time = now - 86400  # 24시간
    
    for folder in [app.config['UPLOAD_FOLDER'], 
                   app.config['OUTPUT_FOLDER'], 
                   app.config['EXTRACT_FOLDER']]:
        if not os.path.exists(folder):
            continue
            
        for filename in os.listdir(folder):
            filepath = os.path.join(folder, filename)
            try:
                if os.path.isfile(filepath):
                    if os.stat(filepath).st_mtime < cutoff_time:
                        os.remove(filepath)
                        print(f"Cleaned up: {filepath}")
                elif os.path.isdir(filepath):
                    if os.stat(filepath).st_mtime < cutoff_time:
                        import shutil
                        shutil.rmtree(filepath)
                        print(f"Cleaned up directory: {filepath}")
            except Exception as e:
                print(f"Error cleaning up {filepath}: {e}")


# 스케줄러 설정 (6시간마다 정리)
scheduler = BackgroundScheduler()
scheduler.add_job(cleanup_old_files, 'interval', hours=6)
scheduler.start()


@app.route('/')
def index():
    """메인 페이지"""
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload_file():
    """HWPX 파일 업로드 및 파싱
    
    Returns:
        JSON: {
            "session_id": str,
            "problems": list,
            "total_count": int,
            "source_file": str
        }
    """
    # 파일 검증
    if 'file' not in request.files:
        return jsonify({'error': '파일이 없습니다.'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': '파일이 선택되지 않았습니다.'}), 400
    
    if not file.filename.lower().endswith('.hwpx'):
        return jsonify({'error': 'HWPX 파일만 업로드 가능합니다.'}), 400
    
    try:
        # 고유 세션 ID 생성
        session_id = str(uuid.uuid4())
        
        # 파일 저장
        filename = secure_filename(file.filename)
        timestamp = int(time.time())
        safe_filename = f"{timestamp}_{session_id}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
        file.save(filepath)
        
        # 압축 해제 디렉토리
        extract_dir = os.path.join(app.config['EXTRACT_FOLDER'], session_id)
        
        # 파싱
        result = parse_hwpx_file(filepath, extract_dir)
        
        # 세션에 파서 정보 저장
        parser = HwpxParser(filepath)
        parser.extract_hwpx(extract_dir)
        parser.parse_sections()
        
        sessions[session_id] = {
            'parser': parser,
            'original_file': filepath,
            'extract_dir': extract_dir,
            'timestamp': time.time()
        }
        
        result['session_id'] = session_id
        
        return jsonify(result), 200
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f"Upload error: {e}")
        return jsonify({'error': f'파일 처리 중 오류 발생: {str(e)}'}), 500


@app.route('/generate', methods=['POST'])
def generate_hwpx():
    """선택된 문제들로 새 HWPX 파일 생성
    
    Request JSON: {
        "session_id": str,
        "selected_ids": list[int]
    }
    
    Returns:
        HWPX 파일 (다운로드)
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': '요청 데이터가 없습니다.'}), 400
    
    session_id = data.get('session_id')
    selected_ids = data.get('selected_ids', [])
    
    if not session_id or session_id not in sessions:
        return jsonify({'error': '유효하지 않은 세션입니다.'}), 400
    
    if not selected_ids:
        return jsonify({'error': '선택된 문제가 없습니다.'}), 400
    
    try:
        session_data = sessions[session_id]
        parser = session_data['parser']
        original_file = session_data['original_file']
        
        # 출력 파일 경로
        output_filename = f"selected_problems_{int(time.time())}.hwpx"
        output_path = os.path.join(app.config['OUTPUT_FOLDER'], output_filename)
        
        # 새 HWPX 생성
        create_hwpx_from_selection(
            original_file,
            parser,
            selected_ids,
            output_path
        )
        
        # 파일 다운로드
        return send_file(
            output_path,
            as_attachment=True,
            download_name=output_filename,
            mimetype='application/octet-stream'
        )
        
    except Exception as e:
        print(f"Generate error: {e}")
        return jsonify({'error': f'파일 생성 중 오류 발생: {str(e)}'}), 500


@app.route('/download/<filename>')
def download_file(filename):
    """생성된 파일 다운로드
    
    Args:
        filename: 파일명
    """
    filepath = os.path.join(app.config['OUTPUT_FOLDER'], filename)
    
    if not os.path.exists(filepath):
        return jsonify({'error': '파일을 찾을 수 없습니다.'}), 404
    
    return send_file(
        filepath,
        as_attachment=True,
        download_name=filename,
        mimetype='application/octet-stream'
    )


from math_renderer import get_renderer

@app.route('/render-math', methods=['POST'])
def render_math():
    """HWP 수식을 이미지(Base64)로 렌더링"""
    data = request.get_json()
    if not data or 'script' not in data:
        return jsonify({'error': '수식 스크립트가 없습니다.'}), 400
    
    script = data['script']
    try:
        renderer = get_renderer()
        base64_data = renderer.render(script)
        
        if not base64_data:
            return jsonify({'error': '렌더링 실패'}), 500
            
        return jsonify({
            'success': True,
            'image': base64_data,
            'format': 'png'
        })
    except Exception as e:
        print(f"Render API error: {e}")
        return jsonify({'error': str(e)}), 500


import subprocess
import sys

@app.route('/trigger-manual-capture', methods=['POST'])
def trigger_manual_capture():
    """수동 캡쳐 UI 실행 및 결과 저장"""
    try:
        # manual_capturer.py 실행 (서브프로세스)
        # 현재 활성화된 가상환경의 python.exe 경로 탐색
        python_exe = sys.executable 
        proc = subprocess.Popen(
            [python_exe, 'manual_capturer.py'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=os.path.dirname(os.path.abspath(__file__))
        )
        
        # 캡쳐 도구가 종료될 때까지 대기 (또는 타임아웃)
        stdout, stderr = proc.communicate(timeout=60)
        
        if "CAPTURED_FILE:" in stdout:
            file_path = stdout.split("CAPTURED_FILE:")[1].strip()
            return jsonify({
                'success': True,
                'file_path': file_path
            })
        else:
            return jsonify({
                'error': '캡쳐가 취소되었거나 실패했습니다.',
                'stdout': stdout,
                'stderr': stderr
            }), 400
            
    except Exception as e:
        print(f"Capture trigger error: {e}")
        return jsonify({'error': str(e)}), 500

@app.errorhandler(413)
def too_large(e):
    """파일 크기 초과 에러"""
    return jsonify({'error': '파일 크기는 50MB를 초과할 수 없습니다.'}), 413


@app.route('/get-capture')
def get_capture():
    """캡쳐된 이미지 파일을 스트리밍 (프론트엔드 업로드용)"""
    path = request.args.get('path')
    if not path or not os.path.exists(path):
        return jsonify({'error': '파일을 찾을 수 없습니다.'}), 404
    
    return send_file(path, mimetype='image/png')

if __name__ == '__main__':
    import atexit
    import signal

    def signal_handler(sig, frame):
        print("\nShutting down server...")
        try:
            renderer = get_renderer()
            renderer.quit()
        except: pass
        scheduler.shutdown()
        os._exit(0)

    # Register exit handlers
    atexit.register(lambda: get_renderer().quit() if get_renderer() else None)
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        # Use debug=False in production or if re-dispatch issues occur
        app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False)
    finally:
        scheduler.shutdown()
        get_renderer().quit()
