import { useState } from 'react';
import {
  CalendarClock,
  NotebookPen,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { NoteRecord, StorageBreakdown } from '../types/cloud';
import { formatStorageGb } from '../utils/storageMath';

interface NotesModalProps {
  open: boolean;
  notes: NoteRecord[];
  onClose: () => void;
  onCreateNote: (title: string, content: string) => Promise<void>;
  onDeleteNote: (id: number) => Promise<void>;
}

export function NotesModal({
  open,
  notes,
  onClose,
  onCreateNote,
  onDeleteNote,
}: NotesModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await onCreateNote(title.trim(), content.trim());
      setTitle('');
      setContent('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Catatan Vault"
      className="glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="glass-modal w-full max-w-lg rounded-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <NotebookPen className="h-5 w-5 text-violet-300" />
            <h2 className="font-display text-base font-semibold text-white">
              Catatan Cloud Vault
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup catatan"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/[0.1] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2.5">
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Judul catatan..."
            className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs text-white placeholder:text-slate-400 focus:border-amber-300 focus:outline-none"
          />
          <textarea
            rows={3}
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Tulis memo atau pengingat file..."
            className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs text-white placeholder:text-slate-400 focus:border-amber-300 focus:outline-none"
          />
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Simpan Catatan</span>
          </button>
        </form>

        <div className="mt-5 max-h-60 space-y-2.5 overflow-y-auto">
          {notes.length === 0 ? (
            <p className="text-xs text-slate-300/80">Belum ada catatan tersimpan.</p>
          ) : (
            notes.map((n) => (
              <div
                key={n.id}
                className="glass-card flex items-start justify-between gap-3 rounded-2xl p-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">{n.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400">
                    {n.content}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteNote(n.id)}
                  aria-label={`Hapus catatan ${n.title}`}
                  className="rounded-lg p-1 text-slate-500 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface ScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onUploadNow: () => void;
}

export function ScheduleModal({
  open,
  onClose,
  onUploadNow,
}: ScheduleModalProps) {
  const [frequency, setFrequency] = useState('Mingguan · Jumat 20:00');
  const [saved, setSaved] = useState(false);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Jadwal Upload Otomatis"
      className="glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="glass-modal w-full max-w-md rounded-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-amber-300" />
            <h2 className="font-display text-base font-semibold text-white">
              Jadwal Upload & Sinkronisasi
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jadwal upload"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Atur pengingat cadangan rutin untuk menjaga seluruh aset dan dokumen
          aman di kuota 3 TB Anda.
        </p>

        <div className="mt-4 space-y-2">
          {[
            'Harian · 22:00 WIB',
            'Mingguan · Jumat 20:00',
            'Bulanan · Tanggal 1',
          ].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setFrequency(opt);
                setSaved(true);
              }}
              className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs ${
                frequency === opt
                  ? 'border-amber-300/60 bg-amber-400/18 text-amber-100'
                  : 'border-white/12 bg-white/[0.05] text-slate-200 hover:bg-white/[0.1]'
              }`}
            >
              <span>{opt}</span>
              {frequency === opt && <span className="text-amber-300">Aktif</span>}
            </button>
          ))}
        </div>

        {saved && (
          <p className="mt-3 text-xs text-emerald-300">
            Jadwal sinkronisasi diatur ke: {frequency}.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-3.5 py-2 text-xs text-slate-300"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onUploadNow();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Sekarang</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface NovaAssistantModalProps {
  open: boolean;
  initialQuery?: string;
  storage: StorageBreakdown;
  onClose: () => void;
  onQuickUpload: () => void;
  onSearchFiles: (q: string) => void;
}

export function NovaAssistantModal({
  open,
  initialQuery,
  storage,
  onClose,
  onQuickUpload,
  onSearchFiles,
}: NovaAssistantModalProps) {
  const [query, setQuery] = useState(initialQuery || '');

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nova Cloud Assistant"
      className="glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="glass-modal w-full max-w-md rounded-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-300" />
            <h2 className="font-display text-base font-semibold text-white">
              Nova — Asisten Vault
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup asisten Nova"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-xl border border-purple-400/30 bg-purple-500/15 p-4 text-xs leading-relaxed text-slate-200">
          Hai! Saat ini kamu menggunakan{' '}
          <span className="font-mono font-semibold text-amber-300">
            {formatStorageGb(storage.usedBytes)}
          </span>{' '}
          dari total kapasitas{' '}
          <span className="font-mono font-semibold text-white">3.000 GB</span> (
          {storage.fileCount} file tersimpan). Ruang tersedia masih{' '}
          <span className="font-mono font-semibold text-emerald-300">
            {formatStorageGb(storage.availableBytes)}
          </span>
          .
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) {
              onSearchFiles(query.trim());
              onClose();
            }
          }}
          className="mt-4 flex gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama file di seluruh vault..."
            className="flex-1 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs text-white placeholder:text-slate-400 focus:border-amber-300 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
          >
            Cari
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onQuickUpload();
            }}
            className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs text-slate-200 hover:bg-white/[0.08]"
          >
            Upload File Instan
          </button>
          <button
            type="button"
            onClick={() => {
              onSearchFiles('PDF');
              onClose();
            }}
            className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs text-slate-200 hover:bg-white/[0.08]"
          >
            Temukan Dokumen PDF
          </button>
        </div>
      </div>
    </div>
  );
}
