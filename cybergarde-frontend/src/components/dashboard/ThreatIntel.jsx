import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BellRing,
  Clock3,
  FlaskConical,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import AISummaryModal from './AISummaryModal.jsx';

const API_URL = 'http://127.0.0.1:8000/api/alerts';
const TEST_ALERT_URL = 'http://127.0.0.1:8000/api/alerts/test';
const CLEAR_ALERT_URL = 'http://127.0.0.1:8000/api/alerts/clear';
const AUDIT_VERIFY_URL = 'http://127.0.0.1:8000/api/audit/verify';
const POLL_INTERVAL_MS = 5_000;
const ALERT_FETCH_LIMIT = 100;
const SEVERITY_ORDER = ['high', 'medium', 'low'];
const THREAT_TYPES = new Set(['Port Scan', 'Honeypot Contact', 'PII Leak']);

const severityConfig = {
  high: {
    label: 'عالية',
    className: 'border-rose-400/20 bg-rose-400/[0.07] text-rose-300',
    icon: 'border-rose-300/15 bg-rose-400/[0.06] text-rose-300',
    line: 'bg-rose-400',
  },
  medium: {
    label: 'متوسطة',
    className: 'border-amber-400/20 bg-amber-400/[0.07] text-amber-300',
    icon: 'border-amber-300/15 bg-amber-400/[0.06] text-amber-300',
    line: 'bg-amber-400',
  },
  low: {
    label: 'منخفضة',
    className: 'border-sky-400/20 bg-sky-400/[0.07] text-sky-300',
    icon: 'border-sky-300/15 bg-sky-400/[0.06] text-sky-300',
    line: 'bg-sky-400',
  },
};

const severityBarColors = {
  high: 'from-rose-400 to-rose-300/50 shadow-[0_0_12px_rgba(251,113,133,0.25)]',
  medium: 'from-amber-400 to-amber-300/50 shadow-[0_0_12px_rgba(251,191,36,0.2)]',
  low: 'from-sky-400 to-sky-300/50 shadow-[0_0_12px_rgba(56,189,248,0.22)]',
};

const threatTitles = {
  'Port Scan': 'فحص منافذ (Port Scan)',
  'Honeypot Contact': 'اتصال بالخادم الوهمي',
  'New Device': 'جهاز جديد مكتشف',
  'PII Leak': 'اعتراض بيانات هوية عربية',
  'Test Alert': 'تنبيه تجريبي',
};

const timeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat('ar-EG-u-nu-latn', {
  numeric: 'auto',
});

function formatRelativeTime(date) {
  if (!date) return 'وقت غير معروف';

  // Clamp to the past so a small clock difference never says "in 3 seconds".
  const diffSeconds = Math.min(0, (date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(diffSeconds);

  if (absoluteSeconds < 60) {
    return relativeTimeFormatter.format(Math.round(diffSeconds), 'second');
  }
  if (absoluteSeconds < 3600) {
    return relativeTimeFormatter.format(Math.round(diffSeconds / 60), 'minute');
  }
  if (absoluteSeconds < 86_400) {
    return relativeTimeFormatter.format(Math.round(diffSeconds / 3600), 'hour');
  }
  return relativeTimeFormatter.format(Math.round(diffSeconds / 86_400), 'day');
}

function normalizeAlerts(payload) {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.alerts)
      ? payload.alerts
      : null;

  if (!items) {
    throw new Error('استجابة الخادم غير صالحة: يجب أن تكون قائمة تنبيهات.');
  }

  return items.map((alert, index) => {
    if (!alert || typeof alert !== 'object') {
      throw new Error('استجابة الخادم تحتوي على عنصر تنبيه غير صالح.');
    }

    const severity = SEVERITY_ORDER.includes(alert.severity)
      ? alert.severity
      : 'medium';
    const detectedAt =
      typeof alert.detected_at === 'string' ? new Date(alert.detected_at) : null;
    const portCount = Number.isFinite(alert.port_count) ? alert.port_count : null;
    const type =
      typeof alert.type === 'string' && alert.type.trim()
        ? alert.type.trim()
        : 'Port Scan';
    const title =
      typeof alert.title === 'string' && alert.title.trim()
        ? alert.title.trim()
        : threatTitles[type] ?? type;

    return {
      id: typeof alert.id === 'string' && alert.id ? alert.id : `alert-${index}`,
      type,
      title,
      sourceIp:
        typeof alert.source_ip === 'string' && alert.source_ip
          ? alert.source_ip
          : '—',
      targetIp:
        typeof alert.target_ip === 'string' && alert.target_ip
          ? alert.target_ip
          : null,
      severity,
      description:
        typeof alert.description === 'string' && alert.description
          ? alert.description
          : portCount
            ? `تم رصد نشاط على ${portCount} منفذًا من هذا المصدر.`
            : 'تم رصد نشاط شبكي مشبوه من هذا المصدر.',
      portCount,
      detectedAt:
        detectedAt && !Number.isNaN(detectedAt.getTime()) ? detectedAt : null,
      isThreat: THREAT_TYPES.has(type),
      acknowledged: Boolean(alert.acknowledged),
    };
  });
}

export default function ThreatIntel({ onThreatCountChange }) {
  const [alerts, setAlerts] = useState([]);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [monitoring, setMonitoring] = useState(null);
  const [captureError, setCaptureError] = useState(null);
  const [lastPacketAt, setLastPacketAt] = useState(null);
  const [honeypotIp, setHoneypotIp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [testing, setTesting] = useState(false);
  const [auditChecking, setAuditChecking] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const requestRef = useRef(null);
  const toastTimerRef = useRef(null);

  const loadAlerts = useCallback(async () => {
    requestRef.current?.abort();

    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const response = await fetch(`${API_URL}?limit=${ALERT_FETCH_LIMIT}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        let detail = null;

        try {
          const errorBody = await response.json();
          detail = typeof errorBody?.detail === 'string' ? errorBody.detail : null;
        } catch {
          detail = null;
        }

        throw new Error(detail ?? `فشل جلب التنبيهات من الخادم (${response.status}).`);
      }

      const payload = await response.json();
      const nextAlerts = normalizeAlerts(payload);
      const nextTotal = Number.isFinite(payload?.total)
        ? payload.total
        : nextAlerts.length;
      const nextThreatTotal = Number.isFinite(payload?.threat_total)
        ? payload.threat_total
        : nextAlerts.filter((alert) => alert.isThreat).length;
      const nextMonitoring =
        typeof payload?.monitoring === 'boolean' ? payload.monitoring : null;
      const nextCaptureError =
        typeof payload?.capture_error === 'string' ? payload.capture_error : null;
      const nextLastPacket =
        typeof payload?.last_packet_at === 'string' ? payload.last_packet_at : null;
      const nextHoneypotIp =
        typeof payload?.honeypot_ip === 'string' ? payload.honeypot_ip : null;

      if (controller.signal.aborted) return;

      setAlerts(nextAlerts);
      setTotalAlerts(nextTotal);
      setMonitoring(nextMonitoring);
      setCaptureError(nextCaptureError);
      setLastPacketAt(nextLastPacket);
      setHoneypotIp(nextHoneypotIp);
      setError(null);
      setLastUpdated(new Date());
      onThreatCountChange?.(nextThreatTotal);
    } catch (requestError) {
      if (requestError.name === 'AbortError' || controller.signal.aborted) return;

      const message =
        requestError instanceof TypeError
          ? 'تعذر الاتصال بخادم Cyber Garde. تأكد من تشغيل الخادم على http://127.0.0.1:8000.'
          : requestError.message || 'حدث خطأ غير متوقع أثناء جلب التنبيهات.';

      // Keep the last successful list visible; the error banner reports the
      // failed refresh without discarding useful data.
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [onThreatCountChange]);

  useEffect(() => {
    loadAlerts();

    const intervalId = window.setInterval(loadAlerts, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      requestRef.current?.abort();
    };
  }, [loadAlerts]);

  const showToast = useCallback((type, message) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToast({ type, message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 5_000);
  }, []);

  const createTestAlert = useCallback(async () => {
    setTesting(true);

    try {
      const response = await fetch(TEST_ALERT_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        let detail = null;

        try {
          const errorBody = await response.json();
          detail = typeof errorBody?.detail === 'string' ? errorBody.detail : null;
        } catch {
          detail = null;
        }

        throw new Error(detail ?? `فشل إنشاء تنبيه تجريبي (${response.status}).`);
      }

      await loadAlerts();
    } catch (requestError) {
      const message =
        requestError instanceof TypeError
          ? 'تعذر الاتصال بخادم Cyber Garde. تأكد من تشغيل الخادم على http://127.0.0.1:8000.'
          : requestError.message || 'حدث خطأ أثناء إنشاء التنبيه التجريبي.';

      setError(message);
    } finally {
      setTesting(false);
    }
  }, [loadAlerts]);

  const clearAllAlerts = useCallback(async () => {
    try {
      const response = await fetch(CLEAR_ALERT_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        let detail = null;

        try {
          const errorBody = await response.json();
          detail = typeof errorBody?.detail === 'string' ? errorBody.detail : null;
        } catch {
          detail = null;
        }

        throw new Error(detail ?? `فشل مسح التنبيهات (${response.status}).`);
      }

      await loadAlerts();
      setClearConfirm(false);
      showToast('success', 'تم مسح جميع التنبيهات.');
    } catch (requestError) {
      const message =
        requestError instanceof TypeError
          ? 'تعذر الاتصال بخادم Cyber Garde. تأكد من تشغيل الخادم على http://127.0.0.1:8000.'
          : requestError.message || 'حدث خطأ أثناء مسح التنبيهات.';

      setError(message);
      showToast('error', message);
    }
  }, [loadAlerts, showToast]);

  const verifyAudit = useCallback(async () => {
    setAuditChecking(true);

    try {
      const response = await fetch(AUDIT_VERIFY_URL, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        let detail = null;

        try {
          const errorBody = await response.json();
          detail = typeof errorBody?.detail === 'string' ? errorBody.detail : null;
        } catch {
          detail = null;
        }

        throw new Error(detail ?? `فشل التحقق من سلامة السجلات (${response.status}).`);
      }

      const payload = await response.json();
      const valid = Boolean(payload?.valid);
      const message =
        typeof payload?.message === 'string'
          ? payload.message
          : valid
            ? 'السجلات سليمة وآمنة 100%.'
            : 'تحذير: تم التلاعب بالسجلات!';

      showToast(valid ? 'success' : 'error', message);
    } catch (requestError) {
      const message =
        requestError instanceof TypeError
          ? 'تعذر الاتصال بخادم Cyber Garde. تأكد من تشغيل الخادم على http://127.0.0.1:8000.'
          : requestError.message || 'تعذر التحقق من سلامة السجلات.';

      showToast('error', message);
    } finally {
      setAuditChecking(false);
    }
  }, [showToast]);

  const closeAiSummary = useCallback(() => {
    setAiOpen(false);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  const visibleCount = alerts.length;
  const totalCount = totalAlerts;
  const lastPacketDate = lastPacketAt ? new Date(lastPacketAt) : null;
  const lastPacketLabel =
    lastPacketDate && !Number.isNaN(lastPacketDate.getTime())
      ? timeFormatter.format(lastPacketDate)
      : null;

  const severitySummary = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 };

    alerts.forEach((alert) => {
      counts[alert.severity] = (counts[alert.severity] ?? 0) + 1;
    });

    return SEVERITY_ORDER.map((severity) => {
      const count = counts[severity] ?? 0;

      return {
        severity,
        count,
        percentage:
          visibleCount === 0
            ? 0
            : Math.round((count / visibleCount) * 100),
      };
    });
  }, [alerts, visibleCount]);

  const highSeverityCount =
    severitySummary.find(({ severity }) => severity === 'high')?.count ?? 0;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <section id="alerts" className="cyber-card reveal xl:col-span-3" aria-label="أحدث التنبيهات الأمنية">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex items-start gap-3">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-rose-300/15 bg-rose-400/[0.055] text-rose-300">
              <BellRing className="h-[18px] w-[18px]" strokeWidth={1.8} />
              <span className="absolute inset-0 rounded-xl bg-rose-400/[0.08] blur-lg" />
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="section-title">أحدث التنبيهات</h2>
                <span
                  className="rounded-md border border-rose-400/20 bg-rose-400/[0.06] px-1.5 py-0.5 font-mono text-[8px] font-bold text-rose-300"
                  aria-live="polite"
                >
                  {loading && totalCount === 0 ? '…' : totalCount}
                </span>
              </div>
              <p className="mt-1 text-[10px] font-medium text-slate-500">
                تنبيهات محفوظة من محرك المراقبة والطُعم والاكتشاف التلقائي
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setClearConfirm(true)}
              disabled={loading || alerts.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-400/20 bg-rose-400/[0.06] px-2 py-1 text-[8px] font-bold text-rose-300 transition-colors hover:border-rose-300/40 hover:bg-rose-400/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="مسح جميع التنبيهات"
            >
              <Trash2 className="h-3 w-3" />
              مسح الجميع
            </button>
            <button
              type="button"
              onClick={createTestAlert}
              disabled={testing || loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-400/20 bg-rose-400/[0.06] px-2 py-1 text-[8px] font-bold text-rose-300 transition-colors hover:border-rose-300/40 hover:bg-rose-400/[0.12] disabled:cursor-wait disabled:opacity-60"
              aria-label="إنشاء تنبيه تجريبي"
            >
              {testing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FlaskConical className="h-3 w-3" />
              )}
              اختبار التنبيه
            </button>
            <button
              type="button"
              onClick={() => loadAlerts()}
              disabled={loading}
              className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-500 transition-colors hover:text-cyan-300 disabled:cursor-wait disabled:opacity-60"
              aria-label="تحديث التنبيهات"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </button>
          </div>
        </div>

        {monitoring === false && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2.5">
            <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
            <div>
              <p className="text-[9px] font-bold text-amber-200">محرك الالتقاط غير نشط</p>
              <p className="mt-0.5 text-[8px] font-medium leading-4 text-amber-200/70">
                {captureError
                  || 'شغّل الخادم بصلاحيات مسؤول وتأكد من تثبيت Npcap/libpcap.'}
              </p>
            </div>
          </div>
        )}

        {error && visibleCount > 0 && (
          <div className="mx-5 mt-4 flex flex-col gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] px-3 py-2.5 sm:flex-row sm:items-center">
            <span className="flex items-center gap-2 text-[9px] font-medium text-amber-200/80">
              <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              تعذر تحديث التنبيهات؛ تُعرض آخر بيانات معروفة.
            </span>
            <button
              type="button"
              onClick={() => loadAlerts()}
              className="shrink-0 rounded-md border border-amber-300/20 px-2 py-1 text-[8px] font-bold text-amber-200 transition-colors hover:bg-amber-400/10 sm:ms-auto"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        <div className="mt-4 divide-y divide-white/[0.045] border-t border-white/[0.05]">
          {loading && visibleCount === 0 && (
            <div className="px-5 py-12" role="status" aria-live="polite">
              <div className="flex flex-col items-center justify-center text-center">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.05] text-cyan-300">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </span>
                <p className="mt-4 text-xs font-bold text-slate-300">جارٍ تحميل التنبيهات...</p>
                <p className="mt-1.5 text-[10px] text-slate-600">
                  يتم الاتصال بخادم Cyber Garde وجلب سجل التنبيهات المحفوظ
                </p>
              </div>
            </div>
          )}

          {!loading && error && visibleCount === 0 && (
            <div className="px-5 py-10" role="alert">
              <div className="mx-auto flex max-w-md flex-col items-center justify-center text-center">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-300/15 bg-amber-400/[0.055] text-amber-300">
                  <WifiOff className="h-5 w-5" />
                </span>
                <p className="mt-4 text-xs font-bold text-slate-300">تعذر تحميل التنبيهات</p>
                <p className="mt-1.5 text-[10px] leading-5 text-slate-600">{error}</p>
                <button
                  type="button"
                  onClick={() => loadAlerts()}
                  className="btn-secondary mt-4 h-8"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  إعادة المحاولة
                </button>
              </div>
            </div>
          )}

          {!loading && !error && visibleCount === 0 && (
            <div className="px-5 py-10" role="status">
              <div className="flex flex-col items-center justify-center text-center">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.055] text-emerald-300">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <p className="mt-4 text-xs font-bold text-slate-300">لا توجد تنبيهات حتى الآن</p>
                <p className="mt-1.5 max-w-sm text-[10px] leading-5 text-slate-600">
                  يراقب Cyber Garde حركة الشبكة والطُعم. يمكنك استخدام زر «اختبار التنبيه» للتأكد من عمل السجل.
                </p>
              </div>
            </div>
          )}

          {alerts.map((alert) => {
            const severity = severityConfig[alert.severity] ?? severityConfig.medium;

            return (
              <div
                key={alert.id}
                className="group flex cursor-default items-start gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.018]"
              >
                <span className={`relative mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${severity.icon}`}>
                  <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.8} />
                  <span className={`absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ${severity.line} shadow-[0_0_7px_currentColor]`} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-bold text-slate-200">{alert.title}</p>
                    <span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold ${severity.className}`}>
                      {severity.label}
                    </span>
                    {alert.portCount !== null && (
                      <span className="rounded border border-white/[0.06] bg-white/[0.025] px-1.5 py-0.5 font-mono text-[8px] font-bold text-slate-500">
                        {alert.portCount} منفذًا
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[9px] font-medium text-slate-600">{alert.description}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[8px] font-medium text-slate-700">
                    <span className="font-mono" dir="ltr">{alert.sourceIp}</span>
                    {alert.targetIp && (
                      <>
                        <span className="text-slate-800">←</span>
                        <span className="font-mono text-rose-300/70" dir="ltr">{alert.targetIp}</span>
                      </>
                    )}
                    <span className="h-2 w-px bg-white/10" />
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-2.5 w-2.5" />
                      {formatRelativeTime(alert.detectedAt)}
                    </span>
                  </div>
                </div>

                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400/35 transition-all group-hover:bg-cyan-300 group-hover:shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5 border-t border-white/[0.05] bg-white/[0.012] px-5 py-3">
          <p className="flex flex-wrap items-center gap-1.5 text-[9px] font-medium text-slate-600">
            {error ? (
              <WifiOff className="h-3.5 w-3.5 text-amber-400/75" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/75" />
            )}
            {error
              ? 'تعذر تحديث بيانات التنبيهات'
              : loading
                ? 'جارٍ جلب التنبيهات من الخادم...'
                : lastUpdated
                  ? `آخر تحديث الساعة ${timeFormatter.format(lastUpdated)} · تحديث تلقائي كل 5 ثوانٍ`
                  : 'بانتظار بيانات الخادم'}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-[8px] font-medium text-slate-600">
            {monitoring === true ? (
              <ShieldCheck className="h-3 w-3 text-emerald-400/75" />
            ) : monitoring === false ? (
              <WifiOff className="h-3 w-3 text-amber-400/75" />
            ) : null}
            {monitoring === true
              ? 'محرك الالتقاط نشط'
              : monitoring === false
                ? 'محرك الالتقاط متوقف'
                : 'جارٍ التحقق من المحرك'}
            {lastPacketLabel && (
              <>
                <span className="text-slate-700">·</span>
                <span>آخر حزمة {lastPacketLabel}</span>
              </>
            )}
            {monitoring === true && !lastPacketLabel && (
              <>
                <span className="text-slate-700">·</span>
                <span>بانتظار أول حزمة</span>
              </>
            )}
            {honeypotIp && (
              <>
                <span className="text-slate-700">·</span>
                <span>
                  الطُعم:{' '}
                  <span className="font-mono" dir="ltr">{honeypotIp}</span>
                </span>
              </>
            )}
          </p>
          <button
            type="button"
            onClick={verifyAudit}
            disabled={auditChecking}
            className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-cyan-300/15 bg-cyan-400/[0.04] px-2.5 py-1.5 text-[8px] font-bold text-cyan-200 transition-colors hover:border-cyan-300/30 hover:bg-cyan-400/[0.09] disabled:cursor-wait disabled:opacity-60"
          >
            {auditChecking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ShieldCheck className="h-3 w-3" />
            )}
            التحقق من سلامة السجلات
          </button>
        </div>
      </section>

      <section className="cyber-card reveal xl:col-span-2" aria-label="ملخص التنبيهات المكتشفة">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex items-start gap-3">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-400/[0.055] text-cyan-300">
              <ShieldAlert className="h-[18px] w-[18px]" strokeWidth={1.8} />
              <span className="absolute inset-0 rounded-xl bg-cyan-400/[0.08] blur-lg" />
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="section-title">ملخص التنبيهات</h2>
                <span className="rounded-md border border-cyan-400/20 bg-cyan-400/[0.06] px-1.5 py-0.5 font-mono text-[8px] font-bold text-cyan-300">
                  {totalCount}
                </span>
              </div>
              <p className="mt-1 text-[10px] font-medium text-slate-500">
                تصنيف التنبيهات الأخيرة حسب الخطورة
              </p>
            </div>
          </div>
          <span className="rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-[8px] font-bold text-slate-500">
            مباشر
          </span>
        </div>

        <div className="space-y-4 px-5 pt-5">
          {severitySummary.map(({ severity, count, percentage }) => (
            <div key={severity}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-400">
                  {severityConfig[severity].label}
                </span>
                <span className="font-mono text-[9px] font-bold text-slate-500 tabular">
                  {count} <span className="text-slate-700">({percentage}%)</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.045]">
                <div
                  className={`h-full rounded-full bg-gradient-to-l ${severityBarColors[severity]} transition-all duration-700`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mx-5 mt-5 rounded-xl border border-cyan-300/10 bg-cyan-400/[0.03] p-3.5">
          <div className="flex items-start gap-2.5">
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${
                totalCount === 0
                  ? 'border-emerald-300/15 bg-emerald-400/[0.06] text-emerald-300'
                  : 'border-rose-300/15 bg-rose-400/[0.06] text-rose-300'
              }`}
            >
              {totalCount === 0 ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" />
              )}
            </span>
            <div>
              <p className="text-[10px] font-bold text-slate-300">
                {totalCount === 0
                  ? 'لا توجد تنبيهات نشطة'
                  : `${totalCount} تنبيهًا بحاجة إلى مراجعة`}
              </p>
              <p className="mt-1 text-[9px] leading-4 text-slate-600">
                {totalCount === 0
                  ? 'لم يرصد المحلل أي تنبيه حتى الآن.'
                  : highSeverityCount > 0
                    ? `${highSeverityCount} تنبيهًا عالي الخطورة يتطلب تدخلًا فوريًا.`
                    : 'لا توجد تنبيهات عالية الخطورة ضمن النتائج الحالية.'}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 pt-4">
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="btn-primary w-full"
          >
            <Sparkles className="h-3.5 w-3.5" />
            توليد تقرير ذكي
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/[0.05] px-5 py-3">
          <span className="text-[9px] font-medium text-slate-600">آخر تحديث</span>
          <span className="font-mono text-[10px] font-bold text-cyan-300/85 tabular" dir="ltr">
            {lastUpdated ? timeFormatter.format(lastUpdated) : '—'}
          </span>
        </div>
      </section>
      </div>

      <AISummaryModal open={aiOpen} onClose={closeAiSummary} />

      {clearConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setClearConfirm(false)} />
          <div className="relative bg-[#0f172a] border border-slate-700/50 rounded-xl px-5 py-4 shadow-2xl max-w-sm mx-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-4 w-4 rounded-full bg-rose-400 text-[#0b0c10] text-[9px] font-bold" />
              <h3 className="text-xs font-bold text-slate-100">تأكيد مسح جميع التنبيهات</h3>
            </div>
            <p className="text-[10px] text-slate-400 mb-4">
              سيتم حذف جميع التنبيهات المحفوظة نهائيًا. لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClearConfirm(false)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-600/50 bg-[#0f172a] px-3 py-1.5 text-[10px] font-bold text-slate-300 transition-colors hover:bg-slate-700/50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={clearAllAlerts}
                className="inline-flex items-center gap-1 rounded-md border border-rose-500/60 bg-rose-900/20 px-3 py-1.5 text-[10px] font-bold text-rose-300 transition-colors hover:bg-rose-900/40 hover:border-rose-400"
              >
                <Trash2 className="h-3 w-3" />
                تأكيد المسح
              </button>
            </div>
          </div>
        </div>
      )}

      {toast &&
        createPortal(
          <div
            className={`fixed bottom-5 left-1/2 z-[200] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-start gap-2.5 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md ${
              toast.type === 'success'
                ? 'border-emerald-400/25 bg-[#061b14] text-emerald-200'
                : 'border-rose-400/25 bg-[#1a0a0e] text-rose-200'
            }`}
            role="status"
            aria-live="polite"
          >
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${
                toast.type === 'success'
                  ? 'border-emerald-300/20 bg-emerald-400/[0.07] text-emerald-300'
                  : 'border-rose-300/20 bg-rose-400/[0.07] text-rose-300'
              }`}
            >
              {toast.type === 'success' ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
            </span>
            <p className="flex-1 text-[10px] font-bold leading-5">{toast.message}</p>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="shrink-0 rounded p-1 opacity-60 transition-opacity hover:opacity-100"
              aria-label="إغلاق الإشعار"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
