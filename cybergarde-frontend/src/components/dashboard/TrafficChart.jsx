import { useEffect, useMemo, useState } from 'react';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Activity, ArrowDownToLine, ArrowUpFromLine, Radio } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const ranges = [
  { id: 'live', label: 'مباشر' },
  { id: 'day', label: '24 ساعة' },
  { id: 'week', label: '7 أيام' },
];

const weekLabels = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

function formatClock(date, withSeconds = false) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(date);
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function createLiveSeries() {
  const count = 16;
  const now = Date.now();

  const labels = Array.from({ length: count }, (_, index) =>
    formatClock(new Date(now - (count - 1 - index) * 3_000), true),
  );

  const inbound = Array.from({ length: count }, (_, index) =>
    round(46 + Math.sin(index * 0.62) * 13 + Math.cos(index * 0.27) * 6 + Math.random() * 6),
  );

  const outbound = Array.from({ length: count }, (_, index) =>
    round(22 + Math.sin(index * 0.52 + 1.2) * 7 + Math.random() * 4),
  );

  return { labels, inbound, outbound };
}

function createSeries(range) {
  if (range === 'week') {
    return {
      labels: weekLabels,
      inbound: [58, 66, 52, 74, 69, 81, 63],
      outbound: [29, 34, 26, 39, 36, 43, 32],
    };
  }

  if (range === 'day') {
    return {
      labels: Array.from({ length: 12 }, (_, index) => `${String(index * 2).padStart(2, '0')}:00`),
      inbound: [36, 29, 24, 31, 48, 63, 78, 82, 74, 69, 58, 49],
      outbound: [19, 15, 13, 18, 26, 34, 41, 44, 39, 35, 30, 26],
    };
  }

  return createLiveSeries();
}

export default function TrafficChart() {
  const [range, setRange] = useState('live');
  const [series, setSeries] = useState(createLiveSeries);

  useEffect(() => {
    setSeries(createSeries(range));

    if (range !== 'live') return undefined;

    const interval = window.setInterval(() => {
      setSeries((current) => {
        const previousInbound = current.inbound[current.inbound.length - 1] ?? 52;
        const previousOutbound = current.outbound[current.outbound.length - 1] ?? 27;

        const nextInbound = Math.min(
          94,
          Math.max(18, previousInbound + (Math.random() - 0.48) * 14),
        );
        const nextOutbound = Math.min(
          54,
          Math.max(9, previousOutbound + (Math.random() - 0.5) * 8),
        );

        return {
          labels: [...current.labels.slice(1), formatClock(new Date(), true)],
          inbound: [...current.inbound.slice(1), round(nextInbound)],
          outbound: [...current.outbound.slice(1), round(nextOutbound)],
        };
      });
    }, 3_000);

    return () => window.clearInterval(interval);
  }, [range]);

  const lastInbound = series.inbound[series.inbound.length - 1] ?? 0;
  const lastOutbound = series.outbound[series.outbound.length - 1] ?? 0;

  const chartData = useMemo(
    () => ({
      labels: series.labels,
      datasets: [
        {
          label: 'البيانات الواردة',
          data: series.inbound,
          borderColor: '#22d3ee',
          backgroundColor: (context) => {
            const { chart } = context;
            const { ctx, chartArea } = chart;

            if (!chartArea) return 'rgba(34, 211, 238, 0.08)';

            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(34, 211, 238, 0.26)');
            gradient.addColorStop(0.55, 'rgba(34, 211, 238, 0.075)');
            gradient.addColorStop(1, 'rgba(34, 211, 238, 0)');
            return gradient;
          },
          fill: true,
          tension: 0.42,
          borderWidth: 2,
          pointRadius: (context) =>
            context.dataIndex === context.dataset.data.length - 1 ? 3.5 : 0,
          pointHoverRadius: 5,
          pointBackgroundColor: '#22d3ee',
          pointBorderColor: '#031019',
          pointBorderWidth: 2,
        },
        {
          label: 'البيانات الصادرة',
          data: series.outbound,
          borderColor: '#4ade80',
          backgroundColor: (context) => {
            const { chart } = context;
            const { ctx, chartArea } = chart;

            if (!chartArea) return 'rgba(74, 222, 128, 0.06)';

            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(74, 222, 128, 0.19)');
            gradient.addColorStop(0.55, 'rgba(74, 222, 128, 0.045)');
            gradient.addColorStop(1, 'rgba(74, 222, 128, 0)');
            return gradient;
          },
          fill: true,
          tension: 0.42,
          borderWidth: 1.8,
          pointRadius: (context) =>
            context.dataIndex === context.dataset.data.length - 1 ? 3 : 0,
          pointHoverRadius: 5,
          pointBackgroundColor: '#4ade80',
          pointBorderColor: '#031019',
          pointBorderWidth: 2,
        },
      ],
    }),
    [series],
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 480,
        easing: 'easeOutQuart',
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      layout: {
        padding: { top: 8, right: 4, bottom: 0, left: 4 },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          rtl: true,
          textDirection: 'rtl',
          backgroundColor: 'rgba(4, 13, 22, 0.97)',
          borderColor: 'rgba(34, 211, 238, 0.22)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          titleFont: {
            family: 'Tajawal, Cairo, sans-serif',
            size: 11,
            weight: '600',
          },
          bodyFont: {
            family: 'Tajawal, Cairo, sans-serif',
            size: 11,
          },
          displayColors: true,
          boxWidth: 7,
          boxHeight: 7,
          boxPadding: 5,
          titleMarginBottom: 7,
          callbacks: {
            label: (context) =>
              ` ${context.dataset.label}: ${Number(context.parsed.y).toFixed(1)} Mbps`,
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          border: {
            display: false,
          },
          ticks: {
            color: '#506577',
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 7,
            padding: 8,
            font: {
              family: 'Tajawal, Cairo, sans-serif',
              size: 10,
            },
          },
        },
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          grid: {
            color: 'rgba(148, 163, 184, 0.065)',
            drawTicks: false,
          },
          border: {
            display: false,
          },
          ticks: {
            color: '#4b6072',
            padding: 10,
            stepSize: 20,
            maxTicksLimit: 6,
            font: {
              family: 'Tajawal, Cairo, sans-serif',
              size: 10,
            },
          },
        },
      },
    }),
    [],
  );

  return (
    <section className="cyber-card reveal flex h-full flex-col" aria-label="حركة المرور على الشبكة">
      <div className="flex flex-col gap-4 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-400/[0.065] text-cyan-300">
            <Activity className="h-[18px] w-[18px]" strokeWidth={1.8} />
            <span className="absolute inset-0 rounded-xl bg-cyan-400/10 blur-lg" />
          </span>
          <div>
            <h2 className="section-title">حركة المرور على الشبكة</h2>
            <p className="mt-1 text-[10px] font-medium leading-5 text-slate-500">
              تدفق البيانات الواردة والصادرة عبر البوابة الرئيسية
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.055] px-2.5 text-[9px] font-bold text-emerald-300">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            مباشر
          </span>

          <div className="flex rounded-lg border border-white/[0.065] bg-white/[0.025] p-0.5" role="group" aria-label="نطاق الرسم البياني">
            {ranges.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRange(item.id)}
                aria-pressed={range === item.id}
                className={`rounded-md px-2.5 py-1.5 text-[9px] font-bold transition-all duration-200 ${
                  range === item.id
                    ? 'bg-cyan-400/[0.12] text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.15)]'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-white/[0.05] bg-white/[0.012] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-400/[0.075] text-cyan-300">
            <ArrowDownToLine className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-[9px] font-medium leading-none text-slate-600">البيانات الواردة</p>
            <p className="mt-1.5 text-[12px] font-bold leading-none text-cyan-300 tabular" dir="ltr">
              {lastInbound.toFixed(1)} <span className="text-[8px] font-medium text-slate-600">Mbps</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-400/[0.075] text-emerald-300">
            <ArrowUpFromLine className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-[9px] font-medium leading-none text-slate-600">البيانات الصادرة</p>
            <p className="mt-1.5 text-[12px] font-bold leading-none text-emerald-300 tabular" dir="ltr">
              {lastOutbound.toFixed(1)} <span className="text-[8px] font-medium text-slate-600">Mbps</span>
            </p>
          </div>
        </div>

        <div className="ms-auto flex items-center gap-2 text-[9px] font-medium text-slate-600">
          <Radio className="h-3.5 w-3.5 text-slate-700" />
          <span>{range === 'live' ? 'تحديث تلقائي كل 3 ثوانٍ' : 'سجل مُجمّع للفترة المحددة'}</span>
        </div>
      </div>

      <div className="relative min-h-[260px] flex-1 px-3 pb-3 pt-4 sm:px-4" dir="ltr">
        <div className="absolute bottom-6 left-0 right-0 top-6 bg-[linear-gradient(90deg,rgba(34,211,238,0.025)_1px,transparent_1px)] bg-[length:80px_100%] opacity-30" />
        <div className="relative h-[265px] w-full sm:h-[285px]">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </section>
  );
}
