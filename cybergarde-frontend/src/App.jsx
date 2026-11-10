import { useCallback, useEffect, useMemo, useState } from 'react';
import { Settings, ShieldCheck } from 'lucide-react';
import Sidebar from './components/layout/Sidebar.jsx';
import Topbar from './components/layout/Topbar.jsx';
import DashboardHeader from './components/dashboard/DashboardHeader.jsx';
import StatCard from './components/dashboard/StatCard.jsx';
import TrafficChart from './components/dashboard/TrafficChart.jsx';
import NetworkHealth from './components/dashboard/NetworkHealth.jsx';
import DeviceTable from './components/dashboard/DeviceTable.jsx';
import ThreatIntel from './components/dashboard/ThreatIntel.jsx';
import ComplianceReportModal from './components/dashboard/ComplianceReportModal.jsx';
import { stats } from './data/dashboard.js';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [lastSync, setLastSync] = useState(() => new Date());
  const [threatCount, setThreatCount] = useState(null);
  const [complianceOpen, setComplianceOpen] = useState(false);

  const openComplianceReport = useCallback(() => {
    setComplianceOpen(true);
  }, []);

  const closeComplianceReport = useCallback(() => {
    setComplianceOpen(false);
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [sidebarOpen]);

  const dashboardStats = useMemo(
    () =>
      stats.map((stat) => {
        if (stat.id !== 'threats') return stat;

        const value = threatCount === null
          ? '—'
          : String(threatCount).padStart(2, '0');
        const detail = threatCount === null
          ? 'جارٍ جلب التهديدات من الخادم'
          : threatCount === 0
            ? 'لا توجد تهديدات مكتشفة حاليًا'
            : `${threatCount} تهديدًا بحاجة إلى مراجعة`;

        return { ...stat, value, detail };
      }),
    [threatCount],
  );

  return (
    <div className="app-backdrop relative min-h-screen overflow-x-hidden">
      <a
        href="#main-content"
        className="fixed right-4 top-4 z-[70] -translate-y-24 rounded-lg border border-cyan-300/30 bg-[#07111b] px-4 py-2 text-xs font-bold text-cyan-200 transition-transform focus:translate-y-0"
      >
        انتقل إلى المحتوى
      </a>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="relative z-10 min-h-screen lg:mr-[280px]">
        <Topbar
          query={query}
          onQueryChange={setQuery}
          onMenuClick={() => setSidebarOpen(true)}
        />

        <main
          id="main-content"
          className="mx-auto w-full max-w-[1540px] px-4 pb-8 pt-6 sm:px-6 xl:px-8"
        >
          <DashboardHeader
            lastSync={lastSync}
            onRefresh={() => setLastSync(new Date())}
            onOpenComplianceReport={openComplianceReport}
          />

          <section aria-labelledby="network-overview-heading">
            <h2 id="network-overview-heading" className="sr-only">
              ملخص حالة الشبكة
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {dashboardStats.map((stat, index) => (
                <StatCard key={stat.id} stat={stat} index={index} />
              ))}
            </div>
          </section>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <TrafficChart />
            </div>
            <NetworkHealth />
          </div>

          <div className="mt-4">
            <DeviceTable query={query} onClearSearch={() => setQuery('')} />
          </div>

          <div className="mt-4">
            <ThreatIntel onThreatCountChange={setThreatCount} />
          </div>

          <footer
            id="settings"
            className="mt-6 flex flex-col gap-4 border-t border-white/[0.055] pt-5 text-[9px] font-medium text-slate-600 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md border border-emerald-400/10 bg-emerald-400/[0.04] text-emerald-400/75">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="font-bold text-slate-400">Cyber Garde</span> — منصة مراقبة أمن الشبكة
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="inline-flex items-center gap-1.5">
                <Settings className="h-3 w-3" />
                تفضيلات المراقبة: قياسية
              </span>
              <span className="hidden h-3 w-px bg-white/10 sm:block" />
              <span className="font-mono text-slate-700" dir="ltr">
                v2.4.1
              </span>
              <span className="hidden h-3 w-px bg-white/10 sm:block" />
              <span>© 2026 جميع الحقوق محفوظة</span>
            </div>
          </footer>
        </main>
      </div>

      <ComplianceReportModal
        open={complianceOpen}
        onClose={closeComplianceReport}
      />
    </div>
  );
}
