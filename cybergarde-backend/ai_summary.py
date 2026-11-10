"""Arabic threat-summary generation for Cyber Garde.

The summary is generated locally from the most recent persisted alerts. This
keeps the feature deterministic and deployable without an external LLM or API
key; the response model can later be swapped to an LLM-backed provider without
changing the frontend contract.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Any

TYPE_LABELS = {
    "Port Scan": "فحص منافذ",
    "Honeypot Contact": "محاولة وصول إلى الخادم الوهمي",
    "New Device": "اكتشاف جهاز جديد",
    "PII Leak": "اعتراض بيانات هوية عربية",
    "Test Alert": "تنبيه تجريبي",
}


def _recommendations(type_counts: Counter[str]) -> list[str]:
    recommendations: list[str] = []

    if type_counts.get("PII Leak"):
        recommendations.append(
            "أوقف نقل البيانات الشخصية عبر القنوات غير المشفرة، "
            "وفعّل التشفير وسياسات منع تسرب البيانات (DLP)."
        )

    if type_counts.get("Honeypot Contact"):
        recommendations.append(
            "اعزل مصدر الاتصال بالخادم الوهمي وافحص الجهاز "
            "بحثًا عن برمجيات خبيثة أو بيانات اعتماد مسروقة."
        )

    if type_counts.get("Port Scan"):
        recommendations.append(
            "راجع قواعد الجدار الناري وأغلق المنافذ غير المستخدمة، "
            "وحدّث قواعد كشف التسلل."
        )

    if type_counts.get("New Device"):
        recommendations.append(
            "تحقق من هوية الأجهزة الجديدة وصلاحيتها قبل منحها "
            "وصولًا إلى الموارد الحساسة."
        )

    if type_counts.get("Test Alert"):
        recommendations.append(
            "التنبيهات التجريبية لا تمثل تهديدًا فعليًا؛ استخدمها "
            "للتحقق من مسار التنبيهات فقط."
        )

    recommendations.append(
        "راجع سجل التدقيق دوريًا وتأكد من نجاح التحقق من سلامة السلسلة."
    )

    return list(dict.fromkeys(recommendations))


def generate_summary(alerts: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a professional Arabic summary from up to five alerts."""

    generated_at = datetime.now(timezone.utc)

    if not alerts:
        return {
            "generated_at": generated_at,
            "risk_level": "low",
            "headline": "لا توجد تهديدات حديثة — الوضع مستقر",
            "summary": (
                "لم يسجل Cyber Garde أي تنبيهات حديثة. لا توجد حاليًا "
                "مؤشرات نشاط هجومي أو تسرب بيانات، ويُنصح بالاستمرار "
                "في المراقبة الدورية والتحقق من سلامة سجلات التدقيق."
            ),
            "threats": [],
            "recommendations": [
                "استمر في المراقبة الدورية للشبكة والأجهزة الجديدة.",
                "أجرِ مراجعة دورية لسجل التدقيق وتأكد من سلامة السلسلة.",
                "حافظ على تحديث قواعد كشف التسلل والجدار الناري.",
            ],
            "alerts_analyzed": 0,
            "model": "Cyber Garde Arabic Analyst v1",
        }

    type_counts = Counter(
        alert.get("type", "Unknown") for alert in alerts
    )
    severity_counts = Counter(
        alert.get("severity", "medium") for alert in alerts
    )
    high_count = severity_counts.get("high", 0)

    if high_count >= 2:
        risk_level = "critical"
        headline = "خطر مرتفع: عدة تهديدات عالية الخطورة تتطلب تدخلًا فوريًا"
    elif high_count == 1:
        risk_level = "high"
        headline = "تهديد عالي الخطورة يحتاج إلى مراجعة عاجلة"
    elif severity_counts.get("medium", 0):
        risk_level = "medium"
        headline = "نشاط أمني متوسط يحتاج إلى متابعة"
    else:
        risk_level = "low"
        headline = "الوضع مستقر مع تنبيهات منخفضة الخطورة"

    type_text = "، ".join(
        f"{TYPE_LABELS.get(alert_type, alert_type)} ({count})"
        for alert_type, count in type_counts.most_common()
    )
    latest = alerts[0]
    latest_title = latest.get("title", "تنبيه غير مسمى")
    latest_source = latest.get("source_ip") or "مصدر غير محدد"

    summary = (
        f"حلّل محرك Cyber Garde آخر {len(alerts)} تنبيهات مسجلة. "
        f"توزيع الأنشطة: {type_text}. "
        f"أعلى مستوى خطورة مرصود: {severity_counts.get('high', 0)} عالي، "
        f"{severity_counts.get('medium', 0)} متوسط، "
        f"{severity_counts.get('low', 0)} منخفض. "
        f"آخر تنبيه كان «{latest_title}» من {latest_source}."
    )

    threats = []
    for alert in alerts:
        label = TYPE_LABELS.get(alert.get("type"), alert.get("type", "تنبيه"))
        source = alert.get("source_ip") or "مصدر غير معروف"
        threats.append(f"{label}: {alert.get('title', 'تنبيه')} — المصدر {source}")

    return {
        "generated_at": generated_at,
        "risk_level": risk_level,
        "headline": headline,
        "summary": summary,
        "threats": threats,
        "recommendations": _recommendations(type_counts),
        "alerts_analyzed": len(alerts),
        "model": "Cyber Garde Arabic Analyst v1",
    }
