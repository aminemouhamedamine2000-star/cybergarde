import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock3,
  Loader2,
  Microscope,
  Network,
  RefreshCw,
  Router,
  SearchX,
  Server,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import ForensicsModal from './ForensicsModal.jsx';

const API_BASE = 'http://127.0.0.1:8000';
const API_URL = `${API_BASE}/api/devices`;
const AUTO_REFRESH_MS = 10_000;

const statusConfig = {
  online: {
    label: 'متصل',
    className:
      'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300 shadow-[0_0_18px_-7px_rgba(74,222,128,0.8)]',
    dot: 'bg-emerald-400 shadow-[0_0_7px_rgba(74,222,128,0.9)]',
    ping: 'bg-emerald-400',
  },
  warning: {
    label: 'تحذير',
    className:
      'border-amber-400/20 bg-amber-400/[0.07] text-amber-300 shadow-[0_0_18px_-7px_rgba(251,191,36,0.8)]',
    dot: 'bg-amber-400 shadow-[0_0_7px_rgba(251,191,36,0.9)]',
    ping: 'bg-amber-400',
  },
  compromised: {
    label: 'مخترق',
    className:
      'border-rose-400/30 bg-rose-500/[0.12] text-rose-300 shadow-[0_0_20px_-5px_rgba(244,63,94,0.9)]',
    dot: 'bg-rose-400 shadow-[0_0_7px_rgba(244,63,94,0.95)]',
    ping: 'bg-rose-400',
  },
  honeypot: {
    label: 'طُعم نشط',
    className:
      'border-violet-400/25 bg-violet-400/[0.08] text-violet-300 shadow-[0_0_18px_-7px_rgba(167,139,250,0.8)]',
    dot: 'bg-violet-400 shadow-[0_0_7px_rgba(167,139,250,0.9)]',
    ping: 'bg-violet-400',
  },
};

const timeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function normalizeDevices(payload) {
  return payload.map((device, index) => {
    if (
      !device ||
      typeof device.ip !== 'string' ||
      typeof device.mac !== 'string' ||
      !device.ip.trim() ||
      !device.mac.trim()
    ) {
      throw new Error('استجابة الخادم يجب أن تكون قائمة من العناصر التي تحتوي على ip و mac.');
    }

    const ip = device.ip.trim();
    const mac = device.mac.trim().toUpperCase();
    const isHoneypot = Boolean(device.is_honeypot);
    const serverStatus = typeof device.status === 'string' ? device.status : 'online';
    const compromised =
      Boolean(device.compromised) || serverStatus === 'compromised';
    const status = compromised
      ? 'compromised'
      : serverStatus === 'warning'
        ? 'warning'
        : isHoneypot || serverStatus === 'honeypot'
          ? 'honeypot'
          : 'online';

    let lastSeen = 'الآن';

    if (compromised) {
      const compromisedAt =
        typeof device.compromised_at === 'string'
          ? new Date(device.compromised_at)
          : null;

      lastSeen =
        compromisedAt && !Number.isNaN(compromisedAt.getTime())
          ? `رُصد ${timeFormatter.format(compromisedAt)}`
          : 'رُصد اتصال بالطُعم';
    } else if (isHoneypot) {
      lastSeen = 'بانتظار محاولة اتصال';
    }

    return {
      id: `${ip}-${mac}-${index}`,
      name:
        typeof device.name === 'string' && device.name.trim()
          ? device.name.trim()
          : isHoneypot
            ? 'Server-HR-Confidential'
            : `جهاز مكتشف ${String(index + 1).padStart(2, '0')}`,
      ip,
      mac,
      status,
      isHoneypot,
      compromised,
      compromisedAt:
        typeof device.compromised_at === 'string' ? device.compromised_at : null,
      lastSeen,
    };
  });
}

export default function DeviceTable({ query = '', onClearSearch }) {
  const [devices, setDevices] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const requestRef = useRef(null);
  const [forensics, setForensics] = useState({
    open: false,
    device: null,
    loading: false,
    error: null,
    report: null,
  });
  const forensicsRequestRef = useRef(null);

  const closeForensics = useCallback(() => {
    forensicsRequestRef.current?.abort();
    forensicsRequestRef.current = null;
    setForensics({
      open: false,
      device: null,
      loading: false,
      error: null,
      report: null,
    });
  }, []);

  const runForensics = useCallback(async (device) => {
    forensicsRequestRef.current?.abort();

    const controller = new AbortController();
    forensicsRequestRef.current = controller;

    setForensics({
      open: true,
      device,
      loading: true,
      error: null,
      report: null,
    });

    try {
      const response = await fetch(
        `${API_BASE}/api/devices/${encodeURIComponent(device.ip)}/forensics`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        let detail = null;

        try {
          const errorBody = await response.json();
          detail = typeof errorBody?.detail === 'string' ? errorBody.detail : null;
        } catch {
          detail = null;
        }

        throw new Error(detail ?? `فشل فحص الجهاز (${response.status}).`);
      }

      const payload = await response.json();

      if (
        !payload ||
        typeof payload !== 'object' ||
        !Array.isArray(payload.connections)
      ) {
        throw new Error('استجابة التحقيق الجنائي غير صالحة.');
      }

      if (controller.signal.aborted) return;

      setForensics((current) => ({
        ...current,
        loading: false,
        error: null,
        report: payload,
      }));
    } catch (requestError) {
      if (requestError.name === 'AbortError' || controller.signal.aborted) return;

      const message =
        requestError instanceof TypeError
          ? 'تعذر الاتصال بخادم Cyber Garde. تأكد من تشغيل الخادم على http://127.0.0.1:8000.'
          : requestError.message || 'حدث خطأ أثناء فحص الجهاز.';

      setForensics((current) => ({
        ...current,
        loading: false,
        error: message,
      }));
    } finally {
      if (forensicsRequestRef.current === controller) {
        forensicsRequestRef.current = null;
      }
    }
  }, []);

  useEffect(
    () => () => {
      forensicsRequestRef.current?.abort();
    },
    [],
  );

  const loadDevices = useCallback(async ({ silent = false } = {}) => {
    requestRef.current?.abort();

    const controller = new AbortController();
    requestRef.current = controller;

    if (!silent) {
      setLoading(true);
      setError(null);
    }

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

        throw new Error(detail ?? `فشل جلب الأجهزة من الخادم (${response.status}).`);
      }

      const payload = await response.json();

      if (!Array.isArray(payload)) {
        throw new Error('استجابة الخادم غير صالحة: يجب أن تكون قائمة أجهزة.');
      }

      const nextDevices = normalizeDevices(payload);

      if (controller.signal.aborted) return;

      setDevices(nextDevices);
      setError(null);
      setLastUpdated(new Date());
    } catch (requestError) {
      if (requestError.name === 'AbortError' || controller.signal.aborted) return;

      const message =
        requestError instanceof TypeError
          ? 'تعذر الاتصال بخادم Cyber Garde. تأكد من تشغيل الخادم على http://127.0.0.1:8000.'
          : requestError.message || 'حدث خطأ غير متوقع أثناء جلب الأجهزة.';

      // A failed background poll keeps the previous data in state so the next
      // successful refresh can restore it without a blank flash. Only a
      // user-triggered load clears the list.
      if (!silent) {
        setDevices([]);
      }
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadDevices();

    const intervalId = window.setInterval(() => {
      loadDevices({ silent: true });
    }, AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
      requestRef.current?.abort();
    };
  }, [loadDevices]);

  const deviceCounts = useMemo(
    () => ({
      all: devices.length,
      online: devices.filter((device) => device.status === 'online').length,
      warning: devices.filter((device) => device.status === 'warning').length,
      compromised: devices.filter((device) => device.status === 'compromised').length,
      honeypot: devices.filter((device) => device.status === 'honeypot').length,
    }),
    [devices],
  );

  const filterOptions = [
    { id: 'all', label: 'الكل', count: deviceCounts.all },
    { id: 'online', label: 'متصل', count: deviceCounts.online },
    { id: 'warning', label: 'تحذير', count: deviceCounts.warning },
    { id: 'compromised', label: 'مخترق', count: deviceCounts.compromised },
    { id: 'honeypot', label: 'طُعم', count: deviceCounts.honeypot },
  ];

  const filteredDevices = useMemo(() => {
    const search = query.trim().toLowerCase();

    return devices.filter((device) => {
      const matchesFilter = filter === 'all' || device.status === filter;
      if (!matchesFilter) return false;
      if (!search) return true;

      const haystack = [
        device.name,
        device.ip,
        device.mac,
        statusConfig[device.status]?.label,
        device.isHoneypot ? 'honeypot طعم' : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [devices, filter, query]);

  const resetFilters = () => {
    setFilter('all');
    onClearSearch?.();
  };

  return (
    <section id="devices" className="cyber-card reveal" aria-label="قائمة الأجهزة المتصلة">
      <div className="flex flex-col gap-4 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-400/[0.06] text-cyan-300">
            <Router className="h-[18px] w-[18px]" strokeWidth={1.8} />
            <span className="absolute inset-0 rounded-xl bg-cyan-400/10 blur-lg" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="section-title">الأجهزة المتصلة</h2>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/15 bg-emerald-400/[0.05] px-2 py-0.5 text-[8px] font-bold text-emerald-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-55" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                مراقبة مباشرة
              </span>
            </div>
            <p className="mt-1 text-[10px] font-medium leading-5 text-slate-500">
              أجهزة الشبكة المحلية مع حالة الاختراق، والطُعم النشط، والتحقيق الجنائي بضغطة زر
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`hidden items-center gap-2 rounded-lg border px-3 py-2 text-[9px] font-medium sm:flex ${
              error
                ? 'border-amber-400/15 bg-amber-400/[0.035] text-amber-300/80'
                : 'border-white/[0.055] bg-white/[0.02] text-slate-500'
            }`}
          >
            {error ? (
              <WifiOff className="h-3.5 w-3.5 text-amber-400/80" />
            ) : loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400/80" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/80" />
            )}
            {error
              ? 'تعذر الاتصال بالخادم'
              : loading
                ? 'جارٍ الاتصال بالخادم'
                : 'بيانات مباشرة من الخادم'}
          </div>

          <button
            type="button"
            onClick={() => loadDevices()}
            disabled={loading}
            className="icon-button h-8 w-8 rounded-lg disabled:cursor-wait disabled:opacity-60"
            aria-label="تحديث قائمة الأجهزة"
            title="تحديث القائمة"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-y border-white/[0.05] bg-white/[0.012] px-5 py-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="تصفية الأجهزة حسب الحالة">
          {filterOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={filter === option.id}
              className={`filter-chip ${filter === option.id ? 'filter-chip-active' : ''}`}
            >
              {option.label}
              <span
                className={`rounded px-1 py-0.5 font-mono text-[8px] tabular ${
                  filter === option.id
                    ? 'bg-cyan-400/15 text-cyan-300'
                    : 'bg-white/[0.045] text-slate-600'
                }`}
              >
                {option.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[9px] font-medium text-slate-600 sm:ms-auto">
          {query ? (
            <>
              <span className="truncate">
                نتائج البحث عن «<span className="font-bold text-cyan-300/80">{query}</span>»
              </span>
              <button
                type="button"
                onClick={onClearSearch}
                className="shrink-0 rounded-md border border-white/[0.07] px-2 py-1 text-[8px] font-bold text-slate-500 transition-colors hover:border-cyan-300/20 hover:text-cyan-200"
              >
                مسح
              </button>
            </>
          ) : (
            <>
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin text-cyan-400/70" />
              ) : error ? (
                <WifiOff className="h-3 w-3 text-amber-400/70" />
              ) : (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-40" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-cyan-400/80" />
                </span>
              )}
              {loading
                ? 'جارٍ تحميل الأجهزة...'
                : error
                  ? 'تعذر تحديث البيانات'
                  : lastUpdated
                    ? `آخر مزامنة الساعة ${timeFormatter.format(lastUpdated)} · تحديث تلقائي كل 10 ثوانٍ`
                    : 'بانتظار بيانات الخادم'}
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse text-right">
          <caption className="sr-only">
            قائمة الأجهزة المكتشفة مع عناوين IP وMAC والحالة وإجراءات التحقيق الجنائي
          </caption>
          <thead>
            <tr className="border-b border-white/[0.045] bg-[#06111b]/50">
              <th scope="col" className="px-5 py-3 text-[9px] font-bold text-slate-600">
                الجهاز
              </th>
              <th scope="col" className="px-4 py-3 text-[9px] font-bold text-slate-600">
                عنوان IP
              </th>
              <th scope="col" className="px-4 py-3 text-[9px] font-bold text-slate-600">
                عنوان MAC
              </th>
              <th scope="col" className="px-4 py-3 text-[9px] font-bold text-slate-600">
                الحالة
              </th>
              <th scope="col" className="px-4 py-3 text-[9px] font-bold text-slate-600">
                آخر نشاط
              </th>
              <th scope="col" className="px-4 py-3 text-[9px] font-bold text-slate-600">
                المصدر
              </th>
              <th scope="col" className="px-4 py-3 text-[9px] font-bold text-slate-600">
                الإجراءات
              </th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-5 py-16">
                  <div className="flex flex-col items-center justify-center text-center" role="status" aria-live="polite">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.05] text-cyan-300">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </span>
                    <p className="mt-4 text-xs font-bold text-slate-300">جاري تحميل الأجهزة...</p>
                    <p className="mt-1.5 text-[10px] text-slate-600">
                      يتم فحص الشبكة المحلية عبر بروتوكول ARP
                    </p>
                  </div>
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={7} className="px-5 py-14">
                  <div className="mx-auto flex max-w-md flex-col items-center justify-center text-center" role="alert">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-300/15 bg-amber-400/[0.055] text-amber-300">
                      <WifiOff className="h-5 w-5" />
                    </span>
                    <p className="mt-4 text-xs font-bold text-slate-300">تعذر تحميل الأجهزة</p>
                    <p className="mt-1.5 text-[10px] leading-5 text-slate-600">{error}</p>
                    <button
                      type="button"
                      onClick={() => loadDevices()}
                      className="btn-secondary mt-4 h-8"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      إعادة المحاولة
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {!loading && !error && filteredDevices.map((device) => {
              const status = statusConfig[device.status] ?? statusConfig.online;
              const isScanning =
                forensics.loading && forensics.device?.ip === device.ip;
              const DeviceIcon = device.compromised
                ? ShieldAlert
                : device.isHoneypot
                  ? Server
                  : Network;

              return (
                <tr
                  key={device.id}
                  className={`group border-b border-white/[0.038] transition-colors duration-200 last:border-0 hover:bg-cyan-400/[0.025] ${
                    device.compromised ? 'bg-rose-500/[0.035]' : ''
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span
                        className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-transform duration-200 group-hover:scale-105 ${
                          device.compromised
                            ? 'border-rose-300/20 bg-rose-400/[0.07] text-rose-300'
                            : device.isHoneypot
                              ? 'border-violet-300/20 bg-violet-400/[0.07] text-violet-300'
                              : 'border-cyan-300/15 bg-cyan-400/[0.06] text-cyan-300'
                        }`}
                      >
                        <DeviceIcon className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="max-w-[200px] truncate text-[11px] font-bold text-slate-200">
                            {device.name}
                          </p>
                          {device.isHoneypot && (
                            <span className="rounded border border-violet-400/20 bg-violet-400/[0.07] px-1.5 py-0.5 text-[8px] font-bold text-violet-300">
                              Honeypot
                            </span>
                          )}
                          {device.compromised && (
                            <span className="inline-flex items-center gap-1 rounded border border-rose-400/30 bg-rose-500/[0.12] px-1.5 py-0.5 text-[8px] font-bold text-rose-300">
                              <ShieldAlert className="h-2.5 w-2.5" />
                              مخترق
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="text-[9px] font-medium text-slate-600">
                            {device.isHoneypot
                              ? 'جهاز ردع وهمي'
                              : device.compromised
                                ? 'تواصل مع الخادم الوهمي'
                                : 'جهاز على الشبكة المحلية'}
                          </span>
                          <span className="h-2.5 w-px bg-white/10" />
                          <span className="text-[8px] font-medium text-slate-700">
                            {device.isHoneypot ? 'Honeypot' : 'ARP'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3.5">
                    <span
                      className="inline-flex rounded-md border border-white/[0.055] bg-white/[0.025] px-2 py-1 font-mono text-[10px] font-medium tracking-tight text-slate-300 tabular"
                      dir="ltr"
                    >
                      {device.ip}
                    </span>
                  </td>

                  <td className="px-4 py-3.5">
                    <span
                      className="font-mono text-[10px] font-medium tracking-tight text-slate-500 tabular"
                      dir="ltr"
                    >
                      {device.mac}
                    </span>
                  </td>

                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[9px] font-bold ${status.className}`}
                    >
                      <span className="relative flex h-1.5 w-1.5">
                        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${status.ping}`} />
                        <span className={`relative h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      </span>
                      {status.label}
                    </span>
                  </td>

                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-[9px] font-medium text-slate-500">
                      <Clock3 className="h-3 w-3 text-slate-700" />
                      {device.lastSeen}
                    </span>
                  </td>

                  <td className="px-4 py-3.5">
                    {device.isHoneypot ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-400/15 bg-violet-400/[0.05] px-2 py-1 font-mono text-[8px] font-bold text-violet-300/80">
                        <Server className="h-2.5 w-2.5" />
                        Honeypot
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-1 font-mono text-[8px] font-bold text-cyan-300/70">
                        <Network className="h-2.5 w-2.5" />
                        ARP
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => runForensics(device)}
                      disabled={isScanning}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-300/15 bg-cyan-400/[0.05] px-2.5 text-[9px] font-bold text-cyan-200 transition-colors hover:border-cyan-300/30 hover:bg-cyan-400/[0.1] disabled:cursor-wait disabled:opacity-60"
                      aria-label={`فحص الجهاز ${device.name}`}
                    >
                      {isScanning ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Microscope className="h-3 w-3" />
                      )}
                      فحص الجهاز
                    </button>
                  </td>
                </tr>
              );
            })}

            {!loading && !error && filteredDevices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-14">
                  <div className="flex flex-col items-center justify-center text-center">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.06] bg-white/[0.025] text-slate-600">
                      <SearchX className="h-5 w-5" />
                    </span>
                    <p className="mt-4 text-xs font-bold text-slate-300">
                      {devices.length === 0 ? 'لا توجد أجهزة نشطة على الشبكة' : 'لا توجد أجهزة مطابقة'}
                    </p>
                    <p className="mt-1.5 max-w-xs text-[10px] leading-5 text-slate-600">
                      {devices.length === 0
                        ? 'لم يستجب أي جهاز لطلب ARP. تأكد من اتصالك بالشبكة المحلية ثم أعد المحاولة.'
                        : 'جرّب تغيير حالة التصفية أو مسح كلمة البحث لعرض جميع الأجهزة.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => (devices.length === 0 ? loadDevices() : resetFilters())}
                      className="btn-secondary mt-4 h-8"
                    >
                      {devices.length === 0 ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5" />
                          إعادة الفحص
                        </>
                      ) : (
                        'عرض جميع الأجهزة'
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-white/[0.05] bg-white/[0.012] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[9px] font-medium text-slate-600">
          {loading ? (
            'جارٍ تحميل بيانات الأجهزة من الخادم...'
          ) : error ? (
            'تعذر تحميل بيانات الأجهزة'
          ) : (
            <>
              يتم عرض <span className="font-bold text-slate-400">{filteredDevices.length}</span> من أصل{' '}
              <span className="font-bold text-slate-400">{devices.length}</span> جهازًا مكتشفًا
            </>
          )}
        </p>
        <div
          className={`flex items-center gap-2 text-[9px] font-medium ${
            error ? 'text-amber-300/75' : 'text-emerald-300/75'
          }`}
        >
          {error ? <WifiOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {error ? 'تحقق من اتصال خادم المراقبة' : 'بيانات حية من فحص ARP وسجل الطُعم'}
        </div>
      </div>

      <ForensicsModal
        open={forensics.open}
        device={forensics.device}
        report={forensics.report}
        loading={forensics.loading}
        error={forensics.error}
        onClose={closeForensics}
        onRetry={() => {
          if (forensics.device) runForensics(forensics.device);
        }}
      />
    </section>
  );
}
