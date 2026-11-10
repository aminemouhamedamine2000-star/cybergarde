import { useId } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Network, ShieldAlert } from 'lucide-react';

const iconMap = {
  network: Network,
  'shield-alert': ShieldAlert,
  activity: Activity,
};

const tones = {
  cyan: {
    icon: 'border-cyan-300/20 bg-cyan-400/[0.075] text-cyan-300',
    iconGlow: 'bg-cyan-400/20',
    accent: '#22d3ee',
    line: 'from-cyan-400/70 via-cyan-400/10 to-transparent',
    dot: 'bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.8)]',
  },
  rose: {
    icon: 'border-rose-300/20 bg-rose-400/[0.07] text-rose-300',
    iconGlow: 'bg-rose-400/20',
    accent: '#fb7185',
    line: 'from-rose-400/70 via-rose-400/10 to-transparent',
    dot: 'bg-rose-300 shadow-[0_0_8px_rgba(251,113,133,0.8)]',
  },
  green: {
    icon: 'border-emerald-300/20 bg-emerald-400/[0.07] text-emerald-300',
    iconGlow: 'bg-emerald-400/20',
    accent: '#4ade80',
    line: 'from-emerald-400/70 via-emerald-400/10 to-transparent',
    dot: 'bg-emerald-300 shadow-[0_0_8px_rgba(74,222,128,0.8)]',
  },
};

function Sparkline({ points, accent }) {
  const rawId = useId().replace(/:/g, '');
  const gradientId = `spark-${rawId}`;
  const width = 112;
  const height = 40;
  const padding = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coordinates = points.map((point, index) => ({
    x: padding + (index / (points.length - 1)) * (width - padding * 2),
    y: height - padding - ((point - min) / range) * (height - padding * 2),
  }));

  const linePath = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const firstPoint = coordinates[0];
  const lastPoint = coordinates[coordinates.length - 1];
  const areaPath = `${linePath} L ${lastPoint.x.toFixed(2)} ${height} L ${firstPoint.x.toFixed(2)} ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-10 w-[112px] shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2={height} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={accent}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="5" fill={accent} opacity="0.15" />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="2.2" fill={accent} />
    </svg>
  );
}

export default function StatCard({ stat, index = 0 }) {
  const Icon = iconMap[stat.icon] ?? Network;
  const tone = tones[stat.tone] ?? tones.cyan;
  const TrendIcon = stat.trend === 'down' ? ArrowDownRight : ArrowUpRight;
  const hasSparkline = Array.isArray(stat.sparkline) && stat.sparkline.length > 1;

  return (
    <article
      className="cyber-card reveal group p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12]"
      style={{ animationDelay: `${index * 75}ms` }}
    >
      <span className={`absolute inset-x-0 top-0 h-px bg-gradient-to-l ${tone.line}`} />
      <span className="pointer-events-none absolute -left-8 -top-8 h-28 w-28 rounded-full bg-white/[0.015] blur-2xl" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          <p className="text-[11px] font-bold text-slate-400">{stat.label}</p>
        </div>

        <div
          className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${tone.icon} transition-transform duration-300 group-hover:scale-105`}
        >
          <span className={`absolute inset-0 rounded-xl blur-xl ${tone.iconGlow} opacity-40`} />
          <Icon className="relative h-[18px] w-[18px]" strokeWidth={1.8} />
        </div>
      </div>

      <div className="relative mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[34px] font-extrabold leading-none tracking-tight text-white tabular">
              {stat.value}
            </span>
            <span className="text-[11px] font-bold text-slate-500">{stat.unit}</span>
          </div>
          <p className="mt-2.5 truncate text-[10px] font-medium text-slate-500">{stat.detail}</p>
        </div>

        {hasSparkline && (
          <Sparkline points={stat.sparkline} accent={tone.accent} />
        )}
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-3 border-t border-white/[0.055] pt-3.5">
        <div className="flex items-center gap-1.5">
          {stat.change ? (
            <span
              className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-1 text-[9px] font-bold tabular ${
                stat.trendTone === 'positive'
                  ? 'border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300'
                  : 'border-rose-400/15 bg-rose-400/[0.06] text-rose-300'
              }`}
            >
              <TrendIcon className="h-2.5 w-2.5" strokeWidth={2.2} />
              {stat.change}
            </span>
          ) : null}
          <span className="text-[9px] font-medium text-slate-600">{stat.comparison}</span>
        </div>
        <span className="text-[9px] font-medium text-slate-700">بيانات حية</span>
      </div>
    </article>
  );
}
