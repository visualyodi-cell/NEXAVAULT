import { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  LogIn,
  LogOut,
  Shield,
  Sliders,
  User,
} from 'lucide-react';
import type { StorageBreakdown, UserPreferences, UserProfile } from '../types/cloud';
import { formatStorageGb } from '../utils/storageMath';

interface SettingsViewProps {
  user: UserProfile;
  storage: StorageBreakdown;
  onSaveProfile: (name: string, prefs: UserPreferences) => Promise<void>;
  onOpenAuthModal: () => void;
  onLogout: () => void;
  onVerifyToken: (token: string) => Promise<void>;
}

export function SettingsView({
  user,
  storage,
  onSaveProfile,
  onOpenAuthModal,
  onLogout,
  onVerifyToken,
}: SettingsViewProps) {
  const [name, setName] = useState(user.name);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    user.preferences?.viewMode || 'grid'
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user.preferences?.notificationsEnabled ?? true
  );
  const [reducedMotion, setReducedMotion] = useState(
    user.preferences?.reducedMotion ?? false
  );
  const [verifyCode, setVerifyCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isDemo = user.uid === 'demo-nexavault-user';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await onSaveProfile(name, {
        viewMode,
        notificationsEnabled,
        reducedMotion,
      });
      setMessage('Pengaturan profil dan tampilan berhasil disimpan.');
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-panel flex flex-1 flex-col rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.12] pb-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-white">
            Pengaturan Akun & Vault
          </h1>
          <p className="mt-0.5 text-xs text-slate-300/80">
            Kelola profil, keamanan autentikasi, notifikasi, dan preferensi
            tampilan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="glass-control inline-flex items-center gap-1.5 rounded-xl border-purple-300/35 bg-purple-500/20 px-3.5 py-2 text-xs font-medium text-purple-100 hover:bg-purple-500/30"
          >
            <LogIn className="h-3.5 w-3.5 text-amber-300" />
            <span>{isDemo ? 'Masuk / Daftar Akun' : 'Ganti Akun'}</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="glass-control inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-100 hover:bg-white/[0.14]"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {message && (
        <div className="mt-4 rounded-xl border border-amber-300/35 bg-amber-400/15 px-4 py-2.5 text-xs text-amber-100">
          {message}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Profile & Display Form */}
        <form
          onSubmit={handleSave}
          className="glass-card space-y-5 rounded-2xl p-5 xl:col-span-7"
        >
          <div className="flex items-center gap-2.5 text-sm font-semibold text-white">
            <User className="h-4 w-4 text-amber-300" />
            <span>Profil Pengguna</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-xs text-slate-300">
              Nama Tampilan
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white focus:border-amber-300 focus:outline-none"
              />
            </label>

            <label className="block text-xs text-slate-300">
              Email Akun
              <input
                type="email"
                readOnly
                value={user.email}
                className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-slate-300"
              />
            </label>
          </div>

          <div className="border-t border-white/[0.1] pt-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Sliders className="h-4 w-4 text-purple-300" />
              <span>Preferensi Tampilan & Notifikasi</span>
            </div>

            <div className="space-y-3">
              <div className="glass-control flex items-center justify-between rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-white">
                    Mode Tampilan Default File
                  </p>
                  <p className="text-[11px] text-slate-300/80">
                    Pilih Grid atau Daftar untuk File Saya
                  </p>
                </div>
                <select
                  aria-label="Mode tampilan default"
                  value={viewMode}
                  onChange={(e) =>
                    setViewMode(e.target.value as 'grid' | 'list')
                  }
                  className="rounded-lg border border-white/15 bg-[#160e2a]/90 px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="grid">Grid</option>
                  <option value="list">Daftar (List)</option>
                </select>
              </div>

              <label className="glass-control flex cursor-pointer items-center justify-between rounded-xl px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Bell className="h-4 w-4 text-amber-300" />
                  <div>
                    <p className="text-xs font-medium text-white">
                      Notifikasi Aktivitas & Upload
                    </p>
                    <p className="text-[11px] text-slate-300/80">
                      Tampilkan konfirmasi saat upload atau berbagi selesai
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={(e) => setNotificationsEnabled(e.target.checked)}
                  className="h-4 w-4 accent-amber-400"
                />
              </label>

              <label className="glass-control flex cursor-pointer items-center justify-between rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-white">
                    Kurangi Gerakan (Reduced Motion)
                  </p>
                  <p className="text-[11px] text-slate-300/80">
                    Hentikan animasi idle robot 3D dan transisi cahaya
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(e) => setReducedMotion(e.target.checked)}
                  className="h-4 w-4 accent-amber-400"
                />
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-amber-400 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </form>

        {/* Right: Security & Quota Card */}
        <div className="space-y-4 xl:col-span-5">
          <div className="glass-card rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Shield className="h-4 w-4 text-emerald-300" />
              <span>Keamanan & Verifikasi</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="glass-control flex items-center justify-between rounded-xl p-3">
                <span className="text-slate-300">Status Email</span>
                {user.emailVerified ? (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Terverifikasi
                  </span>
                ) : (
                  <span className="font-medium text-amber-300">
                    Menunggu Verifikasi
                  </span>
                )}
              </div>

              {!user.emailVerified && (
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
                  <p className="mb-2 text-xs text-amber-200">
                    Masukkan token verifikasi email Anda:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value)}
                      placeholder="Token verifikasi..."
                      className="flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => verifyCode && onVerifyToken(verifyCode)}
                      className="rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-semibold text-slate-950"
                    >
                      Verifikasi
                    </button>
                  </div>
                </div>
              )}

              <div className="glass-control rounded-xl p-3">
                <p className="text-slate-300">Isolasi & Enkripsi Vault</p>
                <p className="mt-1 text-slate-100">
                  Private Vault Bucket · Signed Download URLs (HMAC-SHA256) ·
                  Proteksi Akses Lintas Akun Aktif
                </p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5">
            <h3 className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
              Kuota Penyimpanan Akun
            </h3>
            <p className="mt-2 font-display text-2xl font-bold text-white tabular-nums">
              3.000 GB <span className="text-sm font-normal text-amber-300">(3 TB)</span>
            </p>
            <p className="mt-1 text-xs text-slate-300/80 tabular-nums">
              Terpakai {formatStorageGb(storage.usedBytes)} · Tersedia{' '}
              {formatStorageGb(storage.availableBytes)} · {storage.fileCount} file
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
