import { useEffect, useState } from 'react';
import {
  Download,
  FileCode2,
  FileText,
  Music,
  RotateCcw,
  Share2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { CloudFile } from '../types/cloud';
import { formatBytes } from '../utils/storageMath';

interface PreviewModalProps {
  file: CloudFile | null;
  onClose: () => void;
  onShare?: (file: CloudFile) => void;
}

const TEXT_EXTS = new Set([
  'txt',
  'md',
  'json',
  'xml',
  'csv',
  'yaml',
  'yml',
  'html',
  'css',
  'js',
  'ts',
  'tsx',
  'jsx',
  'log',
]);

export function PreviewModal({ file, onClose, onShare }: PreviewModalProps) {
  const [zoom, setZoom] = useState(1);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  const ext = file?.extension.toLowerCase() || '';
  const isImage =
    file?.category === 'photos' || file?.mimeType.startsWith('image/');
  const isVideo =
    file?.category === 'videos' || file?.mimeType.startsWith('video/');
  const isAudio =
    file?.category === 'audio' || file?.mimeType.startsWith('audio/');
  const isPdf = ext === 'pdf' || file?.mimeType === 'application/pdf';
  const isText =
    TEXT_EXTS.has(ext) ||
    file?.mimeType.startsWith('text/') ||
    file?.mimeType.includes('json') ||
    file?.mimeType.includes('xml');

  useEffect(() => {
    setZoom(1);
    setTextContent(null);
    if (!file || !isText) return;

    let cancelled = false;
    setTextLoading(true);
    fetch(file.signedUrl)
      .then((r) => r.text())
      .then((txt) => {
        if (!cancelled) setTextContent(txt.slice(0, 60_000));
      })
      .catch(() => {
        if (!cancelled) setTextContent('Tidak dapat memuat pratinjau teks.');
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file, isText]);

  if (!file) return null;

  const downloadUrl = `${file.signedUrl}${
    file.signedUrl.includes('?') ? '&' : '?'
  }download=1`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Pratinjau ${file.name}`}
      className="glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="glass-modal flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.12] px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate font-display text-sm font-semibold text-white sm:text-base">
              {file.name}
            </h2>
            <p className="text-xs text-slate-400 tabular-nums">
              {file.extension.toUpperCase()} · {formatBytes(file.sizeBytes)} ·{' '}
              {new Date(file.createdAt).toLocaleDateString('id-ID')}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isImage && (
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                  aria-label="Perkecil gambar"
                  className="rounded-lg p-1 text-slate-300 hover:bg-white/[0.08] hover:text-white"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="px-1.5 font-mono text-[11px] text-slate-300 tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
                  aria-label="Perbesar gambar"
                  className="rounded-lg p-1 text-slate-300 hover:bg-white/[0.08] hover:text-white"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  aria-label="Reset zoom"
                  className="rounded-lg p-1 text-slate-300 hover:bg-white/[0.08] hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {onShare && (
              <button
                type="button"
                onClick={() => onShare(file)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/[0.1]"
              >
                <Share2 className="h-3.5 w-3.5 text-violet-300" />
                <span>Bagikan</span>
              </button>
            )}

            <a
              href={downloadUrl}
              download={file.name}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Unduh</span>
            </a>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup pratinjau"
              className="rounded-xl p-2 text-slate-400 hover:bg-white/[0.08] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Viewer Body */}
        <div className="flex-1 overflow-auto bg-white/[0.02] p-5">
          {isImage ? (
            <div className="flex min-h-[340px] items-center justify-center overflow-auto">
              <img
                src={file.signedUrl}
                alt={file.name}
                referrerPolicy="no-referrer"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                className="max-h-[65vh] rounded-xl object-contain transition-transform duration-150"
              />
            </div>
          ) : isVideo ? (
            <div className="flex min-h-[340px] items-center justify-center">
              <video
                src={file.signedUrl}
                controls
                className="max-h-[65vh] w-full rounded-xl bg-black"
              />
            </div>
          ) : isAudio ? (
            <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-10 text-center">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-purple-400/35 bg-purple-500/15 text-amber-300">
                <Music className="h-9 w-9" />
              </div>
              {/* Stylized Audio Waveform */}
              <div
                aria-hidden="true"
                className="mb-5 flex h-16 w-full items-center justify-center gap-1"
              >
                {Array.from({ length: 32 }).map((_, i) => {
                  const h = 20 + Math.round(Math.abs(Math.sin(i * 0.55)) * 75);
                  return (
                    <span
                      key={i}
                      style={{ height: `${h}%` }}
                      className="w-1.5 rounded-full bg-gradient-to-t from-amber-400 to-purple-400 opacity-85"
                    />
                  );
                })}
              </div>
              <audio src={file.signedUrl} controls className="w-full" />
            </div>
          ) : isPdf ? (
            <iframe
              src={file.signedUrl}
              title={file.name}
              className="h-[65vh] w-full rounded-xl border border-white/10 bg-white"
            />
          ) : isText ? (
            <div className="glass-card rounded-2xl p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                <FileCode2 className="h-4 w-4 text-amber-300" />
                <span>Pratinjau Dokumen Teks</span>
              </div>
              {textLoading ? (
                <p className="text-xs text-slate-400">Memuat isi dokumen...</p>
              ) : (
                <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-200">
                  {textContent}
                </pre>
              )}
            </div>
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.04] text-slate-300">
                <FileText className="h-8 w-8" />
              </div>
              <p className="font-display text-base font-semibold text-white">
                Pratinjau langsung belum tersedia untuk .{file.extension}
              </p>
              <p className="mt-1 max-w-md text-xs text-slate-400">
                File tetap tersimpan aman di NEXAVAULT 3 TB dan siap diunduh
                kapan saja.
              </p>
              <a
                href={downloadUrl}
                download={file.name}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-300"
              >
                <Download className="h-4 w-4" />
                <span>Unduh {file.name}</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
