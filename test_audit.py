import sys
sys.path.insert(0, r"D:\myportfolio-acl-recovery\cybergarde-backend")
from audit_log import ensure_schema, append_alert, verify_chain, backfill_alerts
from alerts_store import initialize as init_alerts
import sqlite3

# Initialize both databases
init_alerts()

conn = sqlite3.connect(":memory:")
conn.row_factory = sqlite3.Row
ensure_schema(conn)

# Now add test alerts
alert1 = {"id":"ALT-1","type":"PII Leak","title":"test","severity":"high","source_ip":"10.0.0.1","target_ip":"10.0.0.2","source_mac":None,"description":"test Arabic PII","port_count":None,"target_port":None,"window_seconds":None,"detected_at":"2026-10-30T08:00:00+00:00","acknowledged":False}
alert2 = {"id":"ALT-2","type":"Port Scan","title":"scan","severity":"medium","source_ip":"10.0.0.3","target_ip":None,"source_mac":None,"description":"test port scan detection","port_count":25,"target_port":None,"window_seconds":5.0,"detected_at":"2026-10-30T08:01:00+00:00","acknowledged":False}

h1 = append_alert(conn, alert1)
h2 = append_alert(conn, alert2)

result = verify_chain(conn)
print("VALID:", result["valid"])
print("MSG:", result["message"])
print("RECORDS:", result["records"])
print("ALERTS CHECKED:", result["alerts_checked"])

# Tamper test
conn.execute("UPDATE audit_log SET record_hash='tampered' WHERE id=1")
result2 = verify_chain(conn)
print("\nAFTER TAMPER VALID:", result2["valid"])
print("AFTER TAMPER ISSUES:", result2["issues"][:2])