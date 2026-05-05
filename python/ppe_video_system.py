import os
import sys
import types
import cv2
import sqlite3
import time
from datetime import datetime
from ultralytics import YOLO

try:
    import serial
except Exception:
    serial = None


def patch_ultralytics_conv_module():
    """Patch legacy ultralytics conv module path for model unpickling compatibility."""
    try:
        import ultralytics.nn as yolo_nn
        import ultralytics.nn.modules as yolo_modules
    except Exception:
        return

    if not hasattr(yolo_nn, 'Conv'):
        setattr(yolo_nn, 'Conv', getattr(yolo_modules, 'Conv', None))
    if not hasattr(yolo_nn, 'DWConv'):
        setattr(yolo_nn, 'DWConv', getattr(yolo_modules, 'DWConv', None))
    if not hasattr(yolo_nn, 'ConvTranspose'):
        setattr(yolo_nn, 'ConvTranspose', getattr(yolo_modules, 'ConvTranspose', None))

    if 'ultralytics.nn.modules' not in sys.modules:
        sys.modules['ultralytics.nn.modules'] = yolo_modules

    for legacy_name in ('conv', 'block'):
        legacy_path = f'ultralytics.nn.modules.{legacy_name}'
        if legacy_path not in sys.modules:
            legacy_mod = types.ModuleType(legacy_path)
            legacy_mod.__dict__.update(vars(yolo_modules))
            sys.modules[legacy_path] = legacy_mod


def is_inside(worker, obj):
    wx1, wy1, wx2, wy2 = worker
    ox1, oy1, ox2, oy2 = obj

    cx = (ox1 + ox2) // 2
    cy = (oy1 + oy2) // 2
    return wx1 < cx < wx2 and wy1 < cy < wy2


def overlap_ratio(worker, obj):
    """Return how much of the object box overlaps the worker box."""
    wx1, wy1, wx2, wy2 = worker
    ox1, oy1, ox2, oy2 = obj

    inter_x1 = max(wx1, ox1)
    inter_y1 = max(wy1, oy1)
    inter_x2 = min(wx2, ox2)
    inter_y2 = min(wy2, oy2)

    if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
        return 0.0

    intersection = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
    object_area = max(1, (ox2 - ox1) * (oy2 - oy1))
    return intersection / object_area


def object_center(box):
    x1, y1, x2, y2 = box
    return (x1 + x2) // 2, (y1 + y2) // 2


def is_in_vertical_region(worker, obj, top_ratio, bottom_ratio):
    """Check if object center falls in a vertical slice of worker box."""
    wx1, wy1, wx2, wy2 = worker
    _, cy = object_center(obj)
    worker_h = max(1, wy2 - wy1)
    region_top = wy1 + int(worker_h * top_ratio)
    region_bottom = wy1 + int(worker_h * bottom_ratio)
    return wx1 < object_center(obj)[0] < wx2 and region_top <= cy <= region_bottom


def ensure_db_table(conn):
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS worker_ppe (
            worker_id TEXT,
            helmet TEXT,
            vest TEXT,
            time TEXT
        )
        """
    )
    conn.commit()


def create_writer(output_video, fps, width, height):
    # mp4v is the most reliable OpenCV MP4 encoder across Windows setups.
    for code in ("mp4v", "avc1", "H264"):
        writer = cv2.VideoWriter(output_video, cv2.VideoWriter_fourcc(*code), fps, (width, height))
        if writer.isOpened():
            return writer
    raise RuntimeError(f"Unable to create video writer for {output_video}")


def normalize_label(label_name):
    return str(label_name).strip().lower().replace(" ", "_")


def init_esp32():
    """Initialize ESP32 serial connection. Defaults to COM8 on Windows."""
    if serial is None:
        print("Warning: pyserial not installed. ESP32 LED signaling disabled.")
        return None

    port = os.getenv("ESP32_PORT", "COM8")
    baudrate = int(os.getenv("ESP32_BAUD", "115200"))

    try:
        esp = serial.Serial(port, baudrate, timeout=1)
        time.sleep(2)
        print(f"ESP32 connected on {port} @ {baudrate}")
        return esp
    except Exception as e:
        print(f"Warning: could not connect ESP32 on {port}: {e}")
        return None


def send_esp32_signal(esp32, signal):
    """Send command to ESP32: G (safe), R (unsafe), O (off)."""
    if esp32 is None:
        return
    try:
        esp32.write(signal.encode("utf-8"))
        esp32.flush()
    except Exception as e:
        print(f"Warning: failed to send signal '{signal}': {e}")


def main():
    if len(sys.argv) < 3:
        print("Usage: python ppe_video_system.py <input_video> <output_video> [db_path]")
        sys.exit(1)

    input_video = sys.argv[1]
    output_video = sys.argv[2]
    db_path = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), "..", "ppe.db")

    model_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "PPE Detection System-v2",
        "runs",
        "detect",
        "train",
        "weights",
        "best.pt",
    )

    patch_ultralytics_conv_module()
    try:
        model = YOLO(model_path)
    except Exception as e:
        print(f"Error loading YOLO model from {model_path}: {e}")
        print("This is likely a model/package version mismatch.")
        print("Use a compatible setup:")
        print("  pip uninstall ultralytics -y")
        print("  pip install ultralytics==8.0.20 torch==2.0.1 torchvision==0.15.2")
        sys.exit(1)

    conf_threshold = float(os.getenv("DETECT_CONF", "0.25"))
    iou_threshold = float(os.getenv("DETECT_IOU", "0.45"))
    img_size = int(os.getenv("DETECT_IMGSZ", "960"))
    output_speed_factor = float(os.getenv("OUTPUT_SPEED_FACTOR", "0.8"))

    cap = cv2.VideoCapture(input_video)
    if not cap.isOpened():
        print(f"Cannot open input video: {input_video}")
        sys.exit(1)

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 20.0

    display_fps = max(5.0, fps * output_speed_factor)

    out = create_writer(output_video, display_fps, width, height)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    ensure_db_table(conn)
    esp32 = init_esp32()

    # Keep each run independent so dashboard reflects latest processed video.
    cursor.execute("DELETE FROM worker_ppe")
    conn.commit()

    lock_line_top = int(height * 0.58)
    lock_line_bottom = int(height * 0.62)
    previous_y = {}
    crossed_top_ids = set()
    counted_ids = set()
    queued_ids = set()
    pending_entries = []
    last_db_insert_time = 0.0
    min_gap_seconds = 5.0

    frame_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        results = model.track(
            frame,
            conf=conf_threshold,
            iou=iou_threshold,
            imgsz=img_size,
            persist=True,
            tracker="bytetrack.yaml",
            verbose=False,
        )
        workers, helmets, vests = [], [], []

        if results and results[0].boxes is not None:
            boxes = results[0].boxes

            for i, box in enumerate(boxes.xyxy):
                conf = float(boxes.conf[i])
                if conf < conf_threshold:
                    continue

                cls = int(boxes.cls[i])
                label_name = normalize_label(model.names[cls])

                x1, y1, x2, y2 = map(int, box)
                tid = int(boxes.id[i]) if boxes.id is not None else -1

                if label_name in {"worker", "person"}:
                    workers.append((tid, x1, y1, x2, y2))
                elif label_name in {"helmet", "hardhat", "hard_hat"}:
                    helmets.append((x1, y1, x2, y2))
                elif label_name in {"vest", "safety_vest", "reflective_vest", "safetyvest"}:
                    vests.append((x1, y1, x2, y2))

        for hx1, hy1, hx2, hy2 in helmets:
            cv2.rectangle(frame, (hx1, hy1), (hx2, hy2), (0, 255, 255), 2)
            cv2.putText(frame, "HELMET", (hx1, max(15, hy1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)

        for vx1, vy1, vx2, vy2 in vests:
            cv2.rectangle(frame, (vx1, vy1), (vx2, vy2), (255, 255, 0), 2)
            cv2.putText(frame, "VEST", (vx1, max(15, vy1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 0), 1)

        for (tid, x1, y1, x2, y2) in workers:
            worker_box = (x1, y1, x2, y2)
            helmet_status = "No"
            vest_status = "No"

            for h in helmets:
                helmet_in_head_region = is_in_vertical_region(worker_box, h, 0.0, 0.35)
                if helmet_in_head_region and (overlap_ratio(worker_box, h) >= 0.2 or is_inside(worker_box, h)):
                    helmet_status = "Yes"
                    break

            for v in vests:
                vest_in_chest_region = is_in_vertical_region(worker_box, v, 0.3, 0.75)
                if vest_in_chest_region and (overlap_ratio(worker_box, v) >= 0.2 or is_inside(worker_box, v)):
                    vest_status = "Yes"
                    break

            if helmet_status == "Yes" and vest_status == "Yes":
                box_color = (0, 255, 0)
                text_color = (0, 150, 0)
                state = "SAFE"
                thickness = 2
            else:
                box_color = (0, 0, 255)
                text_color = (0, 0, 255)
                state = "UNSAFE"
                thickness = 3

            cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, thickness)
            text = f"ID:{tid} {state} | H:{helmet_status} V:{vest_status}"
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, thickness)

            cv2.rectangle(frame, (x1, y1 - th - 10), (x1 + tw + 8, y1), (255, 255, 255), -1)
            cv2.putText(
                frame,
                text,
                (x1 + 4, y1 - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                text_color,
                thickness,
            )

            cy = (y1 + y2) // 2

            crossed_top = tid in previous_y and previous_y[tid] < lock_line_top <= cy
            first_seen_below_top = tid not in previous_y and cy >= lock_line_top
            crossed_bottom = tid in previous_y and previous_y[tid] < lock_line_bottom <= cy
            first_seen_below_bottom = tid not in previous_y and cy >= lock_line_bottom

            if crossed_top or first_seen_below_top:
                crossed_top_ids.add(tid)

            ready_to_lock = crossed_bottom or first_seen_below_bottom
            if ready_to_lock and tid in crossed_top_ids and tid not in counted_ids and tid not in queued_ids:
                worker_id = f"Worker_{tid}"
                queued_ids.add(tid)
                pending_entries.append((worker_id, helmet_status, vest_status))

            previous_y[tid] = cy

        current_time = time.time()
        if pending_entries and current_time - last_db_insert_time >= min_gap_seconds:
            worker_id, helmet_status, vest_status = pending_entries.pop(0)
            tid_from_worker = int(worker_id.replace("Worker_", ""))
            counted_ids.add(tid_from_worker)
            queued_ids.discard(tid_from_worker)

            time_now = datetime.now().strftime("%H:%M:%S")
            cursor.execute(
                "INSERT INTO worker_ppe (worker_id, helmet, vest, time) VALUES (?, ?, ?, ?)",
                (worker_id, helmet_status, vest_status, time_now),
            )
            conn.commit()
            last_db_insert_time = current_time

            # Hardware signal follows PPE decision used for table storage.
            if helmet_status == "Yes" and vest_status == "Yes":
                send_esp32_signal(esp32, "G")
            else:
                send_esp32_signal(esp32, "R")
            time.sleep(1.5)
            send_esp32_signal(esp32, "O")

        cv2.line(frame, (0, lock_line_top), (frame.shape[1], lock_line_top), (255, 180, 0), 2)
        cv2.line(frame, (0, lock_line_bottom), (frame.shape[1], lock_line_bottom), (255, 180, 0), 2)
        cv2.putText(
            frame,
            "LOCK ZONE",
            (10, max(20, lock_line_top - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 180, 0),
            2,
        )
        out.write(frame)
        frame_count += 1

    cap.release()
    out.release()
    conn.close()
    if esp32 is not None:
        try:
            send_esp32_signal(esp32, "O")
            esp32.close()
        except Exception:
            pass
    if frame_count == 0:
        print("Processing failed: no frames were written to output video")
        sys.exit(1)

    if not os.path.exists(output_video) or os.path.getsize(output_video) == 0:
        print("Processing failed: output video file is empty")
        sys.exit(1)

    print(f"Processing completed: {output_video}")


if __name__ == "__main__":
    main()
