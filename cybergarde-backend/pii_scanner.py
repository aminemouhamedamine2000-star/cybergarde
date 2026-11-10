"""Arabic PII detection with in-memory redaction.

The packet observer inspects unencrypted TCP/UDP payloads for common Arabic
identity and contact formats. Sensitive values are replaced with
``[REDACTED]`` in memory; only aggregate match types and counts are persisted
in alerts. Raw payloads are never written to the database or application logs.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from scapy.all import IP, Raw, TCP, UDP

import alerts_store

logger = logging.getLogger("cybergarde.pii")

MAX_PAYLOAD_BYTES = 16_384
ALERT_COOLDOWN_SECONDS = 60.0
MAX_COOLDOWN_KEYS = 5000

# Saudi national ID and Egyptian national ID.
SAUDI_ID = re.compile(r"(?<![A-Za-z0-9])[12]\d{9}(?![A-Za-z0-9])")
EGYPT_ID = re.compile(
    r"(?<![A-Za-z0-9])[23]\d{2}"
    r"(?:0[1-9]|1[0-2])"
    r"(?:0[1-9]|[12]\d|3[01])"
    r"\d{2}\d{4}\d(?![A-Za-z0-9])"
)

# Tunisian CIN is eight digits. This intentionally errs on the side of
# redaction; any standalone eight-digit value is treated as sensitive.
CIN = re.compile(r"(?<![A-Za-z0-9])\d{8}(?![A-Za-z0-9])")

# IBANs of Arab countries. Spaces and hyphens are accepted between groups.
IBAN = re.compile(
    r"(?<![A-Za-z0-9])"
    r"(?:SA|AE|EG|QA|KW|BH|JO|LB|IQ|MA|TN|DZ|LY|SD|PS|YE|OM|MR|DJ|SO|KM)"
    r"\d{2}(?:[ -]?[A-Z0-9]){11,30}"
    r"(?![A-Za-z0-9])",
    re.IGNORECASE,
)

# International dialling codes used across the Arab world.
PHONE_INTERNATIONAL = re.compile(
    r"(?<![A-Za-z0-9])(?:\+|00)?"
    r"(?:966|20|216|971|974|965|973|962|961|964|212|213|218|249|"
    r"970|967|968|222|253|252|269)"
    r"(?:[ .\-]?\d){7,12}(?![A-Za-z0-9])"
)

PHONE_GULF = re.compile(r"(?<![A-Za-z0-9])05\d{8}(?![A-Za-z0-9])")
PHONE_EGYPT = re.compile(r"(?<![A-Za-z0-9])01\d{9}(?![A-Za-z0-9])")
PHONE_TUNISIA = re.compile(r"(?<![A-Za-z0-9])[2459]\d{7}(?![A-Za-z0-9])")

_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("IBAN عربي", IBAN),
    ("الهوية المصرية", EGYPT_ID),
    ("الهوية السعودية", SAUDI_ID),
    ("رقم هاتف عربي", PHONE_INTERNATIONAL),
    ("البطاقة الوطنية التونسية (CIN)", CIN),
    ("رقم هاتف عربي", PHONE_GULF),
    ("رقم هاتف عربي", PHONE_EGYPT),
    ("رقم هاتف عربي", PHONE_TUNISIA),
)

_lock = threading.Lock()
_last_alert_at: dict[tuple[str, str, tuple[str, ...]], float] = {}


@dataclass(frozen=True)
class PIIScanResult:
    """Result of scanning and redacting one text payload."""

    total: int
    matches: dict[str, int]
    redacted_text: str

    @property
    def detected(self) -> bool:
        return self.total > 0


def scan_text(text: str) -> PIIScanResult:
    """Detect PII in text and replace every match with ``[REDACTED]``."""

    redacted = text
    matches: dict[str, int] = {}
    total = 0

    for label, pattern in _PATTERNS:
        redacted, count = pattern.subn("[REDACTED]", redacted)
        if count:
            matches[label] = matches.get(label, 0) + count
            total += count

    return PIIScanResult(
        total=total,
        matches=matches,
        redacted_text=redacted,
    )


def scan_bytes(payload: bytes) -> PIIScanResult:
    """Decode a bounded payload and scan it if it looks like text."""

    sample = payload[:MAX_PAYLOAD_BYTES]
    text = sample.decode("utf-8", errors="ignore")

    if not text:
        return PIIScanResult(0, {}, "")

    printable = sum(1 for character in text if character.isprintable() or character.isspace())
    if printable / max(len(text), 1) < 0.65:
        return PIIScanResult(0, {}, "")

    return scan_text(text)


class PIIRedactionFilter(logging.Filter):
    """Redact Arabic PII from any log record before it is emitted.

    This covers access-log paths and error messages even when the payload came
    from an application request rather than the packet observer.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            return True

        try:
            result = scan_text(message)
        except Exception:
            return True

        if result.detected:
            record.msg = result.redacted_text
            record.args = ()

        return True


def install_log_redaction() -> None:
    """Attach the redaction filter to existing application/uvicorn handlers."""

    for logger_name in ("", "uvicorn", "uvicorn.access", "uvicorn.error", "cybergarde"):
        logger = logging.getLogger(logger_name)

        for handler in logger.handlers:
            already_installed = any(
                isinstance(existing, PIIRedactionFilter)
                for existing in handler.filters
            )
            if not already_installed:
                handler.addFilter(PIIRedactionFilter())


def _prune_cooldowns(now: float) -> None:
    if len(_last_alert_at) <= MAX_COOLDOWN_KEYS:
        return

    cutoff = now - (ALERT_COOLDOWN_SECONDS * 5)
    stale = [key for key, seen_at in _last_alert_at.items() if seen_at < cutoff]

    for key in stale:
        del _last_alert_at[key]


def record_packet(packet: Any) -> None:
    """Packet observer: redact PII and persist a safe aggregate alert."""

    try:
        if not packet.haslayer(Raw) or not packet.haslayer(IP):
            return

        payload = bytes(packet[Raw].load)
        if not payload:
            return

        result = scan_bytes(payload)
        if not result.detected:
            return

        ip_layer = packet[IP]
        source_ip = ip_layer.src
        target_ip = ip_layer.dst
        target_port: int | None = None

        if packet.haslayer(TCP):
            target_port = int(packet[TCP].dport)
        elif packet.haslayer(UDP):
            target_port = int(packet[UDP].dport)
    except (AttributeError, IndexError, TypeError, ValueError):
        return

    match_signature = tuple(sorted(result.matches))
    cooldown_key = (source_ip, target_ip, match_signature)
    now = time.monotonic()

    with _lock:
        _prune_cooldowns(now)
        previous = _last_alert_at.get(cooldown_key)
        if (
            previous is not None
            and now - previous < ALERT_COOLDOWN_SECONDS
        ):
            return
        _last_alert_at[cooldown_key] = now

    type_summary = "، ".join(
        f"{label} ({count})"
        for label, count in sorted(result.matches.items())
    )
    description = (
        "تم اعتراض بيانات هوية عربية وتعميتها بنجاح. "
        "تم استبدال القيم الحساسة بـ [REDACTED]. "
        f"الأنواع: {type_summary}."
    )

    try:
        alerts_store.record_alert(
            alert_type="PII Leak",
            title="اعتراض بيانات هوية عربية",
            severity="high",
            source_ip=source_ip,
            target_ip=target_ip,
            target_port=target_port,
            description=description,
        )
    except Exception:
        logger.exception("Unable to persist the Arabic PII alert")

    logger.warning(
        "Arabic PII redacted in transit: %s -> %s types=%s",
        source_ip,
        target_ip,
        type_summary,
    )
