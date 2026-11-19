import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

export type ToastTone = 'info' | 'error' | 'delete' | 'danger' | 'success';

export interface ToastState {
  id: number;
  title?: string;
  message: string;
  tone: ToastTone;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => Promise<void> | void;
}

interface ToastBannerProps {
  toast: ToastState | null;
  onDismiss: () => void;
}

export function ToastBanner({ toast, onDismiss }: ToastBannerProps) {
  const [actionBusy, setActionBusy] = useState(false);

  if (!toast) return null;

  const toneStyles: Record<
    ToastTone,
    {
      border: string;
      badgeBg: string;
      iconColor: string;
      barColor: string;
      defaultTitle: string;
    }
  > = {
    delete: {
      border:
        'border-amber-300/45 shadow-[0_18px_48px_-14px_rgba(244,63,94,0.42)]',
      badgeBg: 'border-rose-400/35 bg-rose-500/20',
      iconColor: 'text-amber-300',
      barColor: 'from-amber-300 via-rose-400 to-purple-400',
      defaultTitle: 'Dipindahkan ke Sampah',
    },
    danger: {
      border:
        'border-rose-400/50 shadow-[0_18px_48px_-14px_rgba(244,63,94,0.5)]',
      badgeBg: 'border-rose-400/40 bg-rose-500/25',
      iconColor: 'text-rose-300',
      barColor: 'from-rose-400 to-amber-300',
      defaultTitle: 'Dihapus Permanen',
    },
    success: {
      border:
        'border-emerald-400/40 shadow-[0_18px_48px_-14px_rgba(16,185,129,0.35)]',
      badgeBg: 'border-emerald-400/35 bg-emerald-500/20',
      iconColor: 'text-emerald-300',
      barColor: 'from-emerald-400 to-amber-300',
      defaultTitle: 'Berhasil',
    },
    error: {
      border:
        'border-rose-400/50 shadow-[0_18px_48px_-14px_rgba(244,63,94,0.45)]',
      badgeBg: 'border-rose-400/35 bg-rose-500/20',
      iconColor: 'text-rose-300',
      barColor: 'from-rose-400 to-purple-400',
      defaultTitle: 'Terjadi Kesalahan',
    },
    info: {
      border:
        'border-purple-300/35 shadow-[0_18px_48px_-14px_rgba(168,85,247,0.4)]',
      badgeBg: 'border-purple-400/30 bg-purple-500/20',
      iconColor: 'text-amber-300',
      barColor: 'from-purple-400 to-amber-300',
      defaultTitle: 'Notifikasi Vault',
    },
  };

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex max-w-sm flex-col items-end gap-2">
      <div
        key={toast.id}
        role="status"
        aria-live="polite"
        data-testid="vault-toast"
        data-tone={toast.tone}
        className={`glass-modal animate-toast-in pointer-events-auto relative w-full overflow-hidden rounded-2xl p-3.5 text-xs ${
          toneStyles[toast.tone].border
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
              toneStyles[toast.tone].badgeBg
            } ${toneStyles[toast.tone].iconColor}`}
          >
            {toast.tone === 'delete' || toast.tone === 'danger' ? (
              <Trash2
                className={`h-4 w-4 ${
                  toast.tone === 'delete' ? 'animate-bounce' : ''
                }`}
              />
            ) : toast.tone === 'success' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : toast.tone === 'error' ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </div>

          <div className="min-w-0 flex-1 pr-1">
            <p className="font-display text-xs font-semibold text-white">
              {toast.title || toneStyles[toast.tone].defaultTitle}
            </p>
            <p className="mt-0.5 leading-relaxed text-slate-200/90">
              {toast.message}
            </p>

            {toast.actionLabel && toast.onAction && (
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={async () => {
                    if (!toast.onAction || actionBusy) return;
                    setActionBusy(true);
                    try {
                      await toast.onAction();
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/40 bg-amber-400/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-400/30 disabled:opacity-50"
                >
                  {actionBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  <span>{toast.actionLabel}</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Tutup pemberitahuan"
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Shrinking countdown bar */}
        <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className={`animate-toast-progress h-full w-full origin-left bg-gradient-to-r ${
              toneStyles[toast.tone].barColor
            }`}
            style={{
              animationDuration: `${toast.durationMs ?? 4500}ms`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
