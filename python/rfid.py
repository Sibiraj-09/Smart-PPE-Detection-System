"""
RFID module for PPE Detection System
Handles serial communication with ESP32 for RFID scanning and LED/Buzzer control
"""

import serial
import time


class RFIDReader:
    def __init__(self, port="COM4", baudrate=115200, timeout=1):
        """
        Initialize RFID reader connection to ESP32
        
        Args:
            port: Serial port (e.g., COM4 on Windows)
            baudrate: Serial communication speed (default 115200)
            timeout: Read timeout in seconds
        """
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.ser = None
        self.connected = False
        self.connect()

    def connect(self):
        """Connect to ESP32 via serial port"""
        try:
            self.ser = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=self.timeout
            )
            time.sleep(2)  # Wait for ESP32 to be ready
            self.connected = True
            print(f"✓ RFID reader connected on {self.port}")
            return True
        except Exception as e:
            print(f"✗ Failed to connect RFID reader: {e}")
            self.connected = False
            return False

    def read_uid(self):
        """
        Read RFID UID from ESP32
        
        Returns:
            UID string if scanned, None if timeout or error
        """
        if not self.connected or self.ser is None:
            return None
        
        try:
            if self.ser.in_waiting:
                uid = self.ser.readline().decode().strip()
                if uid:
                    print(f"✓ RFID scanned: {uid}")
                    return uid
        except Exception as e:
            print(f"✗ Error reading RFID: {e}")
            self.connected = False
        
        return None

    def send_signal(self, signal):
        """
        Send signal to ESP32 for LED/Buzzer control
        
        Args:
            signal: 'G' (green LED - SAFE)
                   'R' (red LED + buzzer - UNSAFE)
                   'O' (turn off all)
        """
        if not self.connected or self.ser is None:
            print(f"✗ Cannot send signal: RFID reader not connected")
            return False
        
        valid_signals = ['G', 'R', 'O']
        if signal not in valid_signals:
            print(f"✗ Invalid signal: {signal}. Use G, R, or O")
            return False
        
        try:
            self.ser.write(signal.encode())
            action_desc = {
                'G': 'Green LED (SAFE)',
                'R': 'Red LED + Buzzer (UNSAFE)',
                'O': 'Turn off'
            }
            print(f"✓ Sent {action_desc.get(signal, 'Unknown')}")
            return True
        except Exception as e:
            print(f"✗ Failed to send signal: {e}")
            self.connected = False
            return False

    def wait_for_rfid(self, timeout=10):
        """
        Wait for RFID scan with timeout
        
        Args:
            timeout: Maximum wait time in seconds
            
        Returns:
            UID if scanned, None if timeout
        """
        start_time = time.time()
        while time.time() - start_time < timeout:
            uid = self.read_uid()
            if uid:
                return uid
            time.sleep(0.1)
        
        print(f"✗ RFID timeout: No scan detected in {timeout}s")
        return None

    def close(self):
        """Close serial connection"""
        if self.ser:
            try:
                self.ser.close()
                self.connected = False
                print("RFID reader disconnected")
            except Exception as e:
                print(f"Error closing RFID connection: {e}")
