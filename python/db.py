"""
Database module for PPE Detection System
Handles SQLite operations for worker PPE records
"""

import sqlite3
from datetime import datetime
from pathlib import Path


class PPEDatabase:
    def __init__(self, db_path="ppe.db"):
        """Initialize database connection"""
        self.db_path = db_path
        self.ensure_table()

    def ensure_table(self):
        """Create worker_ppe table if it doesn't exist"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS worker_ppe (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                worker_id TEXT,
                helmet TEXT,
                vest TEXT,
                status TEXT,
                gate TEXT,
                time TEXT,
                date TEXT
            )
        """)
        conn.commit()
        conn.close()

    def insert_worker(self, worker_id, helmet, vest, status, gate):
        """Insert a new worker PPE record"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        now = datetime.now()
        time_str = now.strftime("%H:%M:%S")
        date_str = now.strftime("%Y-%m-%d")
        
        cursor.execute("""
            INSERT INTO worker_ppe 
            (worker_id, helmet, vest, status, gate, time, date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (worker_id, helmet, vest, status, gate, time_str, date_str))
        
        conn.commit()
        conn.close()

    def get_all_workers(self):
        """Retrieve all worker records"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT worker_id, helmet, vest, status, time
            FROM worker_ppe
            ORDER BY id DESC
        """)
        rows = cursor.fetchall()
        conn.close()
        
        # Convert to list of dicts for JSON serialization
        workers = []
        for row in rows:
            workers.append({
                "worker_id": row[0],
                "helmet": row[1],
                "vest": row[2],
                "status": "Safe" if row[3] == "SAFE" else "Unsafe",
                "time": row[4]
            })
        return workers

    def get_status_summary(self):
        """Get summary statistics"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT status FROM worker_ppe")
        rows = cursor.fetchall()
        conn.close()
        
        total = len(rows)
        safe = sum(1 for row in rows if row[0] == "SAFE")
        unsafe = total - safe
        
        return {
            "totalWorkers": total,
            "safeWorkers": safe,
            "unsafeWorkers": unsafe
        }

    def clear_records(self):
        """Clear all records (called before new video processing)"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM worker_ppe")
        conn.commit()
        conn.close()
