import cv2
from ultralytics import YOLO
import sqlite3
from datetime import datetime
import os
import sys


def create_writer(output_video, fps, width, height):
    # mp4v is the most reliable OpenCV MP4 encoder across Windows setups.
    for code in ("mp4v", "avc1", "H264"):
        writer = cv2.VideoWriter(output_video, cv2.VideoWriter_fourcc(*code), fps, (width, height))
        if writer.isOpened():
            return writer
    raise RuntimeError(f"Unable to create video writer for {output_video}")

# ---------------- MODEL ----------------
model = YOLO(r"PPE Detection System-v2/runs/detect/train/weights/best.pt")

# ---------------- VIDEO ----------------
if len(sys.argv) < 3:
    print("Usage: python ppe_video_system.py <input_video> <output_video>")
    sys.exit(1)

input_video = sys.argv[1]
output_video = sys.argv[2]
cap = cv2.VideoCapture(input_video)

if not cap.isOpened():
    print(f"Cannot open input video: {input_video}")
    sys.exit(1)

width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = cap.get(cv2.CAP_PROP_FPS)
if fps <= 0:
    fps = 20.0

out = create_writer(output_video, fps, width, height)

# ---------------- DATABASE ----------------
conn = sqlite3.connect("ppe.db")
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS worker_ppe (
    worker_id TEXT,
    helmet TEXT,
    vest TEXT,
    time TEXT
)
""")
conn.commit()

cursor.execute("DELETE FROM worker_ppe")
conn.commit()

# ---------------- SETTINGS ----------------
line_y = int(height * 0.6)
previous_y = {}
counted_ids = set()

# ---------------- MATCH FUNCTION ----------------
def is_inside(worker, obj):
    wx1, wy1, wx2, wy2 = worker
    ox1, oy1, ox2, oy2 = obj

    cx = (ox1 + ox2) // 2
    cy = (oy1 + oy2) // 2

    return wx1 < cx < wx2 and wy1 < cy < wy2

# ---------------- MAIN LOOP ----------------
frame_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break

    results = model.track(frame, conf=0.5, iou=0.5, persist=True, tracker="bytetrack.yaml")

    workers, helmets, vests = [], [], []

    if results[0].boxes is not None:
        boxes = results[0].boxes

        for i, box in enumerate(boxes.xyxy):
            conf = float(boxes.conf[i])
            if conf < 0.5:
                continue

            cls = int(boxes.cls[i])
            label_name = model.names[cls]

            x1, y1, x2, y2 = map(int, box)
            tid = int(boxes.id[i]) if boxes.id is not None else -1

            if label_name == "Worker":
                workers.append((tid, x1, y1, x2, y2))
            elif label_name == "helmet":
                helmets.append((x1, y1, x2, y2))
            elif label_name == "Vest":
                vests.append((x1, y1, x2, y2))

    # ---------------- PPE CHECK ----------------
    for (tid, x1, y1, x2, y2) in workers:

        worker_box = (x1, y1, x2, y2)

        helmet_status = "No"
        vest_status = "No"

        for h in helmets:
            if is_inside(worker_box, h):
                helmet_status = "Yes"
                break

        for v in vests:
            if is_inside(worker_box, v):
                vest_status = "Yes"
                break

        # ---------------- COLOR LOGIC ----------------
        if helmet_status == "Yes" and vest_status == "Yes":
            box_color = (0, 255, 0)     # Green box
            text_color = (0, 150, 0)    # Green text
            state = "SAFE"
            thickness = 2
        else:
            box_color = (0, 0, 255)     # Red box
            text_color = (0, 0, 255)    # Red text
            state = "ALERT"
            thickness = 3

        # ---------------- DRAW BOX ----------------
        cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, thickness)

        # ---------------- TEXT ----------------
        text = f"ID:{tid} {state} | H:{helmet_status} V:{vest_status}"

        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, thickness)

        # ✅ WHITE BACKGROUND BOX
        cv2.rectangle(
            frame,
            (x1, y1 - th - 10),
            (x1 + tw + 8, y1),
            (255, 255, 255),   # WHITE
            -1
        )

        # ✅ COLORED TEXT (GREEN or RED)
        cv2.putText(
            frame,
            text,
            (x1 + 4, y1 - 5),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            text_color,
            thickness
        )

        # ---------------- LINE CROSSING ----------------
        cy = (y1 + y2) // 2

        if tid in previous_y:
            if previous_y[tid] < line_y and cy >= line_y:
                if tid not in counted_ids:
                    counted_ids.add(tid)

                    worker_id = f"Worker_{tid}"
                    time_now = datetime.now().strftime("%H:%M:%S")

                    cursor.execute("""
                    INSERT INTO worker_ppe (worker_id, helmet, vest, time) VALUES (?, ?, ?, ?)
                    """, (worker_id, helmet_status, vest_status, time_now))

                    conn.commit()

        previous_y[tid] = cy

    # ---------------- LINE ----------------
    cv2.line(frame, (0, line_y), (frame.shape[1], line_y), (255, 0, 0), 2)
    out.write(frame)
    frame_count += 1

# ---------------- CLEANUP ----------------
cap.release()
out.release()
conn.close()
if frame_count == 0:
    print("Processing failed: no frames were written to output video")
    sys.exit(1)

if not os.path.exists(output_video) or os.path.getsize(output_video) == 0:
    print("Processing failed: output video file is empty")
    sys.exit(1)

print(f"Processing completed: {os.path.abspath(output_video)}")