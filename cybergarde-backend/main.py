"""Cyber Garde network monitoring API.

Devices are discovered with ARP requests on the local layer-2 network, while
threats are detected passively by inspecting TCP SYN packets. Both operations
normally require Administrator/root privileges and a working packet capture
driver (Npcap on Windows or libpcap on Linux/macOS).

The same capture stream also feeds the one-click forensics journal and the
active-deception honeypot.
"""

import ipaddress
import logging
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from scapy.all import ARP, Ether, conf, srp

import deception
import forensics
import threat_detector
import alerts_store
import ai_summary
import pii_scanner

logger = logging.getLogger("cybergarde")

DEFAULT_NETWORK = "192.168.1.0/24"
ARP_SCAN_TIMEOUT = 3

# Testing configuration:
# "*" includes both http://localhost:5173 and http://127.0.0.1:5173.
# Restrict this to the explicit frontend origins before production deployment.
ALLOWED_ORIGINS = ["*"]

# Last successful real-device scan. The compliance report and forensics
# analysis use this inventory without triggering another ARP scan.
_device_inventory: dict[str, dict[str, str]] = {}
_device_inventory_lock = threading.Lock()
_scan_lock = threading.Lock()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Run packet capture and configure the decoy while the API is serving."""

    local_network = detect_local_network()

    try:
        pii_scanner.install_log_redaction()
    except Exception:
        logger.exception("Unable to install Arabic PII log redaction")

    try:
        deception.configure(local_network)
    except Exception:
        logger.exception("Unable to configure the deception honeypot")

    # Observers must be registered before the capture thread starts.
    threat_detector.add_packet_observer(forensics.record_packet)
    threat_detector.add_packet_observer(deception.record_packet)
    threat_detector.add_packet_observer(pii_scanner.record_packet)

    try:
        threat_detector.start_detection()
    except Exception:
        # Detection is an enhancement; the device endpoint must still work.
        logger.exception("Unable to start the threat detector")

    try:
        yield
    finally:
        threat_detector.stop_detection()


app = FastAPI(
    title="Cyber Garde API",
    description="واجهة برمجة تطبيقات فحص الأجهزة والتهديدات والامتثال",
    version="1.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # A wildcard origin cannot be combined with credentialed CORS requests.
    # The frontend fetches devices without cookies, so credentials stay off.
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class Device(BaseModel):
    ip: str
    mac: str
    name: str | None = None
    status: str = "online"
    is_honeypot: bool = False
    compromised: bool = False
    compromised_at: datetime | None = None


class Threat(BaseModel):
    id: str
    type: str
    source_ip: str
    severity: str
    detected_at: datetime
    description: str
    port_count: int | None = None
    window_seconds: float | None = None
    target_ip: str | None = None
    target_port: int | None = None


class Alert(BaseModel):
    id: str
    type: str
    title: str
    severity: str
    source_ip: str | None = None
    target_ip: str | None = None
    source_mac: str | None = None
    description: str
    port_count: int | None = None
    target_port: int | None = None
    window_seconds: float | None = None
    detected_at: datetime
    acknowledged: bool = False


class AlertFeed(BaseModel):
    alerts: list[Alert]
    total: int
    unacknowledged: int
    threat_total: int
    monitoring: bool
    capture_error: str | None = None
    last_packet_at: datetime | None = None
    packets_seen: int
    honeypot_ip: str | None = None


class AuditVerification(BaseModel):
    valid: bool
    message: str
    records: int
    alerts_checked: int
    verified_at: datetime
    broken_at: int | None = None
    issues: list[str]


class AISummary(BaseModel):
    generated_at: datetime
    risk_level: str
    headline: str
    summary: str
    threats: list[str]
    recommendations: list[str]
    alerts_analyzed: int
    model: str


class ForensicsConnection(BaseModel):
    timestamp: datetime
    direction: str
    remote_ip: str
    remote_port: int
    local_port: int
    protocol: str
    suspicious: bool
    reasons: list[str]


class ForensicsReport(BaseModel):
    ip: str
    scanned_at: datetime
    total_connections: int
    suspicious_count: int
    verdict: str
    connections: list[ForensicsConnection]
    summary: str


class ComplianceReport(BaseModel):
    report_id: str
    generated_at: datetime
    network_status: str
    risk_score: int
    compliance_score: int
    devices_total: int
    devices_safe: int
    devices_compromised: int
    threats_blocked: int
    high_severity_threats: int
    suspicious_connections: int
    honeypot_contacts: int
    honeypot_ip: str | None = None
    local_network: str
    compromised_ips: list[str]
    recommendations: list[str]
    device_inventory: list[Device]


def detect_local_network() -> str:
    """Return the local IPv4 subnet, falling back to DEFAULT_NETWORK.

    Scapy's routing table identifies the interface and source address used for
    outbound traffic. The local address is converted to its /24 subnet, which
    is the usual size of a local ARP broadcast domain.
    """

    try:
        route_info = conf.route.route("0.0.0.0")
        local_ip = route_info[1]

        address = ipaddress.ip_address(local_ip)
        if (
            not isinstance(address, ipaddress.IPv4Address)
            or address.is_loopback
            or address.is_unspecified
            or address.is_multicast
        ):
            return DEFAULT_NETWORK

        return str(ipaddress.ip_network(f"{local_ip}/24", strict=False))
    except Exception:
        # Route discovery can vary across operating systems and drivers.
        # Falling back keeps network discovery available in every environment.
        return DEFAULT_NETWORK


def detect_local_ip() -> str | None:
    """Return the host's primary IPv4 address, if it can be discovered."""

    try:
        local_ip = conf.route.route("0.0.0.0")[1]
        address = ipaddress.ip_address(local_ip)

        if (
            isinstance(address, ipaddress.IPv4Address)
            and not address.is_loopback
            and not address.is_unspecified
        ):
            return str(address)
    except Exception:
        return None

    return None


def scan_network() -> list[dict[str, str]]:
    """Perform an ARP scan of the local network.

    Returns a de-duplicated list of active devices, each containing an IPv4
    address and its corresponding MAC address.
    """

    network_range = detect_local_network()
    arp_request = ARP(pdst=network_range)
    broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
    probe = broadcast / arp_request

    deception.begin_scan()
    try:
        answered, _unanswered = srp(
            probe,
            timeout=ARP_SCAN_TIMEOUT,
            inter=0.01,
            verbose=False,
        )
    finally:
        deception.end_scan()

    discovered: dict[str, str] = {}

    for _sent, received in answered:
        ip = getattr(received, "psrc", None)
        mac = getattr(received, "hwsrc", None)

        if ip and mac:
            discovered.setdefault(ip, mac.upper())

    devices = [
        {"ip": ip, "mac": mac}
        for ip, mac in discovered.items()
    ]

    devices.sort(key=lambda device: int(ipaddress.ip_address(device["ip"])))
    return devices


def _inventory_snapshot(*, refresh_if_empty: bool = False) -> list[dict[str, str]]:
    with _device_inventory_lock:
        snapshot = [dict(device) for device in _device_inventory.values()]

    if snapshot or not refresh_if_empty:
        return snapshot

    try:
        with _scan_lock:
            scanned = scan_network()
    except Exception:
        logger.exception("Unable to refresh the device inventory")
        return []

    with _device_inventory_lock:
        _device_inventory.clear()
        _device_inventory.update(
            {device["ip"]: dict(device) for device in scanned}
        )
        snapshot = [dict(device) for device in _device_inventory.values()]

    try:
        alerts_store.process_device_scan(scanned)
    except Exception:
        logger.exception("Unable to process newly discovered devices")

    return snapshot


def _build_device_payload(scanned: list[dict[str, str]]) -> list[dict[str, Any]]:
    with _device_inventory_lock:
        _device_inventory.clear()
        _device_inventory.update(
            {device["ip"]: dict(device) for device in scanned}
        )
        occupied = set(_device_inventory)

    try:
        alerts_store.process_device_scan(scanned)
    except Exception:
        logger.exception("Unable to process newly discovered devices")

    fake_device = deception.ensure_device(occupied)
    payload: list[dict[str, Any]] = []

    for device in scanned:
        compromised_at = deception.compromised_at(device["ip"])
        payload.append(
            {
                "ip": device["ip"],
                "mac": device["mac"],
                "name": None,
                "status": "compromised" if compromised_at else "online",
                "is_honeypot": False,
                "compromised": compromised_at is not None,
                "compromised_at": compromised_at,
            }
        )

    if fake_device:
        payload.append(fake_device)

    payload.sort(key=lambda device: int(ipaddress.ip_address(device["ip"])))
    return payload


def _report_device(
    device: dict[str, str],
    compromised_records: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    record = compromised_records.get(device["ip"])

    return {
        "ip": device["ip"],
        "mac": device["mac"],
        "name": None,
        "status": "compromised" if record else "online",
        "is_honeypot": False,
        "compromised": record is not None,
        "compromised_at": record["detected_at"] if record else None,
    }


def _build_recommendations(
    *,
    total_devices: int,
    compromised_devices: int,
    high_severity_threats: int,
    suspicious_connections: int,
    honeypot_contacts: int,
    pii_alerts: int = 0,
) -> list[str]:
    recommendations: list[str] = []

    if total_devices == 0:
        recommendations.append(
            "تعذر تحميل جرد الأجهزة؛ أعد تشغيل فحص الشبكة قبل اعتماد التقرير."
        )

    if compromised_devices:
        recommendations.append(
            "اعزل الأجهزة المصنفة كمخترقة وأعد تصويرها قبل إعادتها إلى الشبكة."
        )

    if high_severity_threats:
        recommendations.append(
            "راجع التنبيهات عالية الخطورة وأغلق المنافذ والخدمات غير الضرورية."
        )

    if suspicious_connections:
        recommendations.append(
            "افتح التحقيق الجنائي للأجهزة ذات الاتصالات المشبوهة وحدد مصدرها."
        )

    if honeypot_contacts:
        recommendations.append(
            "حلّل مصدر الاتصالات بالخادم الوهمي وحدّث قواعد الحجب والمراقبة."
        )

    if pii_alerts:
        recommendations.append(
            "راجع قنوات نقل البيانات الشخصية وفعّل التشفير "
            "وسياسات منع تسرب البيانات (DLP)."
        )

    if not recommendations:
        recommendations.append(
            "لا توجد مؤشرات حرجة حاليًا؛ استمر في المراقبة الدورية للأجهزة."
        )

    recommendations.append(
        "احتفظ بنسخة مشفرة من هذا التقرير وسجلات الأحداث لأغراض الامتثال."
    )
    return recommendations


@app.get(
    "/api/devices",
    response_model=list[Device],
    summary="قائمة الأجهزة النشطة على الشبكة",
)
def get_devices() -> list[dict[str, Any]]:
    """Scan the local network and return real devices plus the decoy asset."""

    try:
        with _scan_lock:
            scanned = scan_network()
    except PermissionError as exc:
        logger.exception("ARP scan permission denied")
        raise HTTPException(
            status_code=403,
            detail=(
                "صلاحيات غير كافية لتنفيذ فحص ARP. "
                "شغّل الخادم بصلاحيات مدير النظام."
            ),
        ) from exc
    except OSError as exc:
        logger.exception("ARP scan failed because of a network/driver error")
        raise HTTPException(
            status_code=503,
            detail="تعذر الوصول إلى واجهة الشبكة أو برنامج التقاط الحزم.",
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected error during ARP scan")
        raise HTTPException(
            status_code=500,
            detail="حدث خطأ غير متوقع أثناء فحص الشبكة.",
        ) from exc

    try:
        return _build_device_payload(scanned)
    except Exception as exc:
        logger.exception("Unable to build the device payload")
        raise HTTPException(
            status_code=500,
            detail="تعذر تجهيز بيانات الأجهزة والطُعم.",
        ) from exc


@app.get(
    "/api/devices/{ip}/forensics",
    response_model=ForensicsReport,
    summary="تحقيق جنائي سريع في اتصالات جهاز",
)
def get_device_forensics(ip: str) -> dict[str, Any]:
    """Analyse the last 50 recorded connections for one device."""

    try:
        address = ipaddress.ip_address(ip)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="عنوان IP غير صالح.",
        ) from exc

    if not isinstance(address, ipaddress.IPv4Address):
        raise HTTPException(
            status_code=400,
            detail="التحقيق الجنائي يدعم عناوين IPv4 فقط.",
        )

    known_ips = {device["ip"] for device in _inventory_snapshot()}
    local_ip = detect_local_ip()
    fake_ip = deception.get_fake_ip()

    if local_ip:
        known_ips.add(local_ip)
    if fake_ip:
        known_ips.add(fake_ip)

    try:
        return forensics.build_report(
            ip,
            known_ips=known_ips,
            local_network=detect_local_network(),
            limit=50,
        )
    except Exception as exc:
        logger.exception("Forensics analysis failed for %s", ip)
        raise HTTPException(
            status_code=500,
            detail="تعذر إكمال التحقيق الجنائي لهذا الجهاز.",
        ) from exc


@app.get(
    "/api/alerts",
    response_model=AlertFeed,
    summary="سجل التنبيهات المحفوظة",
)
def get_alerts(limit: int = 100) -> dict[str, Any]:
    """Return persisted alerts plus live monitoring status."""

    try:
        alerts, total, unacknowledged = alerts_store.list_alerts(limit)
        status = threat_detector.get_detection_status()

        return {
            "alerts": alerts,
            "total": total,
            "unacknowledged": unacknowledged,
            "threat_total": alerts_store.get_threat_total(),
            "monitoring": bool(status.get("running")),
            "capture_error": status.get("error"),
            "last_packet_at": status.get("last_packet_at"),
            "packets_seen": int(status.get("packets_seen", 0)),
            "honeypot_ip": deception.get_fake_ip(),
        }
    except Exception as exc:
        logger.exception("Unable to read the alert feed")
        raise HTTPException(
            status_code=500,
            detail="تعذر قراءة سجل التنبيهات.",
        ) from exc


@app.post(
    "/api/alerts/test",
    response_model=Alert,
    status_code=201,
    summary="إنشاء تنبيه تجريبي",
)
def create_test_alert() -> dict[str, Any]:
    """Create a persisted test alert from the dashboard button."""

    try:
        return alerts_store.record_alert(
            alert_type="Test Alert",
            title="تنبيه تجريبي",
            severity="medium",
            source_ip=detect_local_ip() or "127.0.0.1",
            description=(
                "تم إنشاء هذا التنبيه من زر الاختبار "
                "للتأكد من عمل سجل التنبيهات."
            ),
        )
    except Exception as exc:
        logger.exception("Unable to create a test alert")
        raise HTTPException(
            status_code=500,
            detail="تعذر إنشاء التنبيه التجريبي.",
        ) from exc


@app.post(
    "/api/alerts/clear",
    summary="مسح جميع التنبيهات",
)
def clear_all_alerts() -> dict[str, Any]:
    """Delete all alerts from the database and reset the audit chain."""
    try:
        deleted = alerts_store.clear_all_alerts()
        return {
            "deleted": deleted,
            "message": "تم حذف جميع التنبيهات بنجاح.",
        }
    except Exception as exc:
        logger.exception("Unable to clear alerts")
        raise HTTPException(
            status_code=500,
            detail="تعذر مسح التنبيهات.",
        ) from exc


@app.get(
    "/api/audit/verify",
    response_model=AuditVerification,
    summary="التحقق من سلامة سجل التدقيق",
)
def verify_audit() -> dict[str, Any]:
    """Verify the SHA-256 chain and alert-to-audit coverage."""

    try:
        return alerts_store.verify_audit()
    except Exception as exc:
        logger.exception("Unable to verify the audit chain")
        raise HTTPException(
            status_code=500,
            detail="تعذر التحقق من سلامة السجلات.",
        ) from exc


@app.post(
    "/api/reports/ai-summary",
    response_model=AISummary,
    summary="توليد ملخص تهديدات ذكي",
)
def generate_ai_summary() -> dict[str, Any]:
    """Generate an Arabic summary from the five newest alerts."""

    try:
        alerts, _total, _unacknowledged = alerts_store.list_alerts(5)
        return ai_summary.generate_summary(alerts)
    except Exception as exc:
        logger.exception("Unable to generate the AI threat summary")
        raise HTTPException(
            status_code=500,
            detail="تعذر توليد التقرير الذكي.",
        ) from exc


@app.get(
    "/api/threats",
    response_model=list[Threat],
    summary="قائمة التهديدات المكتشفة",
)
def get_threats() -> list[dict[str, Any]]:
    """Return port-scan findings and honeypot contacts, newest first."""

    combined = threat_detector.get_detected_threats() + deception.get_alerts()
    combined.sort(key=lambda threat: threat["detected_at"], reverse=True)
    return combined


@app.get(
    "/api/reports/compliance",
    response_model=ComplianceReport,
    summary="تقرير الامتثال الأمني",
)
def get_compliance_report() -> dict[str, Any]:
    """Aggregate the live device, threat and deception posture."""

    inventory = _inventory_snapshot(refresh_if_empty=True)
    compromised_records = deception.get_compromised_records()
    inventory_ips = {device["ip"] for device in inventory}

    compromised_known = sum(
        1 for ip in inventory_ips if ip in compromised_records
    )
    compromised_total = len(compromised_records)
    devices_total = len(inventory)
    devices_safe = max(0, devices_total - compromised_known)

    alert_stats = alerts_store.get_alert_stats()
    by_type = alert_stats["by_type"]
    by_severity = alert_stats["by_severity"]
    honeypot_contacts = int(by_type.get("Honeypot Contact", 0))
    port_scan_alerts = int(by_type.get("Port Scan", 0))
    pii_alerts = int(by_type.get("PII Leak", 0))
    threats_blocked = honeypot_contacts + port_scan_alerts + pii_alerts
    high_severity_threats = int(by_severity.get("high", 0))

    local_network = detect_local_network()
    fake_ip = deception.get_fake_ip()
    local_ip = detect_local_ip()

    known_ips = set(inventory_ips)
    if local_ip:
        known_ips.add(local_ip)
    if fake_ip:
        known_ips.add(fake_ip)

    suspicious_connections = forensics.count_suspicious(
        known_ips=known_ips,
        local_network=local_network,
    )

    if compromised_total or high_severity_threats:
        network_status = "critical"
    elif devices_total == 0:
        network_status = "unknown"
    elif threats_blocked or suspicious_connections:
        network_status = "warning"
    else:
        network_status = "secure"

    risk_score = 0
    if devices_total or compromised_total or threats_blocked:
        risk_score = min(
            100,
            compromised_total * 35
            + high_severity_threats * 15
            + min(threats_blocked, 10) * 4
            + min(suspicious_connections, 20) * 2,
        )

    compliance_score = 0 if devices_total == 0 else max(0, 100 - risk_score)

    return {
        "report_id": f"CMP-{uuid.uuid4().hex[:8].upper()}",
        "generated_at": datetime.now(timezone.utc),
        "network_status": network_status,
        "risk_score": risk_score,
        "compliance_score": compliance_score,
        "devices_total": devices_total,
        "devices_safe": devices_safe,
        "devices_compromised": compromised_known,
        "threats_blocked": threats_blocked,
        "high_severity_threats": high_severity_threats,
        "suspicious_connections": suspicious_connections,
        "honeypot_contacts": honeypot_contacts,
        "honeypot_ip": fake_ip,
        "local_network": local_network,
        "compromised_ips": sorted(compromised_records),
        "recommendations": _build_recommendations(
            total_devices=devices_total,
            compromised_devices=compromised_total,
            high_severity_threats=high_severity_threats,
            suspicious_connections=suspicious_connections,
            honeypot_contacts=honeypot_contacts,
            pii_alerts=pii_alerts,
        ),
        "device_inventory": [
            _report_device(device, compromised_records)
            for device in inventory
        ],
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
