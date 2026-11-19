import { useState } from 'react';
import {
  Ban,
  Check,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Lock,
  Share2,
  Users,
} from 'lucide-react';
import type { ShareRecord } from '../types/cloud';
import { formatBytes } from '../utils/storageMath';

interface SharedViewProps {
  ownedShares: ShareRecord[];
  sharedWithMe: ShareRecord[];
  loading: boolean;
  onRevokeShare: (shareId: number) => Promise<void>;
  onOpenSharePage: (token: string) => void;
}

export function SharedView({
  ownedShares,
  sharedWithMe,
  loading,
  onRevokeShare,
  onOpenSharePage,
}: SharedViewProps) {
  const [tab, setTab] = useState<'owned' | 'incoming'>('owned');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleCopy = async (id: number, token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    await navigator.clipboard?.writeText(url);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1600);
  };

  return (
    <div className="glass-panel flex flex-1 flex-col rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.12] pb-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-white">
            Dibagikan
          </h1>
          <p className="mt-0.5 text-xs text-slate-300/80">
            Kelola tautan publik yang Anda buat dan file yang dibagikan kepada
            Anda.
          </p>
        </div>

        <div className="glass-control flex items-center gap-1 rounded-2xl p-1">
          <button
            type="button"
            onClick={() => setTab('owned')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
              tab === 'owned'
                ? 'bg-white/[0.16] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]'
                : 'text-slate-300/80 hover:text-white'
            }`}
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Tautan Saya ({ownedShares.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('incoming')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
              tab === 'incoming'
                ? 'bg-white/[0.16] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]'
                : 'text-slate-300/80 hover:text-white'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Dibagikan ke Saya ({sharedWithMe.length})</span>
          </button>
        </div>
      </div>

      <div className="mt-5 flex-1">
        {loading ? (
          <p className="text-xs text-slate-300/80">Memuat data berbagi...</p>
        ) : tab === 'owned' ? (
          ownedShares.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
              <Link2 className="mb-2 h-8 w-8 text-slate-400" />
              <p className="text-sm font-medium text-slate-100">
                Belum ada tautan berbagi yang dibuat
              </p>
              <p className="mt-1 text-xs text-slate-300/80">
                Buka File Saya lalu klik ikon Bagikan pada file mana pun.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ownedShares.map((s) => (
                <div
                  key={s.id}
                  className="glass-card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-white">
                        {s.file.name}
                      </p>
                      {s.hasPassword && (
                        <Lock className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-300/80 tabular-nums">
                      {formatBytes(s.file.sizeBytes)} ·{' '}
                      {s.permission === 'viewer' ? 'Viewer' : 'Downloader'} ·{' '}
                      {s.downloadCount} unduhan ·{' '}
                      {s.isRevoked ? 'Dicabut' : 'Aktif'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!s.isRevoked && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCopy(s.id, s.token)}
                          className="glass-control inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs text-slate-100 hover:bg-white/[0.14]"
                        >
                          {copiedId === s.id ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-300" />
                              <span>Disalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Salin Link</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenSharePage(s.token)}
                          className="glass-control inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs text-amber-300 hover:bg-white/[0.14]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Buka</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRevokeShare(s.id)}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-400/25 bg-rose-500/15 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-500/25"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          <span>Cabut</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : sharedWithMe.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
            <Users className="mb-2 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-100">
              Belum ada file yang dibagikan kepada Anda
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sharedWithMe.map((s) => (
              <div
                key={s.id}
                className="glass-card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {s.file.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-300/80 tabular-nums">
                    Dari {s.ownerName} ({s.ownerEmail}) ·{' '}
                    {formatBytes(s.file.sizeBytes)}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenSharePage(s.token)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Buka & Unduh</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
