# Smart PPE Detection & Alert System

Industrial safety monitoring with:
- **React + TypeScript + Tailwind** frontend dashboard
- **Python Flask** backend with YOLOv8 detection
- **RFID scanning** via ESP32 serial communication
- **Two-line zone** logic for single-person lock
- **Hardware signaling** (LED + Buzzer alerts)
- **SQLite** database with gate-based records

## System Flow

```
Video Upload (Frontend)
    ↓
YOLO PPE Detection (Helmet + Vest)
    ↓
Two-Line Zone Crossing Detection
    ↓
LOCK single person
    ↓
WAIT for RFID scan (ESP32)
    ↓
Determine SAFE / UNSAFE
    ↓
Send signal → ESP32 (G/R/O)
    ↓
Save to Database
    ↓
Update Dashboard
```

## Project Structure

```
frontend/              # React dashboard (no changes needed)
backend/              # Static file serving (for production)
python/               # Flask backend with RFID integration
  ├── app.py          # Flask routes & main logic
  ├── detection.py    # YOLOv8 & zone detection
  ├── rfid.py         # ESP32 serial communication
  ├── db.py           # SQLite operations
  ├── requirements.txt # Python dependencies
  ├── setup.bat       # Windows setup script
  └── run.bat         # Windows run script
ppe.db               # SQLite database (auto-created)
```

## Setup

### Prerequisites
- Python 3.8+
- ESP32 with RFID reader (connected via USB)
- YOLOv8 model at: `PPE Detection System-v2/runs/detect/train/weights/best.pt`

### Installation

#### 1. Install Python Dependencies

```bash
cd python
pip install -r requirements.txt
```

Or run the setup script:
```bash
python\setup.bat
```

#### 2. Build Frontend (Production Only)

```bash
cd frontend
npm install
npm run build
```

#### 3. Connect Hardware

1. Connect ESP32 via USB
2. Note the **COM port** (e.g., COM4, COM3)
3. Close Arduino Serial Monitor (if open)
4. Update `app.py` if using different COM port:
   ```python
   rfid_reader = RFIDReader(port="COM4", baudrate=115200)
   ```

### Running

#### Development (Python Flask Only)

```bash
cd python
python app.py
```

Then open: **http://localhost:5000**

#### Production (Flask + Built Frontend)

```bash
cd frontend
npm run build

cd ../python
python app.py
```

Then open: **http://localhost:5000**

## API Endpoints

All endpoints return JSON compatible with dashboard:

- **POST `/api/process-video`** - Upload and process video
  - Field: `video` (multipart file)
  - Response: `{ "videoUrl": "/output/processed-*.mp4" }`

- **GET `/api/workers`** - Get all worker PPE records
  - Response: `[ { "worker_id": "UID", "helmet": "YES/NO", "vest": "YES/NO", "time": "HH:MM:SS" }, ... ]`

- **GET `/api/status`** - Get status summary
  - Response: `{ "totalWorkers": N, "safeWorkers": N, "unsafeWorkers": N }`

## Database Schema

Table: `worker_ppe`

```sql
CREATE TABLE worker_ppe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id TEXT,          -- RFID UID
    helmet TEXT,             -- YES / NO
    vest TEXT,               -- YES / NO
    status TEXT,             -- SAFE / UNSAFE
    gate TEXT,               -- Gate1, Gate2, ... (from video filename)
    time TEXT,               -- HH:MM:SS when scanned
    date TEXT                -- YYYY-MM-DD when scanned
);
```

## Configuration

### Two-Line Zone

Adjust zone lines in `python/app.py`:

```python
line1_y = int(height * 0.4)  # 40% from top
line2_y = int(height * 0.6)  # 60% from top
```

### RFID Serial Port

Update COM port in `python/app.py`:

```python
rfid_reader = RFIDReader(port="COM4", baudrate=115200, timeout=1)
```

### Gate Assignment

Gate is determined from video filename:
- `video1.mp4` → Gate1
- `video2.mp4` → Gate2
- `video3.mp4` → Gate3
- `video4.mp4` → Gate4
- `video5.mp4` → Gate5

### YOLO Model

Model path in `python/detection.py`:

```python
model_path = "PPE Detection System-v2/runs/detect/train/weights/best.pt"
```

## ESP32 Signals

The system sends single-character commands to ESP32:

- **'G'** → Green LED (SAFE: helmet + vest detected)
- **'R'** → Red LED + Buzzer (UNSAFE: missing helmet or vest)
- **'O'** → Turn Off (after 2 seconds)

## Performance

- Frame-by-frame YOLO inference (~30fps on modern CPU)
- RFID wait timeout: 5 seconds (configurable)
- No threading required (simple sequential processing)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| RFID not detected | Verify COM port in `app.py`, close Arduino Serial Monitor |
| Model not found | Ensure `best.pt` exists at correct path |
| Video processing slow | Reduce video resolution or frame rate |
| Database errors | Delete `ppe.db` to start fresh |
| Serial port access denied | Run with admin privileges on Windows |

## Files Modified/Created

**New Files:**
- `python/app.py` - Flask backend with RFID integration
- `python/detection.py` - YOLOv8 detection & zone logic
- `python/rfid.py` - ESP32 serial communication
- `python/db.py` - SQLite operations
- `python/requirements.txt` - Python dependencies
- `python/setup.bat` - Setup script
- `python/run.bat` - Run script

**Updated:**
- `README.md` - This file

**Unchanged (Compatible):**
- `frontend/` - React dashboard
- `backend/src/server.js` - Node.js can co-exist

## Next Steps

1. **Verify Hardware**
   ```bash
   # Check ESP32 COM port in Device Manager or:
   # Windows: mode COM4
   # Linux: ls /dev/ttyUSB*
   ```

2. **Test RFID Connection**
   ```bash
   python python/rfid.py
   # Should print "✓ RFID reader connected on COM4"
   ```

3. **Start System**
   ```bash
   cd python
   python app.py
   # Open http://localhost:5000
   ```

4. **Upload Test Video**
   - Use one of the videos in `videos/` folder
   - System will process, detect PPE, and create output in `backend/output/`

## License & Credits

- YOLOv8: Ultralytics
- Flask: Pallets
- React: Facebook
- Built for industrial safety monitoring

---

**Status**: ✅ Ready for deployment

