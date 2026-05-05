"""
Smart PPE Detection System - Flask Backend
Integrates YOLOv8, RFID scanning, two-line zone logic, and hardware signaling
"""

import os
import sys
import cv2
import time
import json
from pathlib import Path
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
import threading

from python.detection import PPEDetector, draw_detection_results
from python.rfid import RFIDReader
from python.db import PPEDatabase


# ============================================================================
# FLASK APP SETUP
# ============================================================================

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "backend", "uploads")
OUTPUT_FOLDER = os.path.join(os.path.dirname(__file__), "backend", "output")
DB_PATH = os.path.join(os.path.dirname(__file__), "ppe.db")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max

# Initialize components
detector = None
rfid_reader = None
db = PPEDatabase(DB_PATH)

# Real-time LED status tracking
led_status_state = {
    "status": "idle",  # safe, unsafe, scanning, or idle
    "worker_id": "",
    "timestamp": 0
}
led_status_lock = threading.Lock()

ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'mpeg'}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_gate_from_filename(filename):
    """Extract gate number from video filename"""
    # Examples: video1 -> Gate1, video2 -> Gate2, etc.
    import re
    match = re.search(r'video(\d+)', filename, re.IGNORECASE)
    if match:
        gate_num = match.group(1)
        return f"Gate{gate_num}"
    return "Gate1"  # Default


def process_video_with_rfid(input_path, output_path):
    """
    Main video processing with YOLO + RFID integration
    
    Flow:
    1. Process frames with YOLO detection
    2. Monitor two-line zone
    3. Lock person when they cross zone
    4. Wait for RFID scan
    5. Send signal to ESP32
    6. Save to database
    """
    global detector, rfid_reader
    
    if detector is None:
        detector = PPEDetector()
    
    # Try to initialize RFID (non-blocking if fails)
    if rfid_reader is None:
        try:
            rfid_reader = RFIDReader(port="COM8", baudrate=115200, timeout=1)
        except Exception as e:
            print(f"Warning: RFID not available: {e}")
            rfid_reader = None
    
    # Get gate from filename
    gate = get_gate_from_filename(os.path.basename(input_path))
    
    # Clear previous records
    db.clear_records()
    
    # Open video
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {input_path}")
    
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 20.0
    
    # Create video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    if not out.isOpened():
        # Fallback codec
        fourcc = cv2.VideoWriter_fourcc(*'avc1')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    # Zone configuration
    line1_y = int(height * 0.4)  # 40% from top
    line2_y = int(height * 0.6)  # 60% from top
    
    # Tracking state
    person_locked = False
    active_id = None
    previous_y = {}
    processed_ids = set()
    
    frame_count = 0
    
    print(f"\n{'='*60}")
    print(f"Processing: {os.path.basename(input_path)}")
    print(f"Gate: {gate}")
    print(f"Zone: {line1_y}px - {line2_y}px")
    print(f"{'='*60}\n")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        frame_count += 1
        
        # Run detection
        workers, helmets, vests = detector.detect_frame(frame)
        
        # PPE status for all workers in frame
        ppe_status = {}
        
        for worker_bbox, track_id, conf in workers:
            # Check if helmet and vest are within worker bbox
            helmet_detected = any(detector.is_contained(worker_bbox, h) for h in helmets)
            vest_detected = any(detector.is_contained(worker_bbox, v) for v in vests)
            
            helmet_status = "YES" if helmet_detected else "NO"
            vest_status = "YES" if vest_detected else "NO"
            ppe_status_val = "SAFE" if (helmet_detected and vest_detected) else "UNSAFE"
            
            ppe_status[track_id] = {
                'helmet': helmet_status,
                'vest': vest_status,
                'status': ppe_status_val
            }
            
            # ================================================================
            # TWO-LINE ZONE LOGIC
            # ================================================================
            center_y = detector.get_center_y(worker_bbox)
            prev_y = previous_y.get(track_id, None)
            
            # Check if person crossed into zone
            if detector.crossing_zone(center_y, prev_y, line1_y, line2_y):
                if not person_locked:
                    person_locked = True
                    active_id = track_id
                    print(f"\n🔐 LOCKED: Worker {track_id} entered zone")
            
            # ================================================================
            # RFID SCANNING & DECISION
            # ================================================================
            if person_locked and track_id == active_id and track_id not in processed_ids:
                print(f"⏳ Waiting for RFID scan... (Worker {track_id})")

                # Update LED status to scanning
                with led_status_lock:
                    led_status_state["status"] = "scanning"
                    led_status_state["worker_id"] = str(track_id)
                    led_status_state["timestamp"] = time.time()
                
                # Wait for RFID
                uid = None
                if rfid_reader and rfid_reader.connected:
                    uid = rfid_reader.wait_for_rfid(timeout=5)
                
                if uid:
                    # Got RFID scan
                    helmet = ppe_status[track_id]['helmet']
                    vest = ppe_status[track_id]['vest']
                    status = ppe_status[track_id]['status']

                    # Update LED status based on PPE check
                    led_signal = 'safe' if status == 'SAFE' else 'unsafe'
                    with led_status_lock:
                        led_status_state["status"] = led_signal
                        led_status_state["worker_id"] = uid
                        led_status_state["timestamp"] = time.time()
                    
                    # Send signal to ESP32
                    if rfid_reader and rfid_reader.connected:
                        signal = 'G' if status == 'SAFE' else 'R'
                        rfid_reader.send_signal(signal)
                        time.sleep(2)
                        rfid_reader.send_signal('O')

                        # Update to idle after signal
                        with led_status_lock:
                            led_status_state["status"] = "idle"
                            led_status_state["timestamp"] = time.time()
                    
                    # Save to database
                    db.insert_worker(uid, helmet, vest, status, gate)
                    print(f"💾 Saved: {uid} | {helmet} | {vest} | {status}")
                    
                    processed_ids.add(track_id)
                    person_locked = False
                    active_id = None
                else:
                    print(f"✗ No RFID detected within timeout")
                    with led_status_lock:
                        led_status_state["status"] = "idle"
                        led_status_state["worker_id"] = ""
                        led_status_state["timestamp"] = time.time()
                    person_locked = False
                    active_id = None
            
            previous_y[track_id] = center_y
        
        # Draw results
        frame = draw_detection_results(
            frame, workers, helmets, vests,
            ppe_status=ppe_status,
            line1_y=line1_y,
            line2_y=line2_y,
            locked_id=active_id
        )
        
        # Write frame
        out.write(frame)
        
        if frame_count % 30 == 0:
            print(f"Processing frame {frame_count}...")
    
    # Cleanup
    cap.release()
    out.release()
    
    print(f"\n✓ Processing complete: {output_path}")
    return True


# ============================================================================
# API ROUTES (Compatible with existing dashboard)
# ============================================================================

@app.route("/api/process-video", methods=["POST"])
def process_video_route():
    """Accept video upload and process with YOLO + RFID"""
    try:
        if 'video' not in request.files:
            return jsonify({"error": "No video file provided"}), 400
        
        file = request.files['video']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        
        if not allowed_file(file.filename):
            return jsonify({"error": "File type not allowed. Use MP4, AVI, MOV, MKV, or MPEG"}), 400
        
        # Save upload
        filename = secure_filename(file.filename)
        timestamp = int(time.time() * 1000)
        input_path = os.path.join(UPLOAD_FOLDER, f"{filename}-{timestamp}")
        file.save(input_path)
        
        # Process video
        output_filename = f"processed-{timestamp}.mp4"
        output_path = os.path.join(OUTPUT_FOLDER, output_filename)
        
        process_video_with_rfid(input_path, output_path)
        
        # Clean up upload
        if os.path.exists(input_path):
            os.remove(input_path)
        
        return jsonify({
            "videoUrl": f"/output/{output_filename}"
        }), 200
    
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/workers", methods=["GET"])
def get_workers():
    """Get all worker PPE records"""
    try:
        workers = db.get_all_workers()
        return jsonify(workers), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/status", methods=["GET"])
def get_status():
    """Get status summary"""
    try:
        status = db.get_status_summary()
        return jsonify(status), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/led-status", methods=["GET"])
def get_led_status():
    """Get real-time LED status for frontend display"""
    with led_status_lock:
        return jsonify(led_status_state), 200


# ============================================================================
# STARTUP & SHUTDOWN
# ============================================================================

@app.before_request
def init_components():
    """Initialize components on first request"""
    global detector, rfid_reader
    
    if detector is None:
        try:
            detector = PPEDetector()
        except Exception as e:
            print(f"Warning: Could not load detector: {e}")
    
    if rfid_reader is None:
        try:
            rfid_reader = RFIDReader(port="COM4", baudrate=115200, timeout=1)
        except Exception as e:
            print(f"Note: RFID reader not available (run with ESP32 connected)")


@app.teardown_appcontext
def cleanup(error):
    """Cleanup on shutdown"""
    if rfid_reader and rfid_reader.connected:
        rfid_reader.close()


# ============================================================================
# RUN
# ============================================================================

if __name__ == "__main__":
    host = "0.0.0.0"
    port = 5000
    local_url = f"http://127.0.0.1:{port}"
    print("\n" + "="*60)
    print("Smart PPE Detection System")
    print("="*60)
    print("Server running at:")
    print(f"  Local:   {local_url}")
    print(f"  Browser: http://localhost:{port}")
    print("API endpoints:")
    print("  POST /api/process-video")
    print("  GET  /api/workers")
    print("  GET  /api/status")
    print("  GET  /api/led-status")
    print("="*60 + "\n")
    
    # Run Flask app
    app.run(
        host=host,
        port=port,
        debug=False,
        threaded=True
    )
