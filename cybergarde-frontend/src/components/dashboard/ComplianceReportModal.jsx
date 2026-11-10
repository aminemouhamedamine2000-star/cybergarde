import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
  X,
} from 'lucide-react';
import CyberGardeMark from '../CyberGardeMark.jsx';

const API_URL = 'http://127.0.0.1:8000/api/reports/compliance';

const dateTimeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const networkStatusConfig = {
  secure: {
    label: 'آمن',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-500',
  },
  warning: {
    label: 'يحتاج مراجعة',
    badge: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: 'bg-amber-100 text-amber-700',
    bar: 'bg-amber-500',
  },
  critical: {
    label: 'حرج',
    badge: 'border-rose-200 bg-rose-50 text-rose-900',
    icon: 'bg-rose-100 text-rose-700',
    bar: 'bg-rose-500',
  },
  unknown: {
    label: 'غير محدد',
    badge: 'border-slate-200 bg-slate-50 text-slate-800',
    icon: 'bg-slate-200 text-slate-600',
    bar: 'bg-slate-400',
  },
};

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

function StatusIcon({ status }) {
  if (status === 'secure') return <ShieldCheck className="h-5 w-5" />;
  if (status === 'critical') return <ShieldAlert className="h-5 w-5" />;
  if (status === 'warning') return <AlertTriangle className="h-5 w-5" />;
  return <WifiOff className="h-5 w-5" />;
}

export default function ComplianceReportModal({ open, onClose }) {
  const [state, setState] = useState({
    loading: false,
    error: null,
    report: null,
  });
  const requestRef = useRef(null);
  const dialogRef = useRef(null);

  const loadReport = useCallback(async () => {
    requestRef.current?.abort();

    const controller = new AbortController();
    requestRef.current = controller;

    setState({
      loading: true,
      error: null,
      report: null,
    });

    try {
      const response = await fetch(API_URL, {
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

        throw new Error(detail ?? `فشل إنشاء تقرير الامتثال (${response.status}).`);
      }

      const payload = await response.json();

      if (!payload || typeof payload !== 'object') {
        throw new Error('استجابة تقرير الامتثال غير صالحة.');
      }

      if (controller.signal.aborted) return;

      setState({
        loading: false,
        error: null,
        report: payload,
      });
    } catch (requestError) {
      if (requestError.name === 'AbortError' || controller.signal.aborted) return;

      const message =
        requestError instanceof TypeError
          ? 'تعذر الاتصال بخادم Cyber Garde. تأكد من تشغيل الخادم على http://127.0.0.1:8000.'
          : requestError.message || 'حدث خطأ أثناء إنشاء التقرير.';

      setState({
        loading: false,
        error: message,
        report: null,
      });
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    loadReport();

    return () => {
      requestRef.current?.abort();
    };
  }, [open, loadReport]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.body.style.overflow = 'hidden';
    document.body.classList.add('compliance-modal-open');
    window.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove('compliance-modal-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const report = state.report;
  const statusKey = report?.network_status ?? 'unknown';
  const status = networkStatusConfig[statusKey] ?? networkStatusConfig.unknown;
  const unknownStatus = statusKey === 'unknown';

  const statCards = report
    ? [
        {
          label: 'أجهزة آمنة',
          value: report.devices_safe ?? 0,
          icon: ShieldCheck,
          iconClass: 'bg-emerald-100 text-emerald-700',
          valueClass: 'text-emerald-700',
        },
        {
          label: 'أجهزة مخترقة',
          value: report.devices_compromised ?? 0,
          icon: ShieldAlert,
          iconClass: 'bg-rose-100 text-rose-700',
          valueClass: 'text-rose-700',
        },
        {
          label: 'تهديدات تم اعتراضها',
          value: report.threats_blocked ?? 0,
          icon: Activity,
          iconClass: 'bg-amber-100 text-amber-700',
          valueClass: 'text-amber-700',
        },
        {
          label: 'اتصالات مشبوهة',
          value: report.suspicious_connections ?? 0,
          icon: WifiOff,
          iconClass: 'bg-sky-100 text-sky-700',
          valueClass: 'text-sky-700',
        },
      ]
    : [];

  const inventory = Array.isArray(report?.device_inventory)
    ? report.device_inventory
    : [];
  const recommendations = Array.isArray(report?.recommendations)
    ? report.recommendations
    : [];
  const compromisedIps = Array.isArray(report?.compromised_ips)
    ? report.compromised_ips
    : [];

  return createPortal(
    <div className="compliance-modal-root">
      <div
        className="compliance-overlay fixed inset-0 z-[150] overflow-y-auto bg-[#02060b]/85 p-3 backdrop-blur-md sm:p-6"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose?.();
        }}
        role="presentation"
      >
        <div className="compliance-dialog mx-auto w-full max-w-4xl">
          <div className="compliance-no-print mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-300/15 bg-cyan-400/[0.05] text-cyan-300">
                <FileText className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-bold">معاينة تقرير الامتثال</p>
                <p className="text-[8px] font-medium text-slate-500">
                  جاهز للطباعة أو الحفظ بصيغة PDF
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                disabled={!report || state.loading}
                className="btn-primary h-9 px-3 text-[10px] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-3.5 w-3.5" />
                طباعة / حفظ PDF
              </button>
              <button
                type="button"
                onClick={() => onClose?.()}
                className="icon-button h-9 w-9"
                aria-label="إغلاق تقرير الامتثال"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="compliance-report-title"
            tabIndex={-1}
            className="focus:outline-none"
          >
            {state.loading && !report && (
              <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-2xl" role="status">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </span>
                <p className="mt-4 text-sm font-extrabold text-slate-800">جارٍ إنشاء تقرير الامتثال...</p>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  يتم تجميع بيانات الأجهزة والتهديدات والاتصالات المشبوهة
                </p>
              </div>
            )}

            {!state.loading && state.error && !report && (
              <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-2xl" role="alert">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <p className="mt-4 text-sm font-extrabold text-slate-800">تعذر إنشاء التقرير</p>
                <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{state.error}</p>
                <button type="button" onClick={loadReport} className="btn-secondary mt-4 h-8">
                  <RefreshCw className="h-3.5 w-3.5" />
                  إعادة المحاولة
                </button>
              </div>
            )}

            {report && (
              <article
                className="compliance-print-area overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl"
                dir="rtl"
              >
                <header className="border-b border-slate-200 px-6 py-6 sm:px-8">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-950 p-2">
                        <CyberGardeMark className="h-8 w-8" />
                      </span>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-700">
                          Cyber Garde
                        </p>
                        <h2 id="compliance-report-title" className="mt-1 text-xl font-extrabold text-slate-950">
                          تقرير الامتثال الأمني
                        </h2>
                        <p className="mt-1 text-[11px] font-medium text-slate-500">
                          تقييم حالة الشبكة والأجهزة والتهديدات والاتصالات
                        </p>
                      </div>
                    </div>

                    <div className="text-[10px] font-medium text-slate-500 sm:text-left">
                      <p>
                        رقم التقرير:{' '}
                        <span className="font-mono font-bold text-slate-800" dir="ltr">
                          {report.report_id}
                        </span>
                      </p>
                      <p className="mt-1">تاريخ الإصدار: {formatDate(report.generated_at)}</p>
                      <p className="mt-1">
                        نطاق المراقبة:{' '}
                        <span className="font-mono text-slate-700" dir="ltr">
                          {report.local_network}
                        </span>
                      </p>
                    </div>
                  </div>
                </header>

                <div className="px-6 pt-6 sm:px-8">
                  <div className={`rounded-xl border p-4 ${status.badge}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${status.icon}`}>
                          <StatusIcon status={statusKey} />
                        </span>
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-70">
                            حالة الشبكة العامة
                          </p>
                          <p className="mt-0.5 text-lg font-extrabold">{status.label}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-8">
                        <div>
                          <p className="text-[9px] font-bold opacity-60">درجة الامتثال</p>
                          <p className="font-mono text-2xl font-extrabold tabular" dir="ltr">
                            {unknownStatus ? '—' : `${report.compliance_score}%`}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold opacity-60">مؤشر المخاطر</p>
                          <p className="font-mono text-2xl font-extrabold tabular" dir="ltr">
                            {unknownStatus ? '—' : `${report.risk_score}/100`}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
                      <div
                        className={`h-full rounded-full ${status.bar} transition-all duration-700`}
                        style={{ width: `${unknownStatus ? 0 : Math.max(0, Math.min(100, report.compliance_score ?? 0))}%` }}
                      />
                    </div>
                  </div>
                </div>

                <section className="grid grid-cols-2 gap-3 px-6 pt-5 sm:grid-cols-4 sm:px-8">
                  {statCards.map((card) => {
                    const Icon = card.icon;

                    return (
                      <div
                        key={card.label}
                        className="compliance-print-avoid-break rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                      >
                        <span className={`grid h-8 w-8 place-items-center rounded-lg ${card.iconClass}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <p className="mt-3 text-[9px] font-bold text-slate-500">{card.label}</p>
                        <p className={`mt-1 font-mono text-xl font-extrabold tabular ${card.valueClass}`} dir="ltr">
                          {card.value}
                        </p>
                      </div>
                    );
                  })}
                </section>

                <section className="mt-5 grid gap-4 px-6 sm:grid-cols-2 sm:px-8">
                  <div className="compliance-print-avoid-break rounded-xl border border-slate-200 p-4">
                    <h3 className="text-[11px] font-extrabold text-slate-800">ملخص البنية</h3>
                    <dl className="mt-3 space-y-2 text-[10px]">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-slate-500">إجمالي الأجهزة الحقيقية</dt>
                        <dd className="font-mono font-bold text-slate-800" dir="ltr">{report.devices_total}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-slate-500">التهديدات عالية الخطورة</dt>
                        <dd className="font-mono font-bold text-rose-700" dir="ltr">{report.high_severity_threats}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-slate-500">اتصالات الخادم الوهمي</dt>
                        <dd className="font-mono font-bold text-slate-800" dir="ltr">{report.honeypot_contacts}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-slate-500">عنوان الخادم الوهمي</dt>
                        <dd className="font-mono font-bold text-slate-800" dir="ltr">{report.honeypot_ip ?? '—'}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="compliance-print-avoid-break rounded-xl border border-slate-200 p-4">
                    <h3 className="text-[11px] font-extrabold text-slate-800">أبرز المخاطر</h3>
                    {compromisedIps.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {compromisedIps.map((ip) => (
                          <span
                            key={ip}
                            className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-rose-700"
                            dir="ltr"
                          >
                            {ip}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-[10px] font-medium leading-5 text-slate-500">
                        لا توجد أجهزة مصنفة كمخترقة في آخر دورة مراقبة.
                      </p>
                    )}
                    <p className="mt-3 border-t border-slate-100 pt-3 text-[9px] leading-4 text-slate-500">
                      يعتمد التصنيف على محاولات الاتصال بالخادم الوهمي، والمنافذ الخطرة،
                      والعناوين غير الموجودة في جرد الأجهزة.
                    </p>
                  </div>
                </section>

                <section className="mt-5 px-6 sm:px-8">
                  <h3 className="text-[11px] font-extrabold text-slate-800">التوصيات</h3>
                  <ul className="mt-3 space-y-2">
                    {recommendations.map((recommendation, index) => (
                      <li key={`${recommendation}-${index}`} className="flex items-start gap-2 text-[10px] leading-5 text-slate-600">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                        <span>{recommendation}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="mt-5 px-6 sm:px-8">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[11px] font-extrabold text-slate-800">جرد الأجهزة</h3>
                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[9px] font-bold text-slate-500">
                      {inventory.length} جهازًا
                    </span>
                  </div>

                  {inventory.length === 0 ? (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 text-center text-[10px] text-slate-500">
                      لم يتم تحميل جرد الأجهزة بعد. أعد فتح التقرير بعد اكتمال فحص الشبكة.
                    </div>
                  ) : (
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                      <table className="w-full border-collapse text-right text-[9px]">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-3 py-2 font-bold">الجهاز</th>
                            <th className="px-3 py-2 font-bold">عنوان IP</th>
                            <th className="px-3 py-2 font-bold">عنوان MAC</th>
                            <th className="px-3 py-2 font-bold">الحالة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {inventory.map((device, index) => {
                            const compromised = Boolean(device.compromised) || device.status === 'compromised';

                            return (
                              <tr key={`${device.ip}-${device.mac}-${index}`} className="compliance-print-avoid-break">
                                <td className="px-3 py-2 font-medium text-slate-700">
                                  {device.name || `جهاز ${index + 1}`}
                                </td>
                                <td className="px-3 py-2 font-mono text-slate-700" dir="ltr">{device.ip}</td>
                                <td className="px-3 py-2 font-mono text-slate-500" dir="ltr">{device.mac}</td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`inline-flex rounded border px-1.5 py-0.5 text-[8px] font-bold ${
                                      compromised
                                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    }`}
                                  >
                                    {compromised ? 'مخترق' : 'آمن'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <footer className="mt-6 flex flex-col gap-2 border-t border-slate-200 px-6 py-4 text-[9px] font-medium text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                  <p>تم إنشاء هذا التقرير تلقائيًا بواسطة Cyber Garde — للاستخدام الداخلي.</p>
                  <p className="flex items-center gap-1.5">
                    <Server className="h-3 w-3" />
                    <span className="font-mono" dir="ltr">{report.report_id}</span>
                  </p>
                </footer>
              </article>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
