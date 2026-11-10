import { useEffect, useRef, useState } from 'react';
import { Download, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { devices } from '../../data/dashboard.js';

const statusLabels = {
  online: 'متصل',
  warning: 'تحذير',
};

function exportDevicesCsv() {
  const headers = ['اسم الجهاز', 'عنوان IP', 'عنوان MAC', 'الحالة', 'آخر ظهور', 'الموقع'];
  const rows = devices.map((device) => [
    device.name,
    device.ip,
    device.mac,
    statusLabels[device.status] ?? device.status,
    device.lastSeen,
    device.location,
  ]);

  const content = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = 'cybergarde-devices.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function DashboardHeader({
  lastSync,
  onRefresh,
  onOpenComplianceReport,
}) {
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef(null);

  useEffect(
    () => () => {
      window.clearTimeout(refreshTimer.current);
    },
    [],
  );

  const handleRefresh = () => {
    if (refreshing) return;

    setRefreshing(true);
    onRefresh?.();

    refreshTimer.current = window.setTimeout(() => {
      setRefreshing(false);
    }, 700);
  };

  const syncLabel = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(lastSync);

  const currentDate = new Intl.DateTimeFormat('ar-EG-u-ca-gregory-nu-latn', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div id="dashboard" className="flex flex-col gap-5 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-50" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]" />
          </span>
          <p className="eyebrow text-cyan-300/65">مركز العمليات الأمنية</p>
          <span className="h-3 w-px bg-white/10" />
          <span className="text-[10px] font-medium text-slate-600">{currentDate}</span>
        </div>

        <h1 className="mt-3 font-display text-[29px] font-extrabold leading-tight tracking-tight text-white sm:text-[34px]">
          مرحبًا، <span className="text-cyan-200">محمد أمين</span>
        </h1>
        <p className="mt-2 max-w-2xl text-[11px] font-medium leading-6 text-slate-500 sm:text-xs">
          نظرة لحظية على أمن الشبكة والأجهزة المتصلة. كل الأنظمة تعمل ضمن النطاق الآمن.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        <div className="me-1 hidden flex-col items-end sm:flex">
          <span className="text-[9px] font-medium text-slate-600">آخر مزامنة للبيانات</span>
          <span className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
            <ShieldCheck className="h-3 w-3 text-emerald-400/80" />
            اليوم، <span className="font-mono tabular" dir="ltr">{syncLabel}</span>
          </span>
        </div>

        <button type="button" onClick={handleRefresh} className="btn-secondary" disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          تحديث البيانات
        </button>

        <button
          type="button"
          onClick={() => onOpenComplianceReport?.()}
          className="btn-primary"
        >
          <FileText className="h-3.5 w-3.5" />
          تصدير تقرير PDF
        </button>

        <button type="button" onClick={exportDevicesCsv} className="btn-secondary">
          <Download className="h-3.5 w-3.5" />
          تصدير CSV
        </button>
      </div>
    </div>
  );
}
