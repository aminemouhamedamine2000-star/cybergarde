"""Active deception / honeypot support for Cyber Garde.

Cyber Garde advertises a decoy asset called ``Server-HR-Confidential`` in the
device inventory. The decoy uses an unused address from the local subnet.

Any real device that probes that address is treated as compromised:

* an ARP request for the decoy address (broadcast on the local LAN), or
* a TCP SYN packet whose destination is the decoy address.

The module deliberately does not send ARP replies or open a real service. That
keeps the decoy safe for production networks while still producing a
high-confidence signal that a device is exploring an asset it should not know
about.
"""

from __future__ import annotations

import ipaddress
import logging
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Any

from scapy.all import ARP, ICMP, IP, TCP, conf

import alerts_store

logger = logging.getLogger("cybergarde.deception")

HONEYPOT_NAME = "Server-HR-Confidential"
HONEYPOT_MAC = "02:00:00:00:00:FA"
ALERT_COOLDOWN_SECONDS = 60.0
MAX_ALERTS = 100


class Honeypot:
    """Thread-safe fake asset and compromise registry."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._network: ipaddress.IPv4Network | None = None
        self._local_ips = self._discover_local_ips()
        self._fake_ip: str | None = None
        self._fake_mac = HONEYPOT_MAC
        self._compromised: dict[str, dict[str, Any]] = {}
        self._alerts: deque[dict[str, Any]] = deque(maxlen=MAX_ALERTS)
        self._last_alert_at: dict[str, float] = {}
        self._scan_active = False
        self._scan_grace_until = 0.0
        self._load_persisted_compromises()

    def _load_persisted_compromises(self) -> None:
        try:
            records = alerts_store.get_honeypot_compromised_sources()
        except Exception:
            logger.exception("Unable to load persisted compromised devices")
            return

        for ip, record in records.items():
            self._compromised[ip] = {
                "detected_at": record["detected_at"],
                "last_seen": record["last_seen"],
                "method": "persisted",
                "source_mac": record.get("source_mac"),
                "attempts": int(record.get("attempts", 1)),
            }

    @staticmethod
    def _discover_local_ips() -> set[str]:
        local_ips: set[str] = set()

        try:
            for interface in conf.ifaces.values():
                address = getattr(interface, "ip", None)
                if address and address != "0.0.0.0":
                    local_ips.add(str(address))
        except Exception:
            pass

        try:
            default_ip = conf.route.route("0.0.0.0")[1]
            if default_ip and default_ip != "0.0.0.0":
                local_ips.add(str(default_ip))
        except Exception:
            pass

        return local_ips

    def configure(self, network: str | None) -> None:
        """Point the decoy at the current local subnet."""

        if not network:
            return

        try:
            parsed = ipaddress.ip_network(network, strict=False)
        except (TypeError, ValueError):
            logger.warning("Invalid local network for honeypot: %s", network)
            return

        if not isinstance(parsed, ipaddress.IPv4Network):
            return

        # Remember the address that Scapy will use for this subnet so our own
        # ARP scan can never be mistaken for an attacker.
        try:
            route_ip = conf.route.route(str(parsed.network_address))[1]
            if route_ip and route_ip != "0.0.0.0":
                self._local_ips.add(str(route_ip))
        except Exception:
            pass

        with self._lock:
            if self._network == parsed and self._fake_ip:
                return

            self._network = parsed
            self._fake_ip = self._choose_ip_locked(set())

        if self._fake_ip:
            logger.info(
                "Honeypot decoy %s is available at %s",
                HONEYPOT_NAME,
                self._fake_ip,
            )

    def _choose_ip_locked(self, occupied: set[str]) -> str | None:
        network = self._network
        if network is None:
            return None

        first = int(network.network_address) + 1
        last = int(network.broadcast_address) - 1

        if last < first:
            return None

        # Walk down from the top of the subnet and stop after 254 attempts so
        # very large corporate ranges stay cheap to evaluate.
        for candidate_int in range(last, max(first - 1, last - 254), -1):
            candidate = str(ipaddress.IPv4Address(candidate_int))

            if candidate in self._local_ips:
                continue
            if candidate in occupied:
                continue

            return candidate

        return None

    def ensure_device(self, occupied_ips: set[str] | None = None) -> dict[str, Any] | None:
        """Return the decoy device, reassigning its IP if it is now in use."""

        occupied = {ip for ip in (occupied_ips or set()) if ip}

        with self._lock:
            if self._network is None:
                return None

            if self._fake_ip is None or self._fake_ip in occupied:
                self._fake_ip = self._choose_ip_locked(occupied)

            if self._fake_ip is None:
                return None

            return self._fake_device_locked()

    def _fake_device_locked(self) -> dict[str, Any]:
        return {
            "ip": self._fake_ip,
            "mac": self._fake_mac,
            "name": HONEYPOT_NAME,
            "status": "online",
            "is_honeypot": True,
            "compromised": False,
            "compromised_at": None,
        }

    def record_packet(self, packet: Any) -> None:
        """Packet-observer entry point for ARP, ICMP and TCP probes."""

        try:
            with self._lock:
                fake_ip = self._fake_ip
                ignore_self = (
                    self._scan_active
                    or time.monotonic() < self._scan_grace_until
                )

            if not fake_ip:
                return

            if packet.haslayer(ARP):
                arp_layer = packet[ARP]

                # ARP request (who-has) for the decoy address.
                if int(arp_layer.op) != 1:
                    return

                if arp_layer.pdst == fake_ip:
                    if self._ignore_source(arp_layer.psrc, ignore_self):
                        return

                    self._mark_compromised(
                        source_ip=arp_layer.psrc,
                        source_mac=arp_layer.hwsrc,
                        method="ARP probe",
                    )
                return

            if packet.haslayer(IP) and packet.haslayer(ICMP):
                ip_layer = packet[IP]
                icmp_layer = packet[ICMP]

                if ip_layer.dst != fake_ip:
                    return

                # ICMP echo request (type 8) is a ping.
                if int(icmp_layer.type) != 8:
                    return

                if self._ignore_source(ip_layer.src, ignore_self):
                    return

                self._mark_compromised(
                    source_ip=ip_layer.src,
                    source_mac=None,
                    method="ICMP echo",
                )
                return

            if packet.haslayer(IP) and packet.haslayer(TCP):
                ip_layer = packet[IP]
                tcp_layer = packet[TCP]

                if ip_layer.dst != fake_ip:
                    return

                flags = tcp_layer.flags
                if "S" not in flags or "A" in flags:
                    return

                if self._ignore_source(ip_layer.src, ignore_self):
                    return

                self._mark_compromised(
                    source_ip=ip_layer.src,
                    source_mac=None,
                    method="TCP SYN",
                    target_port=tcp_layer.dport,
                )
        except (AttributeError, IndexError, TypeError, ValueError):
            return

    def _ignore_source(self, source_ip: str, ignore_self: bool) -> bool:
        # The ARP scanner runs from this host every few seconds. Suppress its
        # own probes, but allow a manual same-host ping outside that window so
        # the Test/Honeypot flow can be verified locally.
        return bool(ignore_self and source_ip in self._local_ips)

    def begin_scan(self) -> None:
        with self._lock:
            self._scan_active = True

    def end_scan(self) -> None:
        with self._lock:
            self._scan_active = False
            self._scan_grace_until = time.monotonic() + 0.75

    def _mark_compromised(
        self,
        *,
        source_ip: str,
        source_mac: str | None,
        method: str,
        target_port: int | None = None,
    ) -> None:
        if not source_ip:
            return

        try:
            address = ipaddress.ip_address(source_ip)
        except ValueError:
            return

        if address.is_unspecified or address.is_multicast:
            return

        now = time.monotonic()
        wall_now = datetime.now(timezone.utc)
        alert_to_persist: dict[str, Any] | None = None

        with self._lock:
            fake_ip = self._fake_ip
            if not fake_ip:
                return

            record = self._compromised.get(source_ip)
            if record is None:
                record = {
                    "detected_at": wall_now,
                    "last_seen": wall_now,
                    "method": method,
                    "source_mac": source_mac,
                    "attempts": 0,
                }
                self._compromised[source_ip] = record

            record["last_seen"] = wall_now
            record["method"] = method
            if source_mac:
                record["source_mac"] = source_mac
            record["attempts"] += 1

            last_alert = self._last_alert_at.get(source_ip)
            if (
                last_alert is not None
                and now - last_alert < ALERT_COOLDOWN_SECONDS
            ):
                return

            self._last_alert_at[source_ip] = now
            method_labels = {
                "ARP probe": "طلب ARP",
                "TCP SYN": "حزمة TCP SYN",
                "ICMP echo": "طلب ICMP (Ping)",
            }
            method_label = method_labels.get(method, method)

            alert_to_persist = {
                "id": f"HNY-{uuid.uuid4().hex[:8].upper()}",
                "type": "Honeypot Contact",
                "source_ip": source_ip,
                "target_ip": fake_ip,
                "target_port": target_port,
                "severity": "high",
                "detected_at": wall_now,
                "port_count": None,
                "window_seconds": None,
                "description": (
                    f"محاولة اتصال بالخادم الوهمي {fake_ip} من "
                    f"{source_ip} عبر {method_label}. "
                    "تم تصنيف الجهاز كمخترق."
                ),
            }
            self._alerts.append(alert_to_persist)

        if alert_to_persist:
            try:
                alerts_store.record_alert(
                    alert_type="Honeypot Contact",
                    title="اتصال بالخادم الوهمي",
                    severity="high",
                    source_ip=source_ip,
                    target_ip=alert_to_persist["target_ip"],
                    source_mac=source_mac,
                    target_port=target_port,
                    description=alert_to_persist["description"],
                    created_at=wall_now,
                )
            except Exception:
                logger.exception("Unable to persist the honeypot alert")

        logger.warning(
            "Honeypot contact from %s via %s (target port %s)",
            source_ip,
            method,
            target_port,
        )

    # ------------------------------------------------------------------
    # Read API
    # ------------------------------------------------------------------
    def get_fake_ip(self) -> str | None:
        with self._lock:
            return self._fake_ip

    def is_compromised(self, ip: str) -> bool:
        with self._lock:
            return ip in self._compromised

    def compromised_at(self, ip: str) -> datetime | None:
        with self._lock:
            record = self._compromised.get(ip)
            return record["detected_at"] if record else None

    def get_compromised_records(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            return {
                ip: dict(record)
                for ip, record in self._compromised.items()
            }

    def get_alerts(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(alert) for alert in reversed(self._alerts)]

    def get_summary(self) -> dict[str, Any]:
        with self._lock:
            return {
                "fake_ip": self._fake_ip,
                "name": HONEYPOT_NAME,
                "compromised_count": len(self._compromised),
                "contacts_count": len(self._alerts),
                "compromised_ips": sorted(self._compromised),
            }


# One decoy backs the FastAPI application.
_honeypot = Honeypot()


def configure(network: str | None) -> None:
    """Configure the decoy for the local subnet."""

    _honeypot.configure(network)


def record_packet(packet: Any) -> None:
    """Packet-observer entry point used by the capture thread."""

    _honeypot.record_packet(packet)


def begin_scan() -> None:
    """Suppress honeypot self-probes while the ARP scan is running."""

    _honeypot.begin_scan()


def end_scan() -> None:
    """Re-enable manual same-host honeypot probes after an ARP scan."""

    _honeypot.end_scan()


def ensure_device(occupied_ips: set[str] | None = None) -> dict[str, Any] | None:
    """Return the current fake device (and reassign it if needed)."""

    return _honeypot.ensure_device(occupied_ips)


def get_fake_ip() -> str | None:
    return _honeypot.get_fake_ip()


def is_compromised(ip: str) -> bool:
    return _honeypot.is_compromised(ip)


def compromised_at(ip: str) -> datetime | None:
    return _honeypot.compromised_at(ip)


def get_compromised_records() -> dict[str, dict[str, Any]]:
    return _honeypot.get_compromised_records()


def get_alerts() -> list[dict[str, Any]]:
    return _honeypot.get_alerts()


def get_summary() -> dict[str, Any]:
    return _honeypot.get_summary()
