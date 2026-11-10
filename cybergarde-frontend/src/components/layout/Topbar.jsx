import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  Clock3,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import CyberGardeMark from '../CyberGardeMark.jsx';

function SearchField({ value, onChange, inputRef, className = '' }) {
  return (
    <div className={`group relative ${className}`}>
      <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-cyan-300" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="ابحث عن جهاز، عنوان IP، أو تهديد..."
        aria-label="البحث في الشبكة"
        aria-keyshortcuts="Control+K Meta+K"
        className="h-10 w-full rounded-xl border border-white/[0.07] bg-white/[0.03] pe-4 ps-10 text-xs font-medium text-slate-200 outline-none transition-all duration-200 placeholder:text-slate-600 hover:border-white/[0.12] focus:border-cyan-300/30 focus:bg-cyan-400/[0.035] focus:ring-2 focus:ring-cyan-300/10 sm:pe-16"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="مسح البحث"
          className="absolute left-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.08] hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute left-3 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-white/[0.08] bg-white/[0.035] px-1.5 py-0.5 font-mono text-[9px] text-slate-600 sm:flex">
          ⌘ K
        </kbd>
      )}
    </div>
  );
}

export default function Topbar({ query, onQueryChange, onMenuClick }) {
  const [clock, setClock] = useState(() => new Date());
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }

      if (event.key === 'Escape') {
        searchRef.current?.blur();
        setProfileOpen(false);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!profileOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (!profileRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [profileOpen]);

  const currentTime = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(clock);

  const currentDate = new Intl.DateTimeFormat('ar-EG-u-ca-gregory-nu-latn', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(clock);

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.055] bg-[#02070d]/80 backdrop-blur-2xl">
      <div className="flex h-[72px] items-center gap-3 px-4 sm:px-6 xl:px-8">
        <button
          type="button"
          onClick={onMenuClick}
          className="icon-button h-9 w-9 rounded-lg lg:hidden"
          aria-label="فتح القائمة الرئيسية"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>

        <a href="#dashboard" className="flex items-center gap-2.5 lg:hidden" aria-label="Cyber Garde">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-400/[0.06]">
            <CyberGardeMark className="h-6 w-6" />
          </span>
          <span className="font-display text-sm font-extrabold text-white">
            CYBER <span className="text-cyan-300">GARDE</span>
          </span>
        </a>

        <SearchField
          value={query}
          onChange={onQueryChange}
          inputRef={searchRef}
          className="hidden max-w-[390px] flex-1 lg:block"
        />

        <div className="ms-auto flex items-center gap-2 sm:gap-2.5">
          <div className="hidden items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 2xl:flex">
            <Clock3 className="h-4 w-4 text-slate-600" />
            <div className="border-r border-white/[0.07] pr-2.5">
              <p className="text-[9px] font-medium leading-none text-slate-600">التوقيت المحلي</p>
              <p className="mt-1 flex items-center gap-2 text-[11px] font-bold leading-none text-slate-300" dir="ltr">
                <span className="font-mono tabular">{currentTime}</span>
                <span className="h-2.5 w-px bg-white/10" />
                <span className="font-sans text-[9px] font-medium text-slate-500" dir="rtl">
                  {currentDate}
                </span>
              </p>
            </div>
          </div>

          <div
            className="relative hidden items-center gap-2.5 overflow-hidden rounded-xl border border-emerald-400/20 bg-emerald-400/[0.055] px-3.5 py-2 shadow-[0_0_26px_-10px_rgba(74,222,128,0.55)] sm:flex"
            role="status"
            aria-label="حالة النظام: نشط"
          >
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-l from-emerald-400/[0.04] to-transparent" />
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-55" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_9px_2px_rgba(74,222,128,0.45)]" />
            </span>
            <div className="relative">
              <p className="text-[8px] font-bold leading-none tracking-wide text-emerald-300/55">
                حالة النظام
              </p>
              <p className="mt-1 text-[11px] font-extrabold leading-none text-emerald-300">نشط</p>
            </div>
          </div>

          <button type="button" className="icon-button relative" aria-label="التنبيهات — 3 تنبيهات جديدة">
            <Bell className="h-[17px] w-[17px]" />
            <span className="absolute -left-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border border-[#02070d] bg-rose-500 px-1 font-mono text-[8px] font-bold text-white shadow-[0_0_12px_rgba(251,113,133,0.55)]">
              3
            </span>
          </button>

          <div className="mx-0.5 hidden h-7 w-px bg-white/[0.065] sm:block" />

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((current) => !current)}
              className="group flex items-center gap-2.5 rounded-xl border border-transparent p-1 transition-colors hover:border-white/[0.06] hover:bg-white/[0.025] sm:pe-2"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              aria-label="قائمة حساب المستخدم"
            >
              <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-cyan-300/20 bg-gradient-to-br from-cyan-400/25 via-teal-400/15 to-emerald-400/20 text-sm font-extrabold text-cyan-100 shadow-[0_0_20px_-7px_rgba(34,211,238,0.65)]">
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_60%)]" />
                <span className="relative font-display">أ</span>
              </span>

              <span className="hidden text-right xl:block">
                <span className="block text-[11px] font-bold leading-tight text-slate-200">
                  أحمد الغامدي
                </span>
                <span className="mt-1 block text-[9px] leading-tight text-slate-600">
                  مدير الأمن السيبراني
                </span>
              </span>

              <ChevronDown
                className={`hidden h-3.5 w-3.5 text-slate-600 transition-transform duration-200 xl:block ${
                  profileOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {profileOpen && (
              <div
                role="menu"
                className="absolute left-0 top-[calc(100%+10px)] z-50 w-60 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#07111b]/[0.98] p-2 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
              >
                <div className="mb-1 flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-400/25 to-emerald-400/20 text-sm font-extrabold text-cyan-100">
                    أ
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold text-slate-200">أحمد الغامدي</p>
                    <p className="mt-1 text-[9px] text-slate-600">الحساب المؤسسي</p>
                  </div>
                  <span className="ms-auto h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_7px_rgba(74,222,128,0.8)]" />
                </div>

                <div className="py-1">
                  {[
                    { label: 'الملف الشخصي', icon: UserRound },
                    { label: 'إعدادات الحساب', icon: Settings },
                    { label: 'سجل الأمان', icon: ShieldCheck },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        onClick={() => setProfileOpen(false)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-right text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-100"
                      >
                        <Icon className="h-3.5 w-3.5 text-slate-600" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <div className="my-1 h-px bg-white/[0.06]" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setProfileOpen(false)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-right text-[11px] font-medium text-rose-300/80 transition-colors hover:bg-rose-400/[0.07] hover:text-rose-300"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  تسجيل الخروج
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-3 lg:hidden">
        <SearchField value={query} onChange={onQueryChange} className="w-full" />
      </div>
    </header>
  );
}
