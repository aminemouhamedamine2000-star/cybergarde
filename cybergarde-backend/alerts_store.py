"""Persistent alert and device-inventory store for Cyber Garde.

The project intentionally uses SQLite from Python's standard library so a
company deployment does not need a separate database service. Alert writes are
committed immediately, which means the alert log and compromised-device flags
survive backend restarts.
"""

from __future__ import annotations

import hashlib
import logging
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import audit_log

logger = logging.getLogger("cybergarde.alerts")

_DEFAULT_DB_PATH = Path(__file__).resolve().with_name("cybergarde.db")
DB_PATH = Path(
    os.environ.get("CYBERGARDE_DB_PATH", str(_DEFAULT_DB_PATH))
)

_LOCK = threading.RLock()

_THREAT_TYPES = ("Port Scan", "Honeypot Contact", "PII Leak")


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(str(DB_PATH), timeout=10.0)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 10000")
    return connection


def initialize() -> None:
    """Create the SQLite schema if it does not exist yet."""

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with _LOCK:
        connection = _connect()

        try:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alert_uid TEXT NOT NULL UNIQUE,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    source_ip TEXT,
                    target_ip TEXT,
                    source_mac TEXT,
                    description TEXT NOT NULL,
                    port_count INTEGER,
                    target_port INTEGER,
                    window_seconds REAL,
                    created_at TEXT NOT NULL,
                    acknowledged INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_alerts_created_at
                ON alerts(created_at DESC)
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS known_devices (
                    mac TEXT PRIMARY KEY,
                    ip TEXT NOT NULL,
                    first_seen TEXT NOT NULL,
                    last_seen TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS compromised_devices (
                    ip TEXT PRIMARY KEY,
                    detected_at TEXT NOT NULL,
                    last_seen TEXT NOT NULL,
                    source_mac TEXT,
                    attempts INTEGER NOT NULL DEFAULT 1
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS app_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )
            audit_log.ensure_schema(connection)
            backfilled = audit_log.backfill_alerts(connection)
            if backfilled:
                logger.info(
                    "Backfilled %d existing alerts into the audit chain",
                    backfilled,
                )
            connection.commit()
        finally:
            connection.close()

    logger.info("Alert database ready at %s", DB_PATH)


def _as_utc(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)

    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return datetime.now(timezone.utc)

    return _as_utc(parsed)


def _row_to_alert(row: sqlite3.Row) -> dict[str, Any]:
    return {
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
        "detected_at": _parse_datetime(row["created_at"]),
        "acknowledged": bool(row["acknowledged"]),
    }


def _insert_alert(
    connection: sqlite3.Connection,
    *,
    alert_type: str,
    title: str,
    severity: str,
    description: str,
    source_ip: str | None = None,
    target_ip: str | None = None,
    source_mac: str | None = None,
    port_count: int | None = None,
    target_port: int | None = None,
    window_seconds: float | None = None,
    created_at: datetime | None = None,
) -> dict[str, Any]:
    created = _as_utc(created_at)
    alert_uid = f"ALT-{uuid.uuid4().hex[:10].upper()}"

    connection.execute(
        """
        INSERT INTO alerts (
            alert_uid, type, title, severity, source_ip, target_ip,
            source_mac, description, port_count, target_port,
            window_seconds, created_at, acknowledged
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """,
        (
            alert_uid,
            alert_type,
            title,
            severity,
            source_ip,
            target_ip,
            source_mac,
            description,
            port_count,
            target_port,
            window_seconds,
            created.isoformat(),
        ),
    )

    # Persist the compromised state separately from the alert history so a
    # device keeps its red badge even after old alerts are trimmed.
    if alert_type == "Honeypot Contact" and source_ip:
        connection.execute(
            """
            INSERT INTO compromised_devices (
                ip, detected_at, last_seen, source_mac, attempts
            )
            VALUES (?, ?, ?, ?, 1)
            ON CONFLICT(ip) DO UPDATE SET
                last_seen = excluded.last_seen,
                source_mac = COALESCE(excluded.source_mac, compromised_devices.source_mac),
                attempts = compromised_devices.attempts + 1
            """,
            (source_ip, created.isoformat(), created.isoformat(), source_mac),
        )

    alert = {
        "id": alert_uid,
        "type": alert_type,
        "title": title,
        "severity": severity,
        "source_ip": source_ip,
        "target_ip": target_ip,
        "source_mac": source_mac,
        "description": description,
        "port_count": port_count,
        "target_port": target_port,
        "window_seconds": window_seconds,
        "detected_at": created,
        "acknowledged": False,
    }

    # The alert and its audit record are written in the same transaction.
    audit_log.append_alert(connection, alert)

    return alert


def record_alert(
    *,
    alert_type: str,
    title: str,
    severity: str,
    description: str,
    source_ip: str | None = None,
    target_ip: str | None = None,
    source_mac: str | None = None,
    port_count: int | None = None,
    target_port: int | None = None,
    window_seconds: float | None = None,
    created_at: datetime | None = None,
) -> dict[str, Any]:
    """Insert and commit one alert immediately."""

    with _LOCK:
        connection = _connect()

        try:
            alert = _insert_alert(
                connection,
                alert_type=alert_type,
                title=title,
                severity=severity,
                description=description,
                source_ip=source_ip,
                target_ip=target_ip,
                source_mac=source_mac,
                port_count=port_count,
                target_port=target_port,
                window_seconds=window_seconds,
                created_at=created_at,
            )
            connection.commit()
            return alert
        finally:
            connection.close()


def list_alerts(limit: int = 100) -> tuple[list[dict[str, Any]], int, int]:
    """Return newest alerts, the total count, and unacknowledged count."""

    safe_limit = max(1, min(int(limit), 500))

    with _LOCK:
        connection = _connect()

        try:
            rows = connection.execute(
                """
                SELECT * FROM alerts
                ORDER BY id DESC
                LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
            total = connection.execute(
                "SELECT COUNT(*) FROM alerts"
            ).fetchone()[0]
            unacknowledged = connection.execute(
                "SELECT COUNT(*) FROM alerts WHERE acknowledged = 0"
            ).fetchone()[0]

            return (
                [_row_to_alert(row) for row in rows],
                int(total),
                int(unacknowledged),
            )
        finally:
            connection.close()


def get_threat_total() -> int:
    """Count persisted port-scan and honeypot alerts."""

    with _LOCK:
        connection = _connect()

        try:
            row = connection.execute(
                """
                SELECT COUNT(*) FROM alerts
                WHERE type IN (?, ?, ?)
                """,
                _THREAT_TYPES,
            ).fetchone()
            return int(row[0]) if row else 0
        finally:
            connection.close()


def get_alert_stats() -> dict[str, Any]:
    """Return aggregate alert counts for the compliance report."""

    with _LOCK:
        connection = _connect()

        try:
            total = connection.execute(
                "SELECT COUNT(*) FROM alerts"
            ).fetchone()[0]
            unacknowledged = connection.execute(
                "SELECT COUNT(*) FROM alerts WHERE acknowledged = 0"
            ).fetchone()[0]
            by_type = {
                row["type"]: int(row["count"])
                for row in connection.execute(
                    "SELECT type, COUNT(*) AS count FROM alerts GROUP BY type"
                )
            }
            by_severity = {
                row["severity"]: int(row["count"])
                for row in connection.execute(
                    "SELECT severity, COUNT(*) AS count FROM alerts GROUP BY severity"
                )
            }

            return {
                "total": int(total),
                "unacknowledged": int(unacknowledged),
                "by_type": by_type,
                "by_severity": by_severity,
            }
        finally:
            connection.close()


def clear_all_alerts() -> int:
    """Delete all alerts from the database and reset the audit anchor.

    Returns the number of alerts deleted.
    """

    with _LOCK:
        connection = _connect()

        try:
            deleted = connection.execute(
                "DELETE FROM alerts"
            ).rowcount
            # Reset audit anchor since records changed
            connection.execute(
                """
                INSERT OR REPLACE INTO audit_anchor (id, record_count, last_hash)
                VALUES (1, 0, ?)
                """,
                (hashlib.sha256(b"").hexdigest(),),
            )
            connection.commit()
            logger.info("Deleted %d alerts from the database", deleted)
            return int(deleted) if deleted else 0
        finally:
            connection.close()


def get_honeypot_compromised_sources() -> dict[str, dict[str, Any]]:
    """Return devices persisted as compromised by honeypot contacts."""

    with _LOCK:
        connection = _connect()

        try:
            rows = connection.execute(
                """
                SELECT ip, detected_at, last_seen, source_mac, attempts
                FROM compromised_devices
                """
            ).fetchall()

            return {
                row["ip"]: {
                    "detected_at": _parse_datetime(row["detected_at"]),
                    "last_seen": _parse_datetime(row["last_seen"]),
                    "source_mac": row["source_mac"],
                    "attempts": int(row["attempts"]),
                }
                for row in rows
            }
        finally:
            connection.close()


def process_device_scan(devices: Iterable[dict[str, str]]) -> int:
    """Persist the device inventory and report newly discovered devices.

    The very first scan after the database is created seeds the baseline so
    existing company devices do not all generate "new device" alerts. The
    baseline marker is stored even when the first scan finds zero devices.
    """

    with _LOCK:
        connection = _connect()

        try:
            initialized = connection.execute(
                "SELECT value FROM app_meta WHERE key = 'inventory_initialized'"
            ).fetchone()
            known_count = connection.execute(
                "SELECT COUNT(*) FROM known_devices"
            ).fetchone()[0]
            baseline = initialized is None and known_count == 0

            if initialized is None and known_count > 0:
                connection.execute(
                    """
                    INSERT OR REPLACE INTO app_meta (key, value)
                    VALUES ('inventory_initialized', '1')
                    """
                )

            now = datetime.now(timezone.utc)
            now_iso = now.isoformat()
            known = {
                row["mac"]: row["ip"]
                for row in connection.execute(
                    "SELECT mac, ip FROM known_devices"
                )
            }
            new_alerts = 0

            for device in devices:
                ip = str(device.get("ip", "")).strip()
                mac = str(device.get("mac", "")).strip().upper()

                if not ip or not mac:
                    continue

                if mac in known:
                    if known[mac] != ip:
                        connection.execute(
                            """
                            UPDATE known_devices
                            SET ip = ?, last_seen = ?
                            WHERE mac = ?
                            """,
                            (ip, now_iso, mac),
                        )
                        known[mac] = ip
                    else:
                        connection.execute(
                            "UPDATE known_devices SET last_seen = ? WHERE mac = ?",
                            (now_iso, mac),
                        )
                    continue

                connection.execute(
                    """
                    INSERT INTO known_devices (mac, ip, first_seen, last_seen)
                    VALUES (?, ?, ?, ?)
                    """,
                    (mac, ip, now_iso, now_iso),
                )
                known[mac] = ip

                if not baseline:
                    _insert_alert(
                        connection,
                        alert_type="New Device",
                        title="جهاز جديد مكتشف",
                        severity="medium",
                        source_ip=ip,
                        source_mac=mac,
                        description=(
                            f"تم اكتشاف جهاز جديد على الشبكة: "
                            f"{ip} ({mac})."
                        ),
                        created_at=now,
                    )
                    new_alerts += 1

            if baseline:
                connection.execute(
                    """
                    INSERT OR REPLACE INTO app_meta (key, value)
                    VALUES ('inventory_initialized', '1')
                    """
                )

            connection.commit()

            if new_alerts:
                logger.info("Generated %d new-device alert(s)", new_alerts)

            return new_alerts
        finally:
            connection.close()


def get_database_path() -> str:
    return str(DB_PATH)


def verify_audit() -> dict[str, Any]:
    """Verify the hash chain and alert coverage."""

    with _LOCK:
        connection = _connect()

        try:
            return audit_log.verify_chain(connection)
        finally:
            connection.close()


try:
    initialize()
except Exception:
    logger.exception("Unable to initialize the Cyber Garde alert database")
