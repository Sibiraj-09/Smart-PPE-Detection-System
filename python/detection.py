"""
Detection module for PPE Detection System
Handles YOLO inference, two-line zone logic, and PPE status determination
"""

import cv2
import numpy as np
from ultralytics import YOLO
import os
import sys
import types


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


class PPEDetector:
    def __init__(self, model_path="PPE Detection System-v2/runs/detect/train/weights/best.pt"):
        """Initialize YOLO model for PPE detection"""
        patch_ultralytics_conv_module()
        if os.path.isabs(model_path):
            self.model = YOLO(model_path)
        else:
            # Make path relative to project root
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            full_path = os.path.join(project_root, model_path)
            self.model = YOLO(full_path)
        
        print(f"✓ YOLOv8 model loaded")

    def detect_frame(self, frame):
        """
        Run YOLO detection on frame
        
        Returns:
            - workers: list of worker bboxes
            - helmets: list of helmet bboxes
            - vests: list of vest bboxes
            - track_ids: list of tracked IDs
        """
        results = self.model.track(frame, conf=0.5, iou=0.5, persist=True, tracker="bytetrack.yaml")
        
        workers = []
        helmets = []
        vests = []
        track_ids = []
        
        if results and results[0].boxes is not None:
            boxes = results[0].boxes
            names = results[0].names
            
            for i, box in enumerate(boxes):
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                conf = float(box.conf[0])
                cls = int(box.cls[0])
                
                # Get track ID
                track_id = None
                if box.id is not None:
                    track_id = int(box.id[0])
                
                bbox = (x1, y1, x2, y2)
                class_name = names.get(cls, "unknown")
                
                if class_name == "person":
                    workers.append((bbox, track_id, conf))
                elif class_name == "helmet":
                    helmets.append(bbox)
                elif class_name == "vest":
                    vests.append(bbox)
        
        return workers, helmets, vests

    @staticmethod
    def is_contained(parent_bbox, child_bbox):
        """Check if child bbox is contained within parent bbox"""
        x1p, y1p, x2p, y2p = parent_bbox
        x1c, y1c, x2c, y2c = child_bbox
        
        # Child's center should be within parent
        cx = (x1c + x2c) / 2
        cy = (y1c + y2c) / 2
        
        return x1p < cx < x2p and y1p < cy < y2p

    @staticmethod
    def get_center_y(bbox):
        """Get vertical center of bounding box"""
        x1, y1, x2, y2 = bbox
        return (y1 + y2) / 2

    @staticmethod
    def crossing_zone(center_y, prev_y, line1_y, line2_y):
        """
        Check if person's center crossed between two lines
        
        Returns: True if person entered the zone
        """
        if prev_y is None:
            return False
        
        # Person crosses from above line1 through to below line1
        if prev_y < line1_y and center_y >= line1_y:
            return True
        # Person crosses from between lines through to below line2
        if line1_y <= prev_y <= line2_y and center_y > line2_y:
            return True
        
        return False


def draw_detection_results(frame, workers, helmets, vests, ppe_status=None, 
                          line1_y=None, line2_y=None, locked_id=None):
    """
    Draw detection results on frame
    
    Args:
        ppe_status: dict mapping track_id to {'helmet': Y/N, 'vest': Y/N, 'status': SAFE/UNSAFE}
    """
    # Draw zone lines
    if line1_y:
        cv2.line(frame, (0, line1_y), (frame.shape[1], line1_y), (255, 165, 0), 2)
        cv2.putText(frame, "Zone Line 1", (10, line1_y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 165, 0), 2)
    
    if line2_y:
        cv2.line(frame, (0, line2_y), (frame.shape[1], line2_y), (255, 165, 0), 2)
        cv2.putText(frame, "Zone Line 2", (10, line2_y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 165, 0), 2)
    
    # Draw worker detections
    for worker, track_id, conf in workers:
        x1, y1, x2, y2 = worker
        
        # Determine color based on PPE status
        color = (0, 255, 0)  # Default green
        status_text = ""
        
        if ppe_status and track_id in ppe_status:
            status = ppe_status[track_id]
            if status['status'] == 'SAFE':
                color = (0, 255, 0)  # Green
            else:
                color = (0, 0, 255)  # Red
            
            helmet = status['helmet']
            vest = status['vest']
            status_text = f"ID:{track_id} H:{helmet} V:{vest}"
        else:
            status_text = f"ID:{track_id}"
        
        # Highlight locked person
        line_width = 3 if (locked_id and track_id == locked_id) else 2
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, line_width)
        cv2.putText(frame, status_text, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    
    # Draw helmet detections (small cyan boxes)
    for helmet in helmets:
        x1, y1, x2, y2 = helmet
        cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 255, 0), 1)
    
    # Draw vest detections (small yellow boxes)
    for vest in vests:
        x1, y1, x2, y2 = vest
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 1)
    
    return frame
