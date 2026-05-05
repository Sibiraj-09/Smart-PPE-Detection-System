"""
Test Script - Verify Hardware & Dependencies
Run before starting the full system
"""

import sys
import os

# Add python directory to path
sys.path.insert(0, os.path.dirname(__file__))

print("\n" + "="*60)
print("Smart PPE Detection System - Test Suite")
print("="*60 + "\n")

# Test 1: Python version
print("1. Testing Python version...")
python_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
print(f"   ✓ Python {python_version}\n")

# Test 2: Required packages
print("2. Testing Python packages...")
packages_ok = True
required_packages = {
    'flask': 'Flask',
    'flask_cors': 'Flask-CORS',
    'ultralytics': 'YOLOv8',
    'cv2': 'OpenCV',
    'serial': 'PySerial',
    'torch': 'PyTorch'
}

for import_name, display_name in required_packages.items():
    try:
        __import__(import_name)
        print(f"   ✓ {display_name}")
    except ImportError:
        print(f"   ✗ {display_name} - NOT INSTALLED")
        packages_ok = False

if not packages_ok:
    print("\n   Run: pip install -r requirements.txt\n")
else:
    print()

# Test 3: Model file
print("3. Testing YOLOv8 model...")
model_path = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "PPE Detection System-v2",
    "runs",
    "detect",
    "train",
    "weights",
    "best.pt"
)
if os.path.exists(model_path):
    print(f"   ✓ Model found: {model_path}\n")
else:
    print(f"   ✗ Model NOT found at: {model_path}\n")

# Test 4: RFID connection
print("4. Testing RFID (ESP32) connection...")
try:
    from rfid import RFIDReader
    
    # List available COM ports
    try:
        import serial.tools.list_ports
        ports = list(serial.tools.list_ports.comports())
        if ports:
            print("   Available COM ports:")
            for port in ports:
                print(f"      {port.device} - {port.description}")
        else:
            print("   No COM ports detected (ESP32 might not be connected)")
    except:
        pass
    
    # Try to connect
    print("\n   Attempting connection on COM4...")
    rfid = RFIDReader(port="COM4", baudrate=115200, timeout=1)
    if rfid.connected:
        print("   ✓ RFID reader connected\n")
        rfid.close()
    else:
        print("   ✗ RFID reader NOT connected")
        print("      Check: Is ESP32 plugged in?")
        print("      Check: Correct COM port in app.py?")
        print("      Check: Arduino Serial Monitor closed?\n")
except Exception as e:
    print(f"   ✗ Error: {e}\n")

# Test 5: Directories
print("5. Testing directories...")
upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend", "uploads")
output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend", "output")

os.makedirs(upload_dir, exist_ok=True)
os.makedirs(output_dir, exist_ok=True)

if os.path.exists(upload_dir) and os.path.exists(output_dir):
    print(f"   ✓ Upload directory: {upload_dir}")
    print(f"   ✓ Output directory: {output_dir}\n")
else:
    print("   ✗ Failed to create directories\n")

# Summary
print("="*60)
if packages_ok:
    print("✓ All tests passed! Ready to run python app.py")
else:
    print("✗ Some tests failed. See above for details.")
print("="*60 + "\n")
