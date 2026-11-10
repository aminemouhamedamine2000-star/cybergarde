"""Connection journal and one-click forensic analysis for Cyber Garde.

The shared Scapy capture thread passes every captured packet to
``record_packet``. Only TCP SYN connection attempts are retained, and only
metadata is stored (source/destination address and port plus a timestamp);
packet payloads are never kept.

The journal is bounded so a busy or hostile network cannot exhaust memory.
"""

from __future__ import annotations

import ipaddress
import logging
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Iterable

from scapy.all import IP, TCP

logger = logging.getLogger("cybergarde.forensics")

MAX_CONNECTIONS = 5000
FLOW_DEDUP_SECONDS = 5.0
FLOW_RETENTION_SECONDS = 120.0
DEFAULT_LIMIT = 50

DANGEROUS_PORTS: dict[int, str] = {
    21: "FTP غير مشفّر",
    23: "Telnet غير مشفّر",
    139: "NetBIOS",
    445: "SMB",
    3389: "سطح المكتب البعيد (RDP)",
    4444: "منفذ شائع للأدوات الخبيثة",
    5900: "VNC",
}


class ConnectionLog:
    """Thread-safe, bounded journal of recent TCP connection attempts."""

    def __init__(
        self,
        *,
        max_connections: int = MAX_CONNECTIONS,
        dedup_seconds: float = FLOW_DEDUP_SECONDS,
    ) -> None:
        if max_connections < 1:
            raise ValueError("max_connections must be positive")
        if dedup_seconds < 0:
            raise ValueError("dedup_seconds cannot be negative")

        self.max_connections = max_connections
        self.dedup_seconds = dedup_seconds
        self._lock = threading.Lock()
        self._connections: deque[dict[str, Any]] = deque(maxlen=max_connections)
        self._last_flow: dict[tuple[str, int, str, int], float] = {}
        self._last_cleanup = time.monotonic()

    def record_packet(self, packet: Any) -> None:
        """Record one TCP SYN packet, if it represents a new flow."""

        try:
            if not packet.haslayer(IP) or not packet.haslayer(TCP):
                return

            tcp_layer = packet[TCP]
            flags = tcp_layer.flags

            # A connection attempt is a bare SYN. SYN-ACK and established
            # traffic belong to a flow that is already in the journal.
            if "S" not in flags or "A" in flags:
                return

            source_ip = packet[IP].src
            destination_ip = packet[IP].dst
            source_port = tcp_layer.sport
            destination_port = tcp_layer.dport
        except (AttributeError, IndexError, TypeError):
            return

        if not source_ip or not destination_ip:
            return
        if not isinstance(source_port, int) or not isinstance(destination_port, int):
            return
        if not (0 < source_port < 65536 and 0 < destination_port < 65536):
            return

        now = time.monotonic()
        flow = (source_ip, source_port, destination_ip, destination_port)

        with self._lock:
            self._cleanup_locked(now)

            previous = self._last_flow.get(flow)
            if previous is not None and now - previous < self.dedup_seconds:
                return

            self._last_flow[flow] = now
            self._connections.append(
                {
                    "timestamp": datetime.now(timezone.utc),
                    "src_ip": source_ip,
                    "src_port": source_port,
                    "dst_ip": destination_ip,
                    "dst_port": destination_port,
                    "protocol": "TCP",
                }
            )

    def _cleanup_locked(self, now: float) -> None:
        if now - self._last_cleanup < 30.0:
            return

        self._last_cleanup = now
        cutoff = now - FLOW_RETENTION_SECONDS

        stale_flows = [
            flow
            for flow, seen_at in self._last_flow.items()
            if seen_at < cutoff
        ]
        for flow in stale_flows:
            del self._last_flow[flow]

    def get_for_ip(self, ip: str, limit: int = DEFAULT_LIMIT) -> list[dict[str, Any]]:
        """Return the newest connection records involving *ip*."""

        safe_limit = max(1, min(limit, self.max_connections))

        with self._lock:
            matches: list[dict[str, Any]] = []

            for record in reversed(self._connections):
                if record["src_ip"] == ip or record["dst_ip"] == ip:
                    matches.append(dict(record))
                    if len(matches) >= safe_limit:
                        break

            return matches

    def snapshot(self) -> list[dict[str, Any]]:
        """Return a copy of the whole journal for aggregate reporting."""

        with self._lock:
            return [dict(record) for record in self._connections]


def _parse_network(value: str | None) -> ipaddress.IPv4Network | None:
    if not value:
        return None

    try:
        network = ipaddress.ip_network(value, strict=False)
    except (TypeError, ValueError):
        return None

    return network if isinstance(network, ipaddress.IPv4Network) else None


def _unknown_reason(
    remote_ip: str,
    known_ips: set[str],
    network: ipaddress.IPv4Network | None,
) -> str | None:
    if remote_ip in known_ips:
        return None

    try:
        address = ipaddress.ip_address(remote_ip)
    except ValueError:
        return "عنوان IP غير صالح"

    if address.is_loopback or address.is_unspecified or address.is_multicast:
        return None

    if network is not None and address in network:
        return "عنوان محلي غير مدرج في جرد الأجهزة"

    return "عنوان خارجي غير موثّق في جرد الأجهزة"


def analyze_connection(
    record: dict[str, Any],
    device_ip: str,
    known_ips: set[str],
    network: ipaddress.IPv4Network | None,
) -> dict[str, Any]:
    """Turn a raw journal record into a device-oriented finding."""

    outbound = record["src_ip"] == device_ip

    if outbound:
        direction = "outbound"
        remote_ip = record["dst_ip"]
        remote_port = record["dst_port"]
        local_port = record["src_port"]
        service_port = record["dst_port"]
    else:
        direction = "inbound"
        remote_ip = record["src_ip"]
        remote_port = record["src_port"]
        local_port = record["dst_port"]
        service_port = record["dst_port"]

    reasons: list[str] = []
    dangerous_label = DANGEROUS_PORTS.get(service_port)
    if dangerous_label:
        reasons.append(f"منفذ خطر {service_port}: {dangerous_label}")

    unknown_reason = _unknown_reason(remote_ip, known_ips, network)
    if unknown_reason:
        reasons.append(unknown_reason)

    return {
        "timestamp": record["timestamp"],
        "direction": direction,
        "remote_ip": remote_ip,
        "remote_port": remote_port,
        "local_port": local_port,
        "protocol": record.get("protocol", "TCP"),
        "suspicious": bool(reasons),
        "reasons": reasons,
    }


def build_report(
    ip: str,
    *,
    known_ips: Iterable[str],
    local_network: str | None,
    limit: int = DEFAULT_LIMIT,
) -> dict[str, Any]:
    """Build the JSON payload consumed by the forensics modal."""

    network = _parse_network(local_network)
    known = set(known_ips)
    records = _connection_log.get_for_ip(ip, limit)
    connections = [
        analyze_connection(record, ip, known, network)
        for record in records
    ]
    suspicious_count = sum(1 for connection in connections if connection["suspicious"])

    if not connections:
        summary = "لا توجد اتصالات TCP مسجلة لهذا الجهاز حتى الآن."
    elif suspicious_count:
        summary = (
            f"تم فحص آخر {len(connections)} اتصالًا، "
            f"واكتُشف {suspicious_count} اتصالًا مشبوهًا."
        )
    else:
        summary = (
            f"تم فحص آخر {len(connections)} اتصالًا "
            "دون اكتشاف مؤشرات خطورة."
        )

    return {
        "ip": ip,
        "scanned_at": datetime.now(timezone.utc),
        "total_connections": len(connections),
        "suspicious_count": suspicious_count,
        "verdict": "suspicious" if suspicious_count else "clean",
        "connections": connections,
        "summary": summary,
    }


def count_suspicious(
    *,
    known_ips: Iterable[str],
    local_network: str | None,
) -> int:
    """Count suspicious recent connections for the compliance report."""

    network = _parse_network(local_network)
    known = set(known_ips)
    suspicious_count = 0

    for record in _connection_log.snapshot():
        if record["src_ip"] in known:
            device_ip = record["src_ip"]
        elif record["dst_ip"] in known:
            device_ip = record["dst_ip"]
        else:
            continue

        if analyze_connection(record, device_ip, known, network)["suspicious"]:
            suspicious_count += 1

    return suspicious_count


# One journal is shared by the sniffer and the FastAPI routes.
_connection_log = ConnectionLog()


def record_packet(packet: Any) -> None:
    """Packet-observer entry point used by the capture thread."""

    _connection_log.record_packet(packet)
