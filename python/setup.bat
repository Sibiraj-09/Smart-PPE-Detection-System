@echo off
REM PPE Detection System - Setup Script
REM Install all required Python dependencies

echo.
echo ===============================================
echo Smart PPE Detection System - Setup
echo ===============================================
echo.

echo Installing Python dependencies...
pip install -r requirements.txt

echo.
echo ===============================================
echo Setup complete!
echo ===============================================
echo.
echo Next steps:
echo 1. Connect ESP32 via USB
echo 2. Close Arduino Serial Monitor (if open)
echo 3. Run: python app.py
echo 4. Open: http://localhost:5000
echo.
