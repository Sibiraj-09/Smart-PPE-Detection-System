/*
 * ESP32 RFID + LED + Buzzer Control
 * 
 * Hardware Connections:
 * RFID (MFRC522):
 *   SDA → GPIO5 (D5)
 *   SCK → GPIO18 (D18)
 *   MOSI → GPIO23 (D23)
 *   MISO → GPIO19 (D19)
 *   RST → GPIO22 (D22)
 *   VCC → 3.3V
 *   GND → GND
 * 
 * LEDs:
 *   Red LED long leg → GPIO12 (D12) (with resistor to GND)
 *   Green LED long leg → GPIO14 (D14) (with resistor to GND)
 * 
 * Buzzer:
 *   Positive → GPIO13 (D13) (with resistor if needed)
 *   Negative → GND
 * 
 * Serial: USB to COM port (115200 baud)
 */

#include <SPI.h>
#include <MFRC522.h>

// Pin Definitions (ESP32 GPIO numbers)
#define RST_PIN 22    // GPIO22
#define SS_PIN 5      // GPIO5
#define RED_LED 12    // GPIO12
#define GREEN_LED 14  // GPIO14
#define BUZZER 13     // GPIO13

// RFID Reader
MFRC522 mfrc522(SS_PIN, RST_PIN);

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  // Initialize pins
  pinMode(RED_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  
  // Turn off all LEDs initially
  digitalWrite(RED_LED, LOW);
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(BUZZER, LOW);
  
  // Initialize SPI
  SPI.begin();
  
  // Initialize RFID reader
  mfrc522.PCD_Init();
  
  Serial.println("\n========================================");
  Serial.println("ESP32 RFID Reader + LED Control");
  Serial.println("========================================");
  Serial.println("Ready for RFID scanning...");
  Serial.println("Waiting for commands from Python:");
  Serial.println("  'G' = Green LED (SAFE)");
  Serial.println("  'R' = Red LED + Buzzer (UNSAFE)");
  Serial.println("  'O' = Turn Off");
  Serial.println("========================================\n");
}

void loop() {
  // =====================================================================
  // CHECK FOR SERIAL COMMANDS FROM PYTHON
  // =====================================================================
  if (Serial.available() > 0) {
    char command = Serial.read();
    
    if (command == 'G') {
      // SAFE - Green LED
      digitalWrite(RED_LED, LOW);
      digitalWrite(BUZZER, LOW);
      digitalWrite(GREEN_LED, HIGH);
      Serial.println("✓ GREEN LED ON (SAFE)");
      
    } else if (command == 'R') {
      // UNSAFE - Red LED + Buzzer
      digitalWrite(GREEN_LED, LOW);
      digitalWrite(RED_LED, HIGH);
      digitalWrite(BUZZER, HIGH);
      Serial.println("✓ RED LED + BUZZER ON (UNSAFE)");
      delay(500);
      digitalWrite(BUZZER, LOW);  // Pulse buzzer
      delay(200);
      digitalWrite(BUZZER, HIGH);
      delay(500);
      digitalWrite(BUZZER, LOW);
      
    } else if (command == 'O') {
      // OFF - Turn everything off
      digitalWrite(RED_LED, LOW);
      digitalWrite(GREEN_LED, LOW);
      digitalWrite(BUZZER, LOW);
      Serial.println("✓ ALL OFF");
    }
  }
  
  // =====================================================================
  // CHECK FOR RFID CARD SCAN
  // =====================================================================
  if (!mfrc522.PICC_IsNewCardPresent()) {
    delay(50);
    return;
  }
  
  if (!mfrc522.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }
  
  // =====================================================================
  // READ RFID UID AND SEND TO PYTHON
  // =====================================================================
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) {
      uid += "0";
    }
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  
  uid.toUpperCase();
  Serial.println(uid);  // Send UID to Python
  
  Serial.print("ℹ Scanned RFID: ");
  Serial.println(uid);
  
  // =====================================================================
  // HALT CARD AND PREPARE FOR NEXT SCAN
  // =====================================================================
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
  
  delay(500);  // Debounce delay
}

/*
SERIAL COMMUNICATION PROTOCOL:
================================

Python sends commands:
  'G' → Green LED ON (worker is SAFE)
  'R' → Red LED + Buzzer ON (worker is UNSAFE)
  'O' → All OFF

ESP32 sends RFID UID when card scanned:
  UID (uppercase hex string, e.g., "A1B2C3D4")

Example flow:
  1. Python app detects person entering zone
  2. Python waits for RFID scan
  3. User scans RFID card
  4. ESP32 reads card and sends UID to Python
  5. Python receives UID and processes
  6. Python sends 'G' or 'R' command based on PPE status
  7. ESP32 lights up appropriate LED and buzzer
  8. Python saves to database
  9. Python sends 'O' to turn off after 2 seconds
*/
