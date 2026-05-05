import cv2
import os

VIDEO_FOLDER = "videos"
OUTPUT_FOLDER = "frames"
FRAME_SKIP = 8

os.makedirs(OUTPUT_FOLDER, exist_ok=True)

total_saved = 0

for video_name in os.listdir(VIDEO_FOLDER):

    if not video_name.lower().endswith((".mp4", ".avi", ".mov", ".mkv")):
        continue

    video_path = os.path.join(VIDEO_FOLDER, video_name)
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print(f"Could not open {video_name}")
        continue

    frame_count = 0
    saved_count = 0
    video_base = os.path.splitext(video_name)[0]

    print(f"\nProcessing: {video_name}")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_count % FRAME_SKIP == 0:
            filename = f"{video_base}_frame_{saved_count}.jpg"
            save_path = os.path.join(OUTPUT_FOLDER, filename)
            cv2.imwrite(save_path, frame)
            saved_count += 1
            total_saved += 1

        frame_count += 1

    cap.release()

    print(f"{saved_count} frames saved from {video_name}")

print("\n===============================")
print(f"Total frames extracted: {total_saved}")
print("===============================")