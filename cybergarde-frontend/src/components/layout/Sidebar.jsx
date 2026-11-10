import {
  ArrowUpLeft,
  BellRing,
  LayoutDashboard,
  Router,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import CyberGardeMark from '../CyberGardeMark.jsx';

const navigation = [
  {
    label: 'لوحة التحكم',
    href: '#dashboard',
    icon: LayoutDashboard,
    active: true,
  },
  {
    label: 'الأجهزة',
    href: '#devices',
    icon: Router,
    count: '128',
  },
  {
    label: 'التنبيهات',
    href: '#alerts',
    icon: BellRing,
    count: '3',
    alert: true,
  },
  {
    label: 'الإعدادات',
    href: '#settings',
    icon: Settings,
  },
];

export default function Sidebar({ open, onClose }) {
  return (
    <>
      <button
        type="button"
        aria-label="إغلاق القائمة الجانبية"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-ink-950/80 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-[280px] flex-col border-l border-white/[0.06] bg-[#030a12]/95 shadow-[-30px_0_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl transition-transform duration-300 ease-out lg:translate-x-0 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="القائمة الرئيسية"
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-cyan-400/25 to-transparent" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/[0.06] blur-3xl" />

        <div className="relative flex items-center justify-between border-b border-white/[0.055] px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-400/[0.055] shadow-glow-cyan">
              <CyberGardeMark className="h-8 w-8" />
              <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/[0.04]" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-[17px] font-extrabold leading-none tracking-tight text-white">
                CYBER <span className="text-cyan-300">GARDE</span>
              </p>
              <p className="mt-1.5 text-[10px] font-medium text-slate-500">مركز العمليات الأمنية</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="icon-button h-8 w-8 rounded-lg lg:hidden"
            aria-label="إغلاق القائمة"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 no-scrollbar">
          <div className="mb-3 flex items-center justify-between px-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-600">
              القائمة الرئيسية
            </p>
            <span className="h-1 w-1 rounded-full bg-cyan-400/50" />
          </div>

          <nav className="space-y-1.5">
            {navigation.map((item) => {
              const Icon = item.icon;

              return (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={onClose}
                  aria-current={item.active ? 'page' : undefined}
                  className={`nav-item group ${item.active ? 'nav-item-active' : ''}`}
                >
                  {item.active && (
                    <>
                      <span className="absolute inset-y-2.5 right-0 w-[2px] rounded-full bg-cyan-300 shadow-[0_0_12px_2px_rgba(34,211,238,0.55)]" />
                      <span className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-cyan-400/[0.06] to-transparent" />
                    </>
                  )}

                  <span
                    className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors ${
                      item.active
                        ? 'border-cyan-300/20 bg-cyan-400/[0.09] text-cyan-300'
                        : 'border-white/[0.05] bg-white/[0.02] text-slate-500 group-hover:border-white/10 group-hover:text-slate-300'
                    }`}
                  >
                    <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
                  </span>

                  <span className="flex-1 text-right">{item.label}</span>

                  {item.count && (
                    <span
                      className={`grid h-5 min-w-5 place-items-center rounded-md border px-1.5 text-[10px] font-bold tabular ${
                        item.alert
                          ? 'border-rose-400/20 bg-rose-400/10 text-rose-300'
                          : 'border-white/[0.06] bg-white/[0.03] text-slate-500'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}

                  {item.active && <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_2px_rgba(34,211,238,0.55)]" />}
                </a>
              );
            })}
          </nav>

          <div className="my-6 h-px glow-divider" />

          <div className="rounded-2xl border border-emerald-400/[0.13] bg-emerald-400/[0.035] p-4">
            <div className="flex items-center gap-3">
              <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-300">
                <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.8} />
                <span className="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-[#041019] bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.9)]" />
              </span>
              <div>
                <p className="text-xs font-bold text-emerald-200">درع الحماية</p>
                <p className="mt-1 text-[10px] text-slate-500">حماية متعددة الطبقات</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-[9px] font-medium">
              <span className="text-slate-500">مستوى التأمين</span>
              <span className="text-emerald-300">98%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.055]">
              <div className="h-full w-[98%] rounded-full bg-gradient-to-l from-emerald-400 via-emerald-400 to-cyan-400 shadow-[0_0_10px_rgba(74,222,128,0.6)]" />
            </div>

            <p className="mt-3 flex items-center gap-1.5 text-[9px] leading-4 text-slate-600">
              <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-400/80" />
              قاعدة التهديدات محدّثة قبل 4 دقائق
            </p>
          </div>

          <button
            type="button"
            className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/[0.045] bg-white/[0.018] px-4 py-3 text-[10px] font-medium text-slate-500 transition-colors hover:border-cyan-300/15 hover:text-slate-300"
          >
            <span>مركز الثقة والأمان</span>
            <ArrowUpLeft className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="safe-bottom border-t border-white/[0.055] px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[9px] font-medium text-slate-500">متصل بإدارة الحماية</span>
            </div>
            <span className="font-mono text-[9px] text-slate-700" dir="ltr">
              v2.4.1
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
