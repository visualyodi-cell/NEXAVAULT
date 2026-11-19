import {
  Activity,
  Clock,
  FolderOpen,
  Home,
  Image,
  Settings,
  Share2,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { NavTab } from '../types/cloud';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  uploadMbps: number;
  downloadMbps: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Beranda', icon: Home },
  { id: 'files', label: 'File Saya', icon: FolderOpen },
  { id: 'media', label: 'Foto & Video', icon: Image },
  { id: 'recent', label: 'Terbaru', icon: Clock },
  { id: 'shared', label: 'Dibagikan', icon: Share2 },
  { id: 'favorites', label: 'Favorit', icon: Star },
  { id: 'trash', label: 'Sampah', icon: Trash2 },
];

const SECONDARY_ITEMS: Array<{ id: NavTab; label: string; icon: typeof Home }> = [
  { id: 'activity', label: 'Aktivitas', icon: Activity },
  { id: 'settings', label: 'Pengaturan', icon: Settings },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  uploadMbps,
  downloadMbps,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const handleSelect = (tab: NavTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="glass-backdrop fixed inset-0 z-40 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Navigasi Utama"
        className={`glass-sidebar max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:overflow-y-auto max-lg:transition-transform max-lg:duration-200 ${
          mobileOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'
        } flex w-[236px] shrink-0 flex-col justify-between px-4 py-5 lg:static lg:h-full lg:rounded-3xl`}
      >
        <div>
          {/* Brand Logo */}
          <div className="mb-7 flex items-center justify-between px-2">
            <button
              type="button"
              onClick={() => handleSelect('home')}
              className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 rounded-lg"
            >
              <span className="block font-display text-base font-bold tracking-[0.14em] text-white whitespace-nowrap">
                NEXAVAULT
              </span>
              <span className="block text-[11px] text-purple-200/80">
                Cloud Universe
              </span>
            </button>

            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Tutup menu navigasi"
              className="rounded-xl p-1.5 text-slate-300 hover:bg-white/[0.1] hover:text-white lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Primary Menu */}
          <nav className="space-y-1">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelect(id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                    active
                      ? 'bg-white/[0.15] text-white border border-amber-300/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_8px_20px_-8px_rgba(250,204,21,0.35)]'
                      : 'text-slate-300/85 hover:bg-white/[0.08] hover:text-white border border-transparent'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      active ? 'text-amber-300' : 'text-purple-300/75'
                    }`}
                  />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>

          <div className="my-5 border-t border-white/[0.12]" />

          {/* Secondary Menu */}
          <nav className="space-y-1">
            {SECONDARY_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelect(id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                    active
                      ? 'bg-white/[0.15] text-white border border-amber-300/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_8px_20px_-8px_rgba(250,204,21,0.35)]'
                      : 'text-slate-300/85 hover:bg-white/[0.08] hover:text-white border border-transparent'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      active ? 'text-amber-300' : 'text-purple-300/75'
                    }`}
                  />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom-left Transfer Throughput Waveforms (matching reference layout) */}
        <div className="mt-6 space-y-4 border-t border-white/[0.12] pt-4">
          <div className="text-center">
            <svg viewBox="0 0 140 32" className="mx-auto h-7 w-32" aria-hidden="true">
              <defs>
                <linearGradient id="upWave" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#A855F7" stopOpacity="0.15" />
                  <stop offset="50%" stopColor="#FACC15" stopOpacity="1" />
                  <stop offset="100%" stopColor="#A855F7" stopOpacity="0.15" />
                </linearGradient>
              </defs>
              <path
                d="M 4 18 Q 36 4, 70 16 T 136 14"
                fill="none"
                stroke="url(#upWave)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <p className="text-[11px] text-slate-300/80">Upload</p>
            <p className="font-mono text-sm font-semibold text-white tabular-nums">
              {uploadMbps.toFixed(2)}{' '}
              <span className="text-[10px] font-normal text-slate-300/75">Mbps</span>
            </p>
          </div>

          <div className="text-center">
            <svg viewBox="0 0 140 32" className="mx-auto h-7 w-32" aria-hidden="true">
              <defs>
                <linearGradient id="downWave" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FACC15" stopOpacity="0.15" />
                  <stop offset="50%" stopColor="#C084FC" stopOpacity="1" />
                  <stop offset="100%" stopColor="#FACC15" stopOpacity="0.15" />
                </linearGradient>
              </defs>
              <path
                d="M 4 14 Q 38 26, 70 14 T 136 18"
                fill="none"
                stroke="url(#downWave)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <p className="text-[11px] text-slate-300/80">Download</p>
            <p className="font-mono text-sm font-semibold text-white tabular-nums">
              {downloadMbps.toFixed(2)}{' '}
              <span className="text-[10px] font-normal text-slate-300/75">Mbps</span>
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
