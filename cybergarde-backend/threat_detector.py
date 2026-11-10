"""Passive port-scan detection for Cyber Garde.

The detector uses Scapy to inspect TCP SYN packets on the local network. For
each source address it keeps only the destination ports seen inside a short
sliding window, so packet payloads are never stored.

A source is reported as a port scan when it sends SYN packets to more than
``PORT_SCAN_PORT_THRESHOLD`` distinct ports within
``PORT_SCAN_WINDOW_SECONDS`` seconds. Capturing packets normally requires
Administrator/root privileges and a working packet capture driver (Npcap on
Windows or libpcap on Linux/macOS). Capture failures are logged and recorded
instead of taking the API down.

The public helpers are safe to call from FastAPI:
``start_detection()``, ``stop_detection()``, ``get_detected_threats()`` and
``get_detection_status()``.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Any, Callable

from scapy.all import IP, TCP, sniff

import alerts_store

logger = logging.getLogger("cybergarde.threat_detector")

# A scan is more than 20 distinct destination ports inside five seconds.
PORT_SCAN_PORT_THRESHOLD = 20
PORT_SCAN_WINDOW_SECONDS = 5.0

# Avoid flooding the UI while a scan is still running.
ALERT_COOLDOWN_SECONDS = 30.0

# Keep only recent results so the endpoint cannot grow without bound.
THREAT_RETENTION_SECONDS = 3600.0
MAX_THREATS = 200

# Bounds memory usage if the network is extremely busy or under attack.
MAX_TRACKED_SOURCES = 10_000

# A scan that reaches this many ports is considered high severity.
HIGH_SEVERITY_PORT_COUNT = 50

Clock = Callable[[], float]


class PortScanDetector:
    """Thread-safe, stateful detector for TCP SYN port scans."""

    def __init__(
        self,
        *,
        port_threshold: int = PORT_SCAN_PORT_THRESHOLD,
        window_seconds: float = PORT_SCAN_WINDOW_SECONDS,
        cooldown_seconds: float = ALERT_COOLDOWN_SECONDS,
        retention_seconds: float = THREAT_RETENTION_SECONDS,
        max_threats: int = MAX_THREATS,
        max_tracked_sources: int = MAX_TRACKED_SOURCES,
        clock: Clock = time.monotonic,
    ) -> None:
        if port_threshold < 1:
            raise ValueError("port_threshold must be positive")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be positive")
        if cooldown_seconds < 0:
            raise ValueError("cooldown_seconds cannot be negative")
        if retention_seconds <= 0:
            raise ValueError("retention_seconds must be positive")
        if max_threats < 1:
            raise ValueError("max_threats must be positive")
        if max_tracked_sources < 1:
            raise ValueError("max_tracked_sources must be positive")

        self.port_threshold = port_threshold
        self.window_seconds = window_seconds
        self.cooldown_seconds = cooldown_seconds
        self.retention_seconds = retention_seconds
        self.max_threats = max_threats
        self.max_tracked_sources = max_tracked_sources
        self._clock = clock

        self._lock = threading.Lock()
        # source IP -> deque of (monotonic timestamp, destination port)
        self._syn_events: dict[str, deque[tuple[float, int]]] = {}
        self._last_alert_at: dict[str, float] = {}
        self._threats: deque[tuple[float, dict[str, Any]]] = deque(maxlen=max_threats)
        self._last_cleanup = clock()

        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._capture_error: str | None = None
        self._packet_observers: list[Callable[[Any], None]] = []
        self._last_packet_at: datetime | None = None
        self._packet_count = 0

    # ------------------------------------------------------------------
    # Packet processing
    # ------------------------------------------------------------------
    def process_packet(self, packet: Any) -> dict[str, Any] | None:
        """Inspect one packet and return a threat when a scan is detected.

        Only bare TCP SYN packets count, so normal handshakes (SYN-ACK) do not
        inflate the per-source port count. The method is thread-safe because
        Scapy calls it from the capture thread while FastAPI reads the results.
        """

        try:
            if not packet.haslayer(IP) or not packet.haslayer(TCP):
                return None

            tcp_layer = packet[TCP]
            flags = tcp_layer.flags

            # "S" without "A" is a connection attempt (SYN). SYN-ACK replies
            # are part of normal traffic and must not count as probes.
            if "S" not in flags or "A" in flags:
                return None

            source_ip = packet[IP].src
            destination_port = tcp_layer.dport
        except (AttributeError, IndexError, TypeError):
            return None

        if not source_ip or not isinstance(destination_port, int):
            return None
        if not 0 < destination_port < 65536:
            return None

        now = self._clock()

        with self._lock:
            self._cleanup_locked(now)
            events = self._events_for_source_locked(source_ip, now)
            events.append((now, destination_port))

            cutoff = now - self.window_seconds
            while events and events[0][0] < cutoff:
                events.popleft()

            distinct_ports = {port for _, port in events}
            if len(distinct_ports) <= self.port_threshold:
                return None

            last_alert = self._last_alert_at.get(source_ip)
            if (
                last_alert is not None
                and now - last_alert < self.cooldown_seconds
            ):
                return None

            self._last_alert_at[source_ip] = now
            threat = self._build_threat(source_ip, distinct_ports)
            self._threats.append((now, threat))
            logger.warning(
                "Port scan detected from %s: %d ports within %.1fs",
                source_ip,
                len(distinct_ports),
                self.window_seconds,
            )

        try:
            alerts_store.record_alert(
                alert_type="Port Scan",
                title="فحص منافذ مشبوه",
                severity=threat["severity"],
                source_ip=threat["source_ip"],
                description=threat["description"],
                port_count=threat["port_count"],
                window_seconds=threat["window_seconds"],
                created_at=threat["detected_at"],
            )
        except Exception:
            logger.exception("Unable to persist the port-scan alert")

        return threat

    def add_packet_observer(self, observer: Callable[[Any], None]) -> bool:
        """Register a packet consumer that feeds forensics/honeypot logic.

        Observers run in the capture thread before port-scan analysis. They
        must be fast and thread-safe; exceptions are isolated so one observer
        cannot stop packet capture.
        """

        with self._lock:
            if observer in self._packet_observers:
                return False
            self._packet_observers.append(observer)
            return True

    def _handle_packet(self, packet: Any) -> None:
        with self._lock:
            observers = tuple(self._packet_observers)
            self._packet_count += 1
            self._last_packet_at = datetime.now(timezone.utc)

        for observer in observers:
            try:
                observer(packet)
            except Exception:
                logger.exception("Packet observer failed; continuing capture")

        self.process_packet(packet)

    # ------------------------------------------------------------------
    # Detection internals (callers hold self._lock)
    # ------------------------------------------------------------------
    def _events_for_source_locked(
        self,
        source_ip: str,
        now: float,
    ) -> deque[tuple[float, int]]:
        events = self._syn_events.get(source_ip)
        if events is None:
            if len(self._syn_events) >= self.max_tracked_sources:
                self._evict_oldest_source_locked()
            events = deque()
            self._syn_events[source_ip] = events
        elif events and events[-1][0] < now - self.window_seconds:
            # The source has been quiet for longer than the window; its old
            # ports are irrelevant to the current sliding window.
            events.clear()
        return events

    def _evict_oldest_source_locked(self) -> None:
        if not self._syn_events:
            return

        oldest_ip = min(
            self._syn_events,
            key=lambda ip: self._syn_events[ip][-1][0]
            if self._syn_events[ip]
            else float("-inf"),
        )
        del self._syn_events[oldest_ip]
        self._last_alert_at.pop(oldest_ip, None)

    def _cleanup_locked(self, now: float) -> None:
        """Drop stale sources, alert cooldowns and expired threats."""

        if now - self._last_cleanup < self.window_seconds:
            return

        self._last_cleanup = now
        event_cutoff = now - self.window_seconds
        stale_sources: list[str] = []

        for source_ip, events in self._syn_events.items():
            while events and events[0][0] < event_cutoff:
                events.popleft()
            if not events:
                stale_sources.append(source_ip)

        for source_ip in stale_sources:
            del self._syn_events[source_ip]

        alert_cutoff = now - self.cooldown_seconds
        for source_ip in [
            ip for ip, last_alert in self._last_alert_at.items()
            if last_alert < alert_cutoff
        ]:
            del self._last_alert_at[source_ip]

        self._prune_threats_locked(now)

    def _prune_threats_locked(self, now: float) -> None:
        cutoff = now - self.retention_seconds
        while self._threats and self._threats[0][0] < cutoff:
            self._threats.popleft()

    def _build_threat(
        self,
        source_ip: str,
        distinct_ports: set[int],
    ) -> dict[str, Any]:
        port_count = len(distinct_ports)
        severity = (
            "high" if port_count >= HIGH_SEVERITY_PORT_COUNT else "medium"
        )
        window_label = f"{self.window_seconds:g}"

        return {
            "id": f"THR-{uuid.uuid4().hex[:8].upper()}",
            "type": "Port Scan",
            "source_ip": source_ip,
            "severity": severity,
            "port_count": port_count,
            "window_seconds": self.window_seconds,
            "detected_at": datetime.now(timezone.utc),
            "description": (
                f"رصد {port_count} منفذًا مختلفًا عبر حزم SYN من "
                f"{source_ip} خلال {window_label} ثوانٍ."
            ),
        }

    # ------------------------------------------------------------------
    # Capture thread lifecycle
    # ------------------------------------------------------------------
    def start(self) -> bool:
        """Start the Scapy capture thread once. Returns True if started."""

        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return False

            self._stop_event.clear()
            self._capture_error = None
            thread = threading.Thread(
                target=self._capture_loop,
                name="cybergarde-port-scan-detector",
                daemon=True,
            )
            self._thread = thread

        thread.start()
        return True

    def stop(self, timeout: float = 2.5) -> None:
        """Ask the capture thread to stop and wait briefly for it."""

        self._stop_event.set()

        with self._lock:
            thread = self._thread

        if thread is not None and thread.is_alive():
            thread.join(timeout=timeout)

        with self._lock:
            if self._thread is thread:
                self._thread = None

    def is_running(self) -> bool:
        with self._lock:
            return bool(self._thread is not None and self._thread.is_alive())

    def get_status(self) -> dict[str, Any]:
        """Return capture state for diagnostics and future status endpoints."""

        with self._lock:
            return {
                "running": bool(
                    self._thread is not None and self._thread.is_alive()
                ),
                "error": self._capture_error,
                "threat_count": len(self._threats),
                "last_packet_at": self._last_packet_at,
                "packets_seen": self._packet_count,
            }

    def _capture_loop(self) -> None:
        logger.info("Starting TCP/UDP/ARP/ICMP capture for threat detection")

        try:
            # A short timeout lets shutdown happen even on a quiet network;
            # the outer loop immediately resumes capture. The filter includes
            # ARP so forensics and the honeypot can observe local probes.
            while not self._stop_event.is_set():
                sniff(
                    prn=self._handle_packet,
                    store=False,
                    filter="tcp or udp or arp or icmp",
                    timeout=1.0,
                )
        except PermissionError as exc:
            self._record_capture_error(
                "Permission denied while opening the packet capture device",
                exc,
            )
        except OSError as exc:
            self._record_capture_error(
                "Packet capture device or driver is unavailable",
                exc,
            )
        except Exception as exc:  # Scapy/driver errors vary by platform.
            self._record_capture_error(
                "Unexpected packet capture failure",
                exc,
            )
        finally:
            logger.info("Stopped TCP/UDP/ARP/ICMP capture for threat detection")

    def _record_capture_error(self, message: str, exc: BaseException) -> None:
        detail = f"{message}: {exc}" if str(exc) else message

        with self._lock:
            self._capture_error = detail

        logger.error("%s", detail, exc_info=True)

    # ------------------------------------------------------------------
    # Read API
    # ------------------------------------------------------------------
    def get_threats(self) -> list[dict[str, Any]]:
        """Return detected threats, newest first."""

        with self._lock:
            self._prune_threats_locked(self._clock())
            return [
                dict(threat)
                for _detected_at, threat in reversed(self._threats)
            ]


# One detector instance backs the FastAPI application.
_detector = PortScanDetector()


def detect_port_scan(packet: Any) -> dict[str, Any] | None:
    """Feed one Scapy packet to the detector and return a new threat, if any."""

    return _detector.process_packet(packet)


def add_packet_observer(observer: Callable[[Any], None]) -> bool:
    """Register a packet consumer for forensics and honeypot features."""

    return _detector.add_packet_observer(observer)


def start_detection() -> bool:
    """Begin passive port-scan capture (non-blocking)."""

    return _detector.start()


def stop_detection() -> None:
    """Stop passive capture and release the capture thread."""

    _detector.stop()


def get_detected_threats() -> list[dict[str, Any]]:
    """Return the currently retained threat records."""

    return _detector.get_threats()


def get_detection_status() -> dict[str, Any]:
    """Return capture diagnostics for health checks."""

    return _detector.get_status()
