"""Tamper-evident audit trail for Cyber Garde alerts.

Every alert is appended to a SHA-256 hash chain. Each record contains the hash
of the previous record, so editing or removing a record in the middle breaks
the chain. An anchor row records the expected record count and last hash, which
also detects truncation at the end of the chain.

The verifier additionally cross-checks every alert in the ``alerts`` table
against its audit record. Deleting or editing an alert directly in SQLite is
therefore detected even when the hash chain itself still looks valid.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

GENESIS_HASH = "0" * 64


def ensure_schema(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            alert_uid TEXT,
            payload_json TEXT NOT NULL,
            prev_hash TEXT NOT NULL,
            record_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_audit_log_alert_uid
        ON audit_log(alert_uid)
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_anchor (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            record_count INTEGER NOT NULL,
            last_hash TEXT NOT NULL
        )
        """
    )


def _iso(value: Any) -> str:
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(str(value))

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc).isoformat()


def _canonical_alert(alert: dict[str, Any]) -> str:
    payload = {
        "id": alert.get("id"),
        "type": alert.get("type"),
        "title": alert.get("title"),
        "severity": alert.get("severity"),
        "source_ip": alert.get("source_ip"),
        "target_ip": alert.get("target_ip"),
        "source_mac": alert.get("source_mac"),
        "description": alert.get("description"),
        "port_count": alert.get("port_count"),
        "target_port": alert.get("target_port"),
        "window_seconds": alert.get("window_seconds"),
        "detected_at": _iso(alert.get("detected_at")),
        "acknowledged": bool(alert.get("acknowledged", False)),
    }

    return json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _canonical_alert_row(row: sqlite3.Row) -> str:
    return _canonical_alert(
        {
            "id": row["alert_uid"],
            "type": row["type"],
            "title": row["title"],
            "severity": row["severity"],
            "source_ip": row["source_ip"],
            "target_ip": row["target_ip"],
            "source_mac": row["source_mac"],
            "description": row["description"],
            "port_count": row["port_count"],
            "target_port": row["target_port"],
            "window_seconds": row["window_seconds"],
            "detected_at": row["created_at"],
            "acknowledged": bool(row["acknowledged"]),
        }
    )


def append_alert(
    connection: sqlite3.Connection,
    alert: dict[str, Any],
) -> str:
    """Append one alert to the chain using the caller's transaction."""

    last = connection.execute(
        "SELECT record_hash FROM audit_log ORDER BY id DESC LIMIT 1"
    ).fetchone()
    previous_hash = last["record_hash"] if last else GENESIS_HASH

    payload_json = _canonical_alert(alert)
    record_hash = hashlib.sha256(
        (previous_hash + payload_json).encode("utf-8")
    ).hexdigest()
    created_at = _iso(alert.get("detected_at"))

    connection.execute(
        """
        INSERT INTO audit_log (
            event_type, alert_uid, payload_json,
            prev_hash, record_hash, created_at
        )
        VALUES ('alert', ?, ?, ?, ?, ?)
        """,
        (
            alert.get("id"),
            payload_json,
            previous_hash,
            record_hash,
            created_at,
        ),
    )

    record_count = connection.execute(
        "SELECT COUNT(*) FROM audit_log"
    ).fetchone()[0]
    connection.execute(
        """
        INSERT INTO audit_anchor (id, record_count, last_hash)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            record_count = excluded.record_count,
            last_hash = excluded.last_hash
        """,
        (record_count, record_hash),
    )

    return record_hash


def backfill_alerts(connection: sqlite3.Connection) -> int:
    """Seed the chain from alerts created before the audit feature existed.

    This is a one-time migration. It runs only when the audit table is empty
    and the alerts table already contains data.
    """

    audit_count = connection.execute(
        "SELECT COUNT(*) FROM audit_log"
    ).fetchone()[0]
    if audit_count:
        return 0

    rows = connection.execute(
        "SELECT * FROM alerts ORDER BY id ASC"
    ).fetchall()
    if not rows:
        return 0

    previous_hash = GENESIS_HASH
    record_count = 0

    for row in rows:
        payload_json = _canonical_alert_row(row)
        record_hash = hashlib.sha256(
            (previous_hash + payload_json).encode("utf-8")
        ).hexdigest()

        connection.execute(
            """
            INSERT INTO audit_log (
                event_type, alert_uid, payload_json,
                prev_hash, record_hash, created_at
            )
            VALUES ('alert', ?, ?, ?, ?, ?)
            """,
            (
                row["alert_uid"],
                payload_json,
                previous_hash,
                record_hash,
                _iso(row["created_at"]),
            ),
        )

        previous_hash = record_hash
        record_count += 1

    connection.execute(
        """
        INSERT OR REPLACE INTO audit_anchor (id, record_count, last_hash)
        VALUES (1, ?, ?)
        """,
        (record_count, previous_hash),
    )

    return record_count


def verify_chain(connection: sqlite3.Connection) -> dict[str, Any]:
    """Verify hashes, anchor, and alert-to-audit coverage."""

    rows = connection.execute(
        "SELECT * FROM audit_log ORDER BY id ASC"
    ).fetchall()
    issues: list[str] = []
    broken_at: int | None = None
    previous_hash = GENESIS_HASH

    for row in rows:
        expected_hash = hashlib.sha256(
            (previous_hash + row["payload_json"]).encode("utf-8")
        ).hexdigest()

        if row["prev_hash"] != previous_hash:
            issues.append(f"السجل {row['id']}: رابط السلسلة السابق غير صحيح")
            broken_at = row["id"]
            break

        if row["record_hash"] != expected_hash:
            issues.append(f"السجل {row['id']}: بصمة SHA-256 غير صحيحة")
            broken_at = row["id"]
            break

        previous_hash = row["record_hash"]

    anchor = connection.execute(
        "SELECT record_count, last_hash FROM audit_anchor WHERE id = 1"
    ).fetchone()

    if rows:
        if anchor is None:
            issues.append("مرساة سجل التدقيق مفقودة")
        else:
            if int(anchor["record_count"]) != len(rows):
                issues.append("عدد سجلات التدقيق لا يطابق المرساة")
            if anchor["last_hash"] != rows[-1]["record_hash"]:
                issues.append("بصمة آخر سجل لا تطابق المرساة")
    elif anchor is not None and int(anchor["record_count"]) != 0:
        issues.append("سجلات التدقيق مفقودة رغم وجود مرساة")

    alerts = connection.execute(
        "SELECT * FROM alerts ORDER BY id ASC"
    ).fetchall()
    audit_alerts = {
        row["alert_uid"]: row["payload_json"]
        for row in rows
        if row["event_type"] == "alert" and row["alert_uid"]
    }

    alert_uids: set[str] = set()

    for alert in alerts:
        alert_uid = alert["alert_uid"]
        alert_uids.add(alert_uid)
        stored_payload = audit_alerts.get(alert_uid)

        if stored_payload is None:
            issues.append(f"التنبيه {alert_uid} غير موجود في سجل التدقيق")
            continue

        if stored_payload != _canonical_alert_row(alert):
            issues.append(f"التنبيه {alert_uid} تم تعديل بياناته")

    for alert_uid in audit_alerts:
        if alert_uid not in alert_uids:
            issues.append(f"التنبيه {alert_uid} تم حذفه من قاعدة البيانات")

    valid = not issues

    return {
        "valid": valid,
        "message": (
            "السجلات سليمة وآمنة 100%."
            if valid
            else "تحذير: تم التلاعب بالسجلات!"
        ),
        "records": len(rows),
        "alerts_checked": len(alerts),
        "verified_at": datetime.now(timezone.utc),
        "broken_at": broken_at,
        "issues": issues[:20],
    }
