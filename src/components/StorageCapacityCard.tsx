import { useEffect, useState } from 'react';
import {
  Archive,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Music,
  Upload,
} from 'lucide-react';
import type { FileCategory, StorageBreakdown } from '../types/cloud';
import { formatStorageGb } from '../utils/storageMath';

interface StorageCapacityCardProps {
  storage: StorageBreakdown;
  onUploadClick: () => void;
  onCategorySelect: (category: FileCategory) => void;
}

const CATEGORY_META: Array<{
  key: FileCategory;
  label: string;
  icon: typeof ImageIcon;
}> = [
  { key: 'photos', label: 'Foto', icon: ImageIcon },
  { key: 'videos', label: 'Video', icon: Film },
  { key: 'documents', label: 'Dokumen', icon: FileText },
  { key: 'audio', label: 'Audio', icon: Music },
  { key: 'archives', label: 'Arsip', icon: Archive },
  { key: 'others', label: 'File lainnya', icon: FolderOpen },
];

export function StorageCapacityCard({
  storage,
  onUploadClick,
  onCategorySelect,
}: StorageCapacityCardProps) {
  const [animatedPercent, setAnimatedPercent] = useState(0);

  const rawPercent = storage.usedPercent;
  const displayRingPercent =
    storage.usedBytes > 0 ? Math.max(2.5, Math.min(100, rawPercent)) : 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAnimatedPercent(displayRingPercent);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [displayRingPercent]);

  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (animatedPercent / 100) * circumference;

  return (
    <aside
      data-testid="storage-capacity-card"
      className="glass-panel flex w-full flex-col justify-between rounded-3xl p-5 lg:sticky lg:top-0 lg:w-[292px] lg:shrink-0 lg:self-start"
    >
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xs font-semibold tracking-[0.18em] text-slate-200 uppercase">
            Storage Capacity
          </h2>
          <span className="font-mono text-[11px] font-medium text-amber-300 tabular-nums">
            3.000 GB
          </span>
        </div>

        {/* Circular Animated Storage Ring */}
        <div className="relative mx-auto my-1 flex h-36 w-36 items-center justify-center">
          <svg
            viewBox="0 0 156 156"
            className="h-full w-full -rotate-90"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="storageArcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FDE047" />
                <stop offset="55%" stopColor="#FACC15" />
                <stop offset="100%" stopColor="#C084FC" />
              </linearGradient>
            </defs>
            <circle
              cx="78"
              cy="78"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="12"
            />
            <circle
              cx="78"
              cy="78"
              r={radius}
              fill="none"
              stroke="url(#storageArcGrad)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-[stroke-dashoffset] duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span
              data-testid="storage-used-label"
              className="font-display text-xl font-semibold text-white tabular-nums"
            >
              {formatStorageGb(storage.usedBytes)}
            </span>
            <span className="mt-0.5 text-[11px] text-slate-300/80 tabular-nums">
              dari 3.000 GB
            </span>
          </div>
        </div>

        {/* Dynamic Summary Row */}
        <div className="mt-2 grid grid-cols-2 gap-2 border-y border-white/[0.12] py-2.5 text-xs">
          <div>
            <p className="text-slate-300/80">Terpakai</p>
            <p className="mt-0.5 font-mono font-medium text-white tabular-nums">
              {formatStorageGb(storage.usedBytes)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-slate-300/80">Tersedia</p>
            <p className="mt-0.5 font-mono font-medium text-purple-200 tabular-nums">
              {formatStorageGb(storage.availableBytes)}
            </p>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="mt-2.5 space-y-0.5">
          {CATEGORY_META.map(({ key, label, icon: Icon }) => {
            const cat = storage.categories[key] || { bytes: 0, count: 0 };
            return (
              <button
                key={key}
                type="button"
                onClick={() => onCategorySelect(key)}
                className="group flex w-full items-center justify-between rounded-2xl px-2.5 py-1.5 text-left transition-all hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="glass-control flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-purple-200 transition-colors group-hover:border-white/30 group-hover:text-amber-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-100">
                      {label}
                    </p>
                    <p className="text-[11px] text-slate-400 tabular-nums">
                      {cat.count} file
                    </p>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-xs font-medium text-slate-100 tabular-nums">
                  {formatStorageGb(cat.bytes)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Upload CTA */}
      <button
        type="button"
        onClick={onUploadClick}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-yellow-300 via-amber-400 to-amber-500 px-4 py-2.5 text-xs font-semibold tracking-wider text-slate-950 uppercase shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_12px_28px_-10px_rgba(250,204,21,0.5)] transition-all hover:brightness-110 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <Upload className="h-4 w-4" />
        <span>Upload File</span>
      </button>
    </aside>
  );
}
