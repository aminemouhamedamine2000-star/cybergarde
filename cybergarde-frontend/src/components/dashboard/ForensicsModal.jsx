import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Clock3,
  Loader2,
  Microscope,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';

const timeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatTimestamp(value) {
  if (!value) return '—';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : timeFormatter.format(date);
}

export default function ForensicsModal({
  open,
  device,
  report,
  loading,
  error,
  onClose,
  onRetry,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const totalConnections = report?.total_connections ?? 0;
  const suspiciousCount = report?.suspicious_count ?? 0;
  const clean = Boolean(report) && suspiciousCount === 0;
  const suspiciousLabel =
    suspiciousCount === 1
      ? 'اتصال واحد مشبوه'
      : `${suspiciousCount} اتصالات مشبوهة`;

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto bg-[#02060b]/85 p-4 backdrop-blur-md sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forensics-title"
        tabIndex={-1}
        className="relative my-4 w-full max-w-3xl overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#06111b] shadow-[0_28px_80px_-30px_rgba(0,0,0,0.95)] focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-400/[0.06] text-cyan-300">
              <Microscope className="h-[18px] w-[18px]" strokeWidth={1.8} />
              <span className="absolute inset-0 rounded-xl bg-cyan-400/10 blur-lg" />
            </span>
            <div>
              <p className="eyebrow text-cyan-300/60">One-Click Forensics</p>
              <h2 id="forensics-title" className="section-title">
                التحقيق الجنائي للجهاز
              </h2>
              <p className="mt-1 text-[10px] font-medium text-slate-500">
                {device?.name ?? 'جهاز غير معروف'}
                <span className="mx-1.5 text-slate-700">·</span>
                <span className="font-mono" dir="ltr">
                  {device?.ip ?? report?.ip ?? '—'}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onClose?.()}
            className="icon-button h-8 w-8 rounded-lg"
            aria-label="إغلاق نافذة التحقيق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[68vh] overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center px-5 py-16 text-center" role="status">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.05] text-cyan-300">
                <Loader2 className="h-5 w-5 animate-spin" />
              </span>
              <p className="mt-4 text-xs font-bold text-slate-200">جارٍ فحص اتصالات الجهاز...</p>
              <p className="mt-1.5 text-[10px] text-slate-500">
                يتم تحليل آخر 50 اتصالًا مسجلًا والتحقق من المنافذ الخطرة والعناوين المجهولة
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="px-5 py-12" role="alert">
              <div className="mx-auto flex max-w-md flex-col items-center justify-center text-center">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-rose-300/15 bg-rose-400/[0.06] text-rose-300">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <p className="mt-4 text-xs font-bold text-slate-200">تعذر إكمال التحقيق</p>
                <p className="mt-1.5 text-[10px] leading-5 text-slate-500">{error}</p>
                <button type="button" onClick={() => onRetry?.()} className="btn-secondary mt-4 h-8">
                  <RefreshCw className="h-3.5 w-3.5" />
                  إعادة المحاولة
                </button>
              </div>
            </div>
          )}

          {!loading && !error && report && (
            <>
              <div
                className={`mx-5 mt-5 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start ${
                  clean
                    ? 'border-emerald-400/15 bg-emerald-400/[0.045]'
                    : 'border-rose-400/20 bg-rose-400/[0.055]'
                }`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${
                    clean
                      ? 'border-emerald-300/15 bg-emerald-400/[0.07] text-emerald-300'
                      : 'border-rose-300/15 bg-rose-400/[0.07] text-rose-300'
                  }`}
                >
                  {clean ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p className={`text-xs font-bold ${clean ? 'text-emerald-200' : 'text-rose-200'}`}>
                    {clean
                      ? 'تم فحص الجهاز. لم يتم اكتشاف اتصالات مشبوهة.'
                      : `تم فحص الجهاز. تم اكتشاف ${suspiciousLabel}.`}
                  </p>
                  <p className="mt-1 text-[10px] leading-5 text-slate-400">{report.summary}</p>
                </div>
              </div>

              <div className="mx-5 mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-white/[0.055] bg-white/[0.02] px-3 py-2.5">
                  <p className="text-[8px] font-bold text-slate-600">الاتصالات المفحوصة</p>
                  <p className="mt-1 font-mono text-lg font-extrabold text-slate-200 tabular" dir="ltr">
                    {totalConnections}
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.055] bg-white/[0.02] px-3 py-2.5">
                  <p className="text-[8px] font-bold text-slate-600">اتصالات مشبوهة</p>
                  <p
                    className={`mt-1 font-mono text-lg font-extrabold tabular ${
                      suspiciousCount ? 'text-rose-300' : 'text-emerald-300'
                    }`}
                    dir="ltr"
                  >
                    {suspiciousCount}
                  </p>
                </div>
                <div className="col-span-2 rounded-lg border border-white/[0.055] bg-white/[0.02] px-3 py-2.5 sm:col-span-1">
                  <p className="text-[8px] font-bold text-slate-600">الحكم</p>
                  <p
                    className={`mt-1 text-xs font-extrabold ${
                      clean ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {clean ? 'سليم' : 'يحتاج مراجعة'}
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-white/[0.05]">
                <div className="flex items-center justify-between px-5 py-3">
                  <p className="text-[9px] font-bold text-slate-500">سجل الاتصالات الأخيرة</p>
                  <span className="rounded border border-white/[0.06] bg-white/[0.025] px-1.5 py-0.5 font-mono text-[8px] font-bold text-slate-500">
                    {totalConnections} / 50
                  </span>
                </div>

                {report.connections.length === 0 ? (
                  <div className="px-5 pb-8 text-center" role="status">
                    <p className="text-[10px] font-medium text-slate-500">
                      لا توجد اتصالات TCP مسجلة لهذا الجهاز حتى الآن.
                    </p>
                    <p className="mt-1 text-[9px] text-slate-600">
                      ستظهر النتائج بعد أن يلتقط المحلل حزم SYN مرتبطة بهذا الجهاز.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.045] border-t border-white/[0.045]">
                    {report.connections.map((connection, index) => {
                      const reasons = Array.isArray(connection.reasons)
                        ? connection.reasons
                        : [];

                      return (
                        <div
                          key={`${connection.timestamp}-${connection.remote_ip}-${connection.remote_port}-${index}`}
                          className="flex items-start gap-3 px-5 py-3"
                        >
                          <span
                            className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${
                              connection.suspicious
                                ? 'border-rose-300/15 bg-rose-400/[0.06] text-rose-300'
                                : 'border-emerald-300/15 bg-emerald-400/[0.06] text-emerald-300'
                            }`}
                          >
                            {connection.suspicious ? (
                              <ShieldAlert className="h-3.5 w-3.5" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5" />
                            )}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[10px] font-bold text-slate-300" dir="ltr">
                                {connection.remote_ip}:{connection.remote_port}
                              </span>
                              <span className="rounded border border-white/[0.06] bg-white/[0.025] px-1.5 py-0.5 text-[8px] font-bold text-slate-500">
                                {connection.direction === 'outbound' ? 'صادر' : 'وارد'}
                              </span>
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[8px] font-bold ${
                                  connection.suspicious
                                    ? 'border-rose-400/20 bg-rose-400/[0.07] text-rose-300'
                                    : 'border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-300'
                                }`}
                              >
                                {connection.suspicious ? 'مشبوه' : 'طبيعي'}
                              </span>
                            </div>

                            {reasons.length > 0 && (
                              <p className="mt-1 text-[9px] font-medium leading-4 text-rose-300/80">
                                {reasons.join(' · ')}
                              </p>
                            )}

                            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[8px] font-medium text-slate-600">
                              <Clock3 className="h-2.5 w-2.5" />
                              {formatTimestamp(connection.timestamp)}
                              <span className="text-slate-700">·</span>
                              <span>
                                المنفذ المحلي: <span className="font-mono" dir="ltr">{connection.local_port}</span>
                              </span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] bg-white/[0.012] px-5 py-3">
          <p className="text-[9px] font-medium text-slate-600">
            تحليل فوري لآخر 50 اتصالًا · المنافذ الخطرة: 23، 4444، 3389 وغيرها
          </p>
          <div className="flex items-center gap-2">
            {!loading && !error && report && (
              <button type="button" onClick={() => onRetry?.()} className="btn-secondary h-8">
                <RefreshCw className="h-3.5 w-3.5" />
                إعادة الفحص
              </button>
            )}
            <button type="button" onClick={() => onClose?.()} className="btn-secondary h-8">
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
