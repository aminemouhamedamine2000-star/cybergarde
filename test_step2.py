import sys
sys.path.insert(0, r"D:\myportfolio-acl-recovery\cybergarde-backend")

# Test PII Scanner
print("=== Step 1: Arabic PII Scanner ===")
from pii_scanner import scan_text

r = scan_text("1000123456")  # Saudi ID
print("Saudi ID detected:", r.detected)
print("Saudi ID matches:", r.matches)

r = scan_text("29001010123456")  # Egypt ID
print("Egypt ID detected:", r.detected)

r = scan_text("SA0380000000608010167519")  # IBAN
print("IBAN detected:", r.detected)

r = scan_text("0501234567")  # Gulf phone
print("Gulf phone detected:", r.detected)

r = scan_text("01234567890")  # Egypt phone
print("Egypt phone detected:", r.detected)

r = scan_text("regular text no sensitive data")
print("Clean text detected:", r.detected)

# Test Audit Log
print("\n=== Step 2: Tamper-Proof Audit Log ===")
from audit_log import ensure_schema, append_alert, verify_chain, GENESIS_HASH
import sqlite3

conn = sqlite3.connect(":memory:")
conn.row_factory = sqlite3.Row
ensure_schema(conn)

alert1 = {
    "id": "ALT-TEST001",
    "type": "PII Leak",
    "title": "test",
    "severity": "high",
    "source_ip": "10.0.0.1",
    "target_ip": "10.0.0.2",
    "source_mac": None,
    "description": "test alert",
    "port_count": None,
    "target_port": None,
    "window_seconds": None,
    "detected_at": "2026-10-30T08:00:00+00:00",
    "acknowledged": False,
}

alert2 = {
    "id": "ALT-TEST002",
    "type": "Port Scan",
    "title": "test scan",
    "severity": "medium",
    "source_ip": "10.0.0.3",
    "target_ip": None,
    "source_mac": None,
    "description": "test scan alert",
    "port_count": 25,
    "target_port": None,
    "window_seconds": 5.0,
    "detected_at": "2026-10-30T08:01:00+00:00",
    "acknowledged": False,
}

h1 = append_alert(conn, alert1)
h2 = append_alert(conn, alert2)
print("Record 1 hash:", h1[:16] + "...")
print("Record 2 hash:", h2[:16] + "...")

result = verify_chain(conn)
print("Chain valid:", result["valid"])
print("Message:", result["message"])
print("Records:", result["records"])
print("Alerts checked:", result["alerts_checked"])

# Test tamper detection
conn.execute("UPDATE audit_log SET record_hash = 'tampered' WHERE id = 1")
result2 = verify_chain(conn)
print("\nAfter tampering - valid:", result2["valid"])
print("After tampering - issues:", result2["issues"][:2])

print("\nAll tests completed successfully!")