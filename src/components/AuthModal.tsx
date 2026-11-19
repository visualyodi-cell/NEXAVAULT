import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { KeyRound, Lock, Mail, ShieldCheck, User, X } from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import {
  forgotPassword,
  loginAccount,
  registerAccount,
  resetPassword,
  syncFirebaseUser,
  verifyEmail,
} from '../api/client';
import type { StorageBreakdown, UserProfile } from '../types/cloud';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (user: UserProfile, storage: StorageBreakdown) => void;
  onUseDemo: () => Promise<void>;
}

type AuthTab = 'login' | 'register' | 'forgot';

export function AuthModal({
  open,
  onClose,
  onAuthenticated,
  onUseDemo,
}: AuthModalProps) {
  const [tab, setTab] = useState<AuthTab>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [generatedTokenHint, setGeneratedTokenHint] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const res = await syncFirebaseUser(idToken);
      onAuthenticated(res.user, res.storage);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Login Google dibatalkan atau gagal.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await loginAccount({ email, password });
      onAuthenticated(res.user, res.storage);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await registerAccount({ name, email, password });
      if (res.verificationToken) {
        // Automatically verify or display verification confirmation
        await verifyEmail(res.verificationToken);
        res.user.emailVerified = true;
      }
      onAuthenticated(res.user, res.storage);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mendaftar.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await forgotPassword(email);
      setInfo(res.message);
      if (res.resetToken) {
        setGeneratedTokenHint(res.resetToken);
        setResetTokenInput(res.resetToken);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal memproses lupa sandi.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await resetPassword(resetTokenInput, newPassword);
      setInfo(res.message);
      setTab('login');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal memperbarui kata sandi.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Autentikasi NEXAVAULT"
      className="glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="glass-modal w-full max-w-md rounded-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Akun NEXAVAULT 3 TB
            </h2>
            <p className="text-xs text-slate-400">
              Ruang pribadi terenkripsi dengan kuota 3.000 GB
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog akun"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Google Sign-In */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.12] disabled:opacity-50"
        >
          <ShieldCheck className="h-4 w-4 text-amber-300" />
          <span>Masuk dengan Google</span>
        </button>

        <div className="my-4 flex items-center gap-3 text-[11px] text-slate-500">
          <div className="h-px flex-1 bg-white/[0.08]" />
          <span>atau gunakan email</span>
          <div className="h-px flex-1 bg-white/[0.08]" />
        </div>

        {/* Tabs */}
        <div className="glass-control mb-4 grid grid-cols-3 gap-1 rounded-2xl p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setError(null);
            }}
            className={`rounded-lg py-1.5 font-medium ${
              tab === 'login'
                ? 'bg-amber-400/20 text-amber-300'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Masuk
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setError(null);
            }}
            className={`rounded-lg py-1.5 font-medium ${
              tab === 'register'
                ? 'bg-amber-400/20 text-amber-300'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Daftar
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('forgot');
              setError(null);
            }}
            className={`rounded-lg py-1.5 font-medium ${
              tab === 'forgot'
                ? 'bg-amber-400/20 text-amber-300'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Lupa Sandi
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            {info}
          </div>
        )}

        {tab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-3">
            <label className="block text-xs text-slate-300">
              Email
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full rounded-xl border border-white/12 bg-white/[0.06] py-2 pl-9 pr-3 text-xs text-white focus:border-amber-300 focus:outline-none"
                />
              </div>
            </label>
            <label className="block text-xs text-slate-300">
              Kata Sandi
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/12 bg-white/[0.06] py-2 pl-9 pr-3 text-xs text-white focus:border-amber-300 focus:outline-none"
                />
              </div>
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-amber-400 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {loading ? 'Memproses...' : 'Masuk ke Vault'}
            </button>
          </form>
        )}

        {tab === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3">
            <label className="block text-xs text-slate-300">
              Nama Lengkap
              <div className="relative mt-1">
                <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama Anda"
                  className="w-full rounded-xl border border-white/12 bg-white/[0.06] py-2 pl-9 pr-3 text-xs text-white focus:border-amber-300 focus:outline-none"
                />
              </div>
            </label>
            <label className="block text-xs text-slate-300">
              Email
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="w-full rounded-xl border border-white/12 bg-white/[0.06] py-2 pl-9 pr-3 text-xs text-white focus:border-amber-300 focus:outline-none"
                />
              </div>
            </label>
            <label className="block text-xs text-slate-300">
              Kata Sandi (min. 6 karakter)
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full rounded-xl border border-white/12 bg-white/[0.06] py-2 pl-9 pr-3 text-xs text-white focus:border-amber-300 focus:outline-none"
                />
              </div>
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-yellow-300 via-amber-400 to-purple-400 py-2.5 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
            >
              {loading ? 'Mendaftarkan...' : 'Daftar & Klaim 3 TB'}
            </button>
          </form>
        )}

        {tab === 'forgot' && (
          <div className="space-y-4">
            <form onSubmit={handleForgot} className="space-y-3">
              <label className="block text-xs text-slate-300">
                Email Terdaftar
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="mt-1 w-full rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white focus:border-amber-300 focus:outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl border border-purple-400/45 bg-purple-500/20 py-2 text-xs font-semibold text-purple-100 hover:bg-purple-500/30"
              >
                Buat Token Reset Sandi
              </button>
            </form>

            {generatedTokenHint && (
              <form
                onSubmit={handleCompleteReset}
                className="space-y-2.5 border-t border-white/[0.08] pt-3"
              >
                <label className="block text-xs text-slate-300">
                  Token Reset
                  <div className="relative mt-1">
                    <KeyRound className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      required
                      value={resetTokenInput}
                      onChange={(e) => setResetTokenInput(e.target.value)}
                      className="w-full rounded-xl border border-white/12 bg-white/[0.06] py-2 pl-9 pr-3 font-mono text-xs text-white"
                    />
                  </div>
                </label>
                <label className="block text-xs text-slate-300">
                  Kata Sandi Baru
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="mt-1 w-full rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white"
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-amber-400 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
                >
                  Simpan Kata Sandi Baru
                </button>
              </form>
            )}
          </div>
        )}

        <div className="mt-5 border-t border-white/[0.06] pt-3 text-center">
          <button
            type="button"
            onClick={async () => {
              await onUseDemo();
              onClose();
            }}
            className="text-xs text-slate-400 underline-offset-2 hover:text-amber-300 hover:underline"
          >
            Lanjutkan dengan Ruang Kerja Demo NEXAVAULT
          </button>
        </div>
      </div>
    </div>
  );
}
