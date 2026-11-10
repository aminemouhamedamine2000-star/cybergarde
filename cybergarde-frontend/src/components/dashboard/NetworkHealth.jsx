import { useEffect, useId, useRef, useState } from 'react';
import { Check, RefreshCw, ShieldCheck } from 'lucide-react';
import { networkChecks } from '../../data/dashboard.js';

const radius = 62;
const circumference = 2 * Math.PI * radius;
const gaugeArc = circumference * 0.75;

export default function NetworkHealth() {
  const gradientId = `health-${useId().replace(/:/g, '')}`;
  const [score, setScore] = useState(92);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState('قبل 3 دقائق');
  const scanTimer = useRef(null);

  useEffect(
    () => () => {
      window.clearTimeout(scanTimer.current);
    },
    [],
  );

  const handleScan = () => {
    if (scanning) return;

    setScanning(true);
    scanTimer.current = window.setTimeout(() => {
      setScore(90 + Math.floor(Math.random() * 8));
      setLastScan('الآن');
      setScanning(false);
    }, 1_050);
  };

  const scoreArc = gaugeArc * (score / 100);

  return (
    <section className="cyber-card reveal flex h-full flex-col" aria-label="صحة الشبكة">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="section-title">صحة الشبكة</h2>
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/15 bg-emerald-400/[0.05] px-1.5 py-0.5 text-[8px] font-bold text-emerald-300">
              <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,0.9)]" />
              مستقرة
            </span>
          </div>
          <p className="mt-1 text-[10px] font-medium text-slate-500">التقييم اللحظي لجاهزية البنية</p>
        </div>

        <button
          type="button"
          onClick={handleScan}
          disabled={scanning}
          className="icon-button h-8 w-8 rounded-lg disabled:cursor-wait"
          aria-label="إعادة فحص صحة الشبكة"
          title="فحص سريع"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-center px-5 py-3">
        <div className="relative mx-auto h-[182px] w-[190px]">
          <span className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/[0.055] blur-3xl" />

          <svg viewBox="0 0 160 160" className="relative h-full w-full overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id={gradientId} x1="20" y1="142" x2="142" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#22d3ee" />
                <stop offset="0.52" stopColor="#2dd4bf" />
                <stop offset="1" stopColor="#4ade80" />
              </linearGradient>
              <filter id={`${gradientId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="rgba(148, 163, 184, 0.075)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${gaugeArc} ${circumference}`}
              transform="rotate(135 80 80)"
            />

            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${scoreArc} ${circumference}`}
              transform="rotate(135 80 80)"
              filter={`url(#${gradientId}-glow)`}
              className="transition-all duration-700 ease-out"
            />

            <circle
              cx="80"
              cy="80"
              r="47"
              fill="none"
              stroke="rgba(34, 211, 238, 0.08)"
              strokeWidth="1"
              strokeDasharray="2 7"
              transform="rotate(135 80 80)"
            />

            <circle cx="80" cy="80" r="74" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1" />
            <circle cx="80" cy="80" r="76" fill="none" stroke="rgba(34,211,238,0.055)" strokeWidth="1" strokeDasharray="1 6" />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
            <span className="text-[9px] font-bold tracking-wide text-slate-600">درجة الحماية</span>
            <div className="mt-1 flex items-start" aria-live="polite">
              <span className="font-display text-[46px] font-extrabold leading-none tracking-tight text-white text-glow-cyan tabular">
                {score}
              </span>
              <span className="mt-1 text-xs font-bold text-cyan-300">%</span>
            </div>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-400/15 bg-emerald-400/[0.055] px-2.5 py-1 text-[8px] font-bold text-emerald-300">
              <ShieldCheck className="h-2.5 w-2.5" />
              محمية بالكامل
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2 px-5">
        {networkChecks.map((check) => (
          <div
            key={check.id}
            className="flex items-center justify-between rounded-lg border border-white/[0.045] bg-white/[0.018] px-3 py-2.5 transition-colors hover:border-white/[0.08] hover:bg-white/[0.03]"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full border border-emerald-400/15 bg-emerald-400/[0.065] text-emerald-300">
                <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
              </span>
              <span className="text-[10px] font-medium text-slate-400">{check.label}</span>
            </div>
            <span className="text-[9px] font-bold text-emerald-300/85">{check.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-white/[0.05] px-5 py-3.5">
        <div className="flex items-center justify-between text-[9px] font-medium">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="h-1 w-1 rounded-full bg-cyan-400/70" />
            آخر فحص شامل
          </span>
          <span className="text-slate-400">{lastScan}</span>
        </div>
      </div>
    </section>
  );
}
