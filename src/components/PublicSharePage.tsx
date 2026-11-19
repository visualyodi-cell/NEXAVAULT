import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Download,
  FileText,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { fetchPublicShare, unlockPublicShare } from '../api/client';
import type { CloudFile } from '../types/cloud';
import { formatBytes } from '../utils/storageMath';
import { NovaParticlesField } from './NovaParticlesField';

interface PublicSharePageProps {
  token: string;
  onExit: () => void;
}

export function PublicSharePage({ token, onExit }: PublicSharePageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareMeta, setShareMeta] = useState<{
    permission: 'viewer' | 'downloader';
    requiresPassword: boolean;
    expiresAt: string | null;
    downloadCount: number;
    ownerName: string;
    file: CloudFile;
    contentUrl: string | null;
  } | null>(null);
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPublicShare(token)
      .then((res) => setShareMeta(res))
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : 'Tautan berbagi tidak ditemukan.'
        )
      )
      .finally(() => setLoading(false));
  }, [token]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    try {
      const res = await unlockPublicShare(token, password);
      setShareMeta((prev) =>
        prev
          ? { ...prev, requiresPassword: false, contentUrl: res.contentUrl }
          : prev
      );
    } catch (err) {
      setUnlockError(
        err instanceof Error ? err.message : 'Kata sandi salah.'
      );
    }
  };

  const downloadHref = shareMeta?.contentUrl
    ? `${shareMeta.contentUrl}${
        shareMeta.contentUrl.includes('?') ? '&' : '?'
      }download=1`
    : '';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#090614] p-5 text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -left-24 -top-24 h-[460px] w-[460px] rounded-full bg-purple-600/30 blur-[130px]" />
        <div className="absolute -bottom-24 -right-24 h-[460px] w-[460px] rounded-full bg-amber-400/20 blur-[130px]" />
      </div>
      <NovaParticlesField />

      <div className="glass-modal relative z-30 w-full max-w-2xl rounded-3xl p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between border-b border-white/[0.12] pb-4">
          <div>
            <span className="font-display text-sm font-bold tracking-[0.16em] text-white">
              NEXAVAULT
            </span>
            <p className="text-xs text-slate-300/80">
              Berbagi File Terenkripsi
            </p>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="glass-control inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200 hover:bg-white/[0.14] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Ke NEXAVAULT</span>
          </button>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-slate-300">
            Memuat berkas yang dibagikan...
          </p>
        ) : error ? (
          <div className="py-10 text-center">
            <p className="font-display text-base font-semibold text-rose-300">
              {error}
            </p>
            <button
              type="button"
              onClick={onExit}
              className="mt-4 rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
            >
              Kembali ke Beranda
            </button>
          </div>
        ) : shareMeta ? (
          <div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="glass-control flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-purple-300/35 bg-purple-500/20 text-purple-200">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate font-display text-lg font-semibold text-white">
                    {shareMeta.file.name}
                  </h1>
                  <p className="text-xs text-slate-300/80 tabular-nums">
                    Dibagikan oleh {shareMeta.ownerName} ·{' '}
                    {formatBytes(shareMeta.file.sizeBytes)} ·{' '}
                    {shareMeta.downloadCount} unduhan
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 text-xs text-amber-300">
                <ShieldCheck className="h-4 w-4" />
                <span>
                  {shareMeta.permission === 'viewer'
                    ? 'Mode Viewer'
                    : 'Bisa Diunduh'}
                </span>
              </span>
            </div>

            {shareMeta.requiresPassword ? (
              <form
                onSubmit={handleUnlock}
                className="glass-card rounded-2xl p-5"
              >
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                  <Lock className="h-4 w-4 text-amber-300" />
                  <span>File ini dilindungi kata sandi</span>
                </div>
                {unlockError && (
                  <p className="mb-2 text-xs text-rose-300">{unlockError}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi..."
                    className="flex-1 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-amber-300 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
                  >
                    Buka File
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                {shareMeta.contentUrl &&
                  shareMeta.file.mimeType.startsWith('image/') && (
                    <div className="glass-card overflow-hidden rounded-2xl p-3 text-center">
                      <img
                        src={shareMeta.contentUrl}
                        alt={shareMeta.file.name}
                        referrerPolicy="no-referrer"
                        className="mx-auto max-h-80 rounded-lg object-contain"
                      />
                    </div>
                  )}

                {shareMeta.contentUrl &&
                  shareMeta.file.mimeType === 'application/pdf' && (
                    <iframe
                      src={shareMeta.contentUrl}
                      title={shareMeta.file.name}
                      className="h-80 w-full rounded-xl border border-white/10 bg-white"
                    />
                  )}

                {shareMeta.permission === 'downloader' && shareMeta.contentUrl && (
                  <a
                    href={downloadHref}
                    download={shareMeta.file.name}
                    onClick={() =>
                      setShareMeta((prev) =>
                        prev
                          ? { ...prev, downloadCount: prev.downloadCount + 1 }
                          : prev
                      )
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-yellow-300 via-amber-400 to-purple-400 px-5 py-3 text-xs font-semibold text-slate-950 hover:brightness-110"
                  >
                    <Download className="h-4 w-4" />
                    <span>Unduh {shareMeta.file.name}</span>
                  </a>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
