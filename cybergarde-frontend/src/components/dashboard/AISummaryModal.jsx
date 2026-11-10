import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  BrainCircuit,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

const API_URL = 'http://127.0.0.1:8000/api/reports/ai-summary';

const timeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const riskConfig = {
  low: {
    label: 'منخفض',
    className: 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300',
    icon: 'border-emerald-300/15 bg-emerald-400/[0.06] text-emerald-300',
    iconComponent: ShieldCheck,
  },
  medium: {
    label: 'متوسط',
    className: 'border-amber-400/20 bg-amber-400/[0.07] text-amber-300',
    icon: 'border-amber-300/15 bg-amber-400/[0.06] text-amber-300',
    iconComponent: AlertTriangle,
  },
  high: {
    label: 'مرتفع',
    className: 'border-orange-400/25 bg-orange-400/[0.08] text-orange-300',
    icon: 'border-orange-300/15 bg-orange-400/[0.06] text-orange-300',
    iconComponent: ShieldAlert,
  },
  critical: {
    label: 'حرج',
    className: 'border-rose-400/25 bg-rose-500/[0.09] text-rose-300',
    icon: 'border-rose-300/15 bg-rose-400/[0.06] text-rose-300',
    iconComponent: ShieldAlert,
  },
};

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : timeFormatter.format(date);
}

export default function AISummaryModal({ open, onClose }) {
  const [state, setState] = useState({
    loading: false,
    error: null,
    report: null,
  });
  const requestRef = useRef(null);
  const dialogRef = useRef(null);

  const loadSummary = useCallback(async () => {
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
        method: 'POST',
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

        throw new Error(detail ?? `فشل توليد التقرير الذكي (${response.status}).`);
      }

      const payload = await response.json();

      if (!payload || typeof payload !== 'object' || typeof payload.summary !== 'string') {
        throw new Error('استجابة التقرير الذكي غير صالحة.');
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
          : requestError.message || 'حدث خطأ أثناء توليد التقرير.';

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

    loadSummary();

    return () => {
      requestRef.current?.abort();
    };
  }, [open, loadSummary]);

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

  const report = state.report;
  const riskKey = report?.risk_level ?? 'low';
  const risk = riskConfig[riskKey] ?? riskConfig.low;
  const RiskIcon = risk.iconComponent;
  const threats = Array.isArray(report?.threats) ? report.threats : [];
  const recommendations = Array.isArray(report?.recommendations)
    ? report.recommendations
    : [];

  return createPortal(
    <div
      className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto bg-[#02060b]/85 p-4 backdrop-blur-md sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-summary-title"
        tabIndex={-1}
        className="relative my-4 w-full max-w-3xl overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#06111b] shadow-[0_28px_80px_-30px_rgba(0,0,0,0.95)] focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-400/[0.06] text-cyan-300">
              <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.8} />
              <span className="absolute inset-0 rounded-xl bg-cyan-400/10 blur-lg" />
            </span>
            <div>
              <p className="eyebrow text-cyan-300/60">AI Threat Summary</p>
              <h2 id="ai-summary-title" className="section-title">
                تقرير ذكي عن التهديدات
              </h2>
              <p className="mt-1 text-[10px] font-medium text-slate-500">
                تحليل آخر 5 تنبيهات مسجلة مع تقييم المخاطر والتوصيات
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onClose?.()}
            className="icon-button h-8 w-8 rounded-lg"
            aria-label="إغلاق التقرير الذكي"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto">
          {state.loading && (
            <div className="flex flex-col items-center justify-center px-5 py-16 text-center" role="status">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.05] text-cyan-300">
                <Loader2 className="h-5 w-5 animate-spin" />
              </span>
              <p className="mt-4 text-xs font-bold text-slate-200">جارٍ تحليل التنبيهات...</p>
              <p className="mt-1.5 text-[10px] text-slate-500">
                يقوم المحلل بقراءة آخر 5 تنبيهات وتوليد تقييم عربي مختصر
              </p>
            </div>
          )}

          {!state.loading && state.error && (
            <div className="px-5 py-12" role="alert">
              <div className="mx-auto flex max-w-md flex-col items-center justify-center text-center">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-rose-300/15 bg-rose-400/[0.06] text-rose-300">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <p className="mt-4 text-xs font-bold text-slate-200">تعذر توليد التقرير</p>
                <p className="mt-1.5 text-[10px] leading-5 text-slate-500">{state.error}</p>
                <button type="button" onClick={loadSummary} className="btn-secondary mt-4 h-8">
                  <RefreshCw className="h-3.5 w-3.5" />
                  إعادة المحاولة
                </button>
              </div>
            </div>
          )}

          {!state.loading && !state.error && report && (
            <>
              <div className={`mx-5 mt-5 rounded-xl border p-4 ${risk.className}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${risk.icon}`}>
                      <RiskIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-70">
                        مستوى الخطر الحالي
                      </p>
                      <p className="mt-0.5 text-lg font-extrabold">{risk.label}</p>
                      <p className="mt-1 text-[10px] font-medium leading-5 opacity-80">
                        {report.headline}
                      </p>
                    </div>
                  </div>

                  <div className="text-[9px] font-medium opacity-70 sm:text-left">
                    <p className="flex items-center gap-1.5 sm:justify-end">
                      <Clock3 className="h-3 w-3" />
                      {formatDate(report.generated_at)}
                    </p>
                    <p className="mt-1 font-mono" dir="ltr">
                      {report.alerts_analyzed} alerts
                    </p>
                  </div>
                </div>
              </div>

              <div className="mx-5 mt-4 rounded-xl border border-white/[0.055] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-cyan-300" />
                  <h3 className="text-[11px] font-bold text-slate-200">الملخص التحليلي</h3>
                </div>
                <p className="mt-2 text-[10px] leading-6 text-slate-400">{report.summary}</p>
              </div>

              <div className="mx-5 mt-4">
                <h3 className="text-[11px] font-bold text-slate-200">التهديدات التي حدثت</h3>
                {threats.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-emerald-400/10 bg-emerald-400/[0.03] px-3 py-2.5 text-[10px] text-emerald-300/80">
                    لا توجد تهديدات حديثة ضمن آخر 5 تنبيهات.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {threats.map((threat, index) => (
                      <li
                        key={`${threat}-${index}`}
                        className="flex items-start gap-2 rounded-lg border border-white/[0.055] bg-white/[0.018] px-3 py-2.5"
                      >
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border border-rose-300/15 bg-rose-400/[0.06] text-rose-300">
                          <ShieldAlert className="h-3 w-3" />
                        </span>
                        <span className="text-[10px] leading-5 text-slate-400">{threat}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mx-5 mb-5 mt-4">
                <h3 className="text-[11px] font-bold text-slate-200">التوصيات</h3>
                <ul className="mt-2 space-y-2">
                  {recommendations.map((recommendation, index) => (
                    <li
                      key={`${recommendation}-${index}`}
                      className="flex items-start gap-2 text-[10px] leading-5 text-slate-400"
                    >
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300/80" />
                      <span>{recommendation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] bg-white/[0.012] px-5 py-3">
          <p className="text-[8px] font-medium text-slate-600">
            {report?.model ?? 'Cyber Garde Arabic Analyst'} · تحليل آلي محلي
          </p>
          <div className="flex items-center gap-2">
            {!state.loading && !state.error && report && (
              <button type="button" onClick={loadSummary} className="btn-secondary h-8">
                <RefreshCw className="h-3.5 w-3.5" />
                إعادة التوليد
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
