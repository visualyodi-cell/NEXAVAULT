import { useState } from 'react';
import { Check, Copy, Link2, Lock, Share2, X } from 'lucide-react';
import type { CloudFile, ShareRecord } from '../types/cloud';
import { createShareApi } from '../api/client';

interface ShareModalProps {
  file: CloudFile | null;
  onClose: () => void;
  onCreated: (share: ShareRecord) => void;
}

export function ShareModal({ file, onClose, onCreated }: ShareModalProps) {
  const [permission, setPermission] = useState<'viewer' | 'downloader'>(
    'downloader'
  );
  const [password, setPassword] = useState('');
  const [expiresDays, setExpiresDays] = useState<string>('never');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdShare, setCreatedShare] = useState<ShareRecord | null>(null);
  const [copied, setCopied] = useState(false);

  if (!file) return null;

  const shareUrl = createdShare
    ? `${window.location.origin}/share/${createdShare.token}`
    : '';

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let expiresAt: string | null = null;
      if (expiresDays !== 'never') {
        const d = new Date(
          Date.now() + Number(expiresDays) * 24 * 60 * 60 * 1000
        );
        expiresAt = d.toISOString();
      }
      const res = await createShareApi({
        fileId: file.id,
        permission,
        password: password.trim() || undefined,
        expiresAt,
        sharedWithEmail: recipientEmail.trim() || undefined,
      });
      setCreatedShare(res.share);
      onCreated(res.share);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal membuat tautan berbagi.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Bagikan ${file.name}`}
      className="glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="glass-modal w-full max-w-md rounded-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
              <Share2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-white">
                Bagikan File
              </h2>
              <p className="truncate text-xs text-slate-400">{file.name}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal bagikan"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {createdShare ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-xs text-emerald-200">
              Tautan berbagi publik berhasil dibuat dan siap dibagikan.
            </div>

            <div className="glass-control flex items-center gap-2 rounded-xl p-2">
              <Link2 className="ml-1 h-4 w-4 shrink-0 text-amber-300" />
              <input
                type="text"
                readOnly
                value={shareUrl}
                aria-label="Tautan berbagi publik"
                className="flex-1 bg-transparent font-mono text-xs text-slate-200 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Disalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Salin Link</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Izin: {createdShare.permission === 'viewer' ? 'Viewer' : 'Downloader'}
              </span>
              <span>
                {createdShare.hasPassword ? 'Dilindungi kata sandi' : 'Tanpa kata sandi'}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <a
                href={`/share/${createdShare.token}`}
                target="_self"
                className="rounded-xl border border-white/12 px-3.5 py-2 text-xs text-slate-200 hover:bg-white/[0.06]"
              >
                Buka Halaman Share
              </a>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/15"
              >
                Selesai
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleGenerate} className="space-y-3.5">
            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300">
                Izin Akses
              </label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPermission('downloader')}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                    permission === 'downloader'
                      ? 'border-amber-300/70 bg-amber-400/18 text-amber-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-400'
                  }`}
                >
                  Viewer & Downloader
                </button>
                <button
                  type="button"
                  onClick={() => setPermission('viewer')}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                    permission === 'viewer'
                      ? 'border-amber-300/70 bg-amber-400/18 text-amber-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-400'
                  }`}
                >
                  Hanya Lihat (Viewer)
                </button>
              </div>
            </div>

            <label className="block text-xs font-medium text-slate-300">
              Kata Sandi Opsional
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kosongkan jika link terbuka"
                  className="w-full rounded-xl border border-white/15 bg-white/[0.06] py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-400 focus:border-amber-300 focus:outline-none"
                />
              </div>
            </label>

            <label className="block text-xs font-medium text-slate-300">
              Masa Berlaku
              <select
                value={expiresDays}
                onChange={(e) => setExpiresDays(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#160e2a]/90 px-3 py-2 text-xs text-white focus:border-amber-300 focus:outline-none"
              >
                <option value="never">Tanpa batas waktu</option>
                <option value="1">1 Hari</option>
                <option value="7">7 Hari</option>
                <option value="30">30 Hari</option>
              </select>
            </label>

            <label className="block text-xs font-medium text-slate-300">
              Bagikan langsung ke email (opsional)
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="rekan@nexavault.cloud"
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs text-white placeholder:text-slate-400 focus:border-amber-300 focus:outline-none"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs text-slate-300 hover:bg-white/[0.06]"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-gradient-to-r from-yellow-300 via-amber-400 to-purple-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
              >
                {submitting ? 'Membuat Link...' : 'Generate Link'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
