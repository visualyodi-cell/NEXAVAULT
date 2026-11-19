import { useState } from 'react';
import {
  CalendarClock,
  FileClock,
  FolderKanban,
  Mic,
  NotebookPen,
  Search,
  Share2,
  Sparkles,
  Star,
  Upload,
} from 'lucide-react';
import { NovaRobot3D } from './NovaRobot3D';
import type { NavTab } from '../types/cloud';

interface HeroSectionProps {
  reducedMotion?: boolean;
  onOpenUpload: () => void;
  onNavigate: (tab: NavTab) => void;
  onCommandSearch: (query: string) => void;
  onOpenNotes: () => void;
  onOpenSchedule: () => void;
  onOpenAssistant: (initialQuery?: string) => void;
}

export function HeroSection({
  reducedMotion,
  onOpenUpload,
  onNavigate,
  onCommandSearch,
  onOpenNotes,
  onOpenSchedule,
  onOpenAssistant,
}: HeroSectionProps) {
  const [commandText, setCommandText] = useState('');
  const [novaGreeting, setNovaGreeting] = useState(
    'Hai! Aku Nova, asisten cloud-mu. Mau simpan sesuatu hari ini?'
  );
  const [listening, setListening] = useState(false);

  const handleNovaClick = () => {
    const greetings = [
      'Hai! Aku Nova, asisten cloud-mu. Mau simpan sesuatu hari ini?',
      '3.000 GB ruang cloud aktif dan siap menampung semua karyamu!',
      'Klik Upload File Instan atau jatuhkan filemu kapan saja.',
    ];
    setNovaGreeting((prev) => {
      const idx = greetings.indexOf(prev);
      return greetings[(idx + 1) % greetings.length];
    });
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = commandText.trim();
    if (!q) {
      onOpenAssistant();
      return;
    }
    if (q.toLowerCase().startsWith('upload')) {
      onOpenUpload();
      return;
    }
    if (q.includes('?') || q.toLowerCase().startsWith('nova')) {
      onOpenAssistant(q);
      return;
    }
    onCommandSearch(q);
  };

  const handleVoiceInput = () => {
    const SpeechRecognition =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (typeof SpeechRecognition === 'function') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recog = new (SpeechRecognition as any)();
        recog.lang = 'id-ID';
        recog.interimResults = false;
        setListening(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recog.onresult = (evt: any) => {
          const transcript = evt.results?.[0]?.[0]?.transcript || '';
          setCommandText(transcript);
          setListening(false);
        };
        recog.onerror = () => setListening(false);
        recog.onend = () => setListening(false);
        recog.start();
        return;
      } catch {
        setListening(false);
      }
    }
    setListening((v) => !v);
    setCommandText((prev) => prev || 'Cari Arsitektur Cloud');
  };

  return (
    <div className="glass-panel relative flex flex-1 flex-col justify-between overflow-hidden rounded-3xl px-5 py-6 sm:px-8 sm:py-7">
      {/* Cinematic Left & Right Purple/Yellow Light Sweep */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="animate-sweep-left absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-amber-400/20 blur-[90px]" />
        <div className="animate-sweep-right absolute -right-24 top-1/4 h-72 w-72 rounded-full bg-purple-500/25 blur-[90px]" />
        <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/16 blur-[80px]" />
      </div>

      {/* Top Hero Copy + Center Interactive Robot */}
      <div className="relative z-10 grid grid-cols-1 items-center gap-4 xl:grid-cols-12">
        {/* Left Copy Column (mirrors reference headline positioning) */}
        <div className="animate-hero-up xl:col-span-6">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs font-medium tracking-wide text-purple-200/80">
              Your files, your universe.
            </span>
            <span className="hidden text-purple-400/60 sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="glass-control rounded-lg px-2.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-amber-300">
              3 TB CLOUD STORAGE
            </span>
          </div>

          <h1 className="font-display text-3xl font-bold leading-[1.12] tracking-tight text-white sm:text-4xl xl:text-[40px] [text-wrap:balance]">
            Semua file. Satu tempat.{' '}
            <span className="bg-gradient-to-r from-yellow-200 via-amber-300 to-purple-300 bg-clip-text text-transparent">
              3 TB ruang tanpa batas.
            </span>
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-200/90 sm:text-[15px]">
            Simpan, kelola, akses, dan bagikan semua file pentingmu dengan aman
            dari mana saja.
          </p>

          {/* 3 Interactive Shortcuts */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenUpload}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-yellow-300 via-amber-400 to-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_24px_-8px_rgba(250,204,21,0.5)] transition-all hover:brightness-105 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload File Instan</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('files')}
              className="glass-control inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-medium text-slate-100 transition-all hover:border-white/25 hover:bg-white/[0.12] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <FolderKanban className="h-3.5 w-3.5 text-amber-300" />
              <span>Kelola Penyimpanan</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('shared')}
              className="glass-control inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-medium text-slate-100 transition-all hover:border-white/25 hover:bg-white/[0.12] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              <Share2 className="h-3.5 w-3.5 text-purple-300" />
              <span>Bagikan File</span>
            </button>
          </div>
        </div>

        {/* Center/Right 3D Interactive Robot Stage */}
        <div className="flex flex-col items-center justify-center xl:col-span-6">
          <div className="relative h-[280px] w-full max-w-[460px] sm:h-[330px]">
            <NovaRobot3D
              onInteract={handleNovaClick}
              reducedMotion={reducedMotion}
            />
          </div>
          <p className="mt-1 max-w-md text-center text-xs font-medium text-slate-200/90 sm:text-sm">
            {novaGreeting}
          </p>
        </div>
      </div>

      {/* Bottom Shortcut Cards + Floating Glassmorphism Command Bar */}
      <div className="relative z-10 mt-6 space-y-3">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => onNavigate('recent')}
            className="glass-card group flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left transition-all hover:border-white/25 hover:bg-white/[0.11]"
          >
            <FileClock className="h-4 w-4 shrink-0 text-amber-300" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white">
                File Terbaru
              </p>
              <p className="truncate text-[11px] text-slate-300/80">
                Akses cepat
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenNotes}
            className="glass-card group flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left transition-all hover:border-white/25 hover:bg-white/[0.11]"
          >
            <NotebookPen className="h-4 w-4 shrink-0 text-purple-300" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white">
                Catatan
              </p>
              <p className="truncate text-[11px] text-slate-300/80">
                Memo vault
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenSchedule}
            className="glass-card group flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left transition-all hover:border-white/25 hover:bg-white/[0.11]"
          >
            <CalendarClock className="h-4 w-4 shrink-0 text-violet-300" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white">
                Jadwal Upload
              </p>
              <p className="truncate text-[11px] text-slate-300/80">
                Otomatisasi
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('favorites')}
            className="glass-card group flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left transition-all hover:border-white/25 hover:bg-white/[0.11]"
          >
            <Star className="h-4 w-4 shrink-0 text-amber-300" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white">
                Dokumen Favorit
              </p>
              <p className="truncate text-[11px] text-slate-300/80">
                File penting
              </p>
            </div>
          </button>
        </div>

        {/* Floating Command Bar */}
        <form
          onSubmit={handleCommandSubmit}
          className="glass-control flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 shadow-xl shadow-black/30 sm:flex-nowrap"
        >
          <Search className="ml-1 h-4 w-4 shrink-0 text-slate-300" />
          <input
            type="text"
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
            aria-label="Command bar NEXAVAULT"
            placeholder="Upload file, cari dokumen, atau tanyakan sesuatu..."
            className="min-w-[180px] flex-1 bg-transparent px-1 py-1.5 text-sm text-white placeholder:text-slate-400 focus:outline-none"
          />

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenUpload}
              title="Upload file"
              aria-label="Upload dari command bar"
              className="flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.14] bg-white/[0.06] px-3 text-xs font-medium text-slate-100 transition-colors hover:border-white/30 hover:bg-white/[0.12]"
            >
              <Upload className="h-3.5 w-3.5 text-amber-300" />
              <span className="hidden sm:inline">Upload</span>
            </button>

            <button
              type="submit"
              title="Cari file"
              aria-label="Cari dari command bar"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.14] bg-white/[0.06] text-slate-200 transition-colors hover:border-white/30 hover:bg-white/[0.12] hover:text-white"
            >
              <Search className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={handleVoiceInput}
              title="Input suara"
              aria-label="Input suara"
              className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                listening
                  ? 'border-amber-300/60 bg-amber-400/25 text-amber-200'
                  : 'border-white/[0.14] bg-white/[0.06] text-slate-200 hover:border-white/30 hover:bg-white/[0.12] hover:text-white'
              }`}
            >
              <Mic className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onOpenAssistant(commandText.trim() || undefined)}
              title="Tanya Nova"
              aria-label="Buka Asisten Nova"
              className="flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-yellow-300 via-amber-400 to-purple-400 px-3 text-xs font-semibold text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] transition-all hover:brightness-110"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Nova</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
