import { useCallback, useRef, useState } from 'react';
import {
  CheckCircle2,
  CloudUpload,
  FolderUp,
  Loader2,
  X,
  XCircle,
} from 'lucide-react';
import type { UploadTask } from '../types/cloud';
import {
  extractDroppedUploadItems,
  type UploadPayload,
} from '../utils/folderUpload';
import { formatBytes } from '../utils/storageMath';

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  tasks: UploadTask[];
  onStartUpload: (files: File[] | UploadPayload) => void;
  currentFolderName?: string | null;
}

export function UploadModal({
  open,
  onClose,
  tasks,
  onStartUpload,
  currentFolderName,
}: UploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const setFolderInputElement = useCallback(
    (el: HTMLInputElement | null) => {
      folderInputRef.current = el;
      if (el) {
        (el as HTMLInputElement & { webkitdirectory?: boolean }).webkitdirectory =
          true;
        el.setAttribute('webkitdirectory', '');
        el.setAttribute('directory', '');
        el.setAttribute('mozdirectory', '');
      }
    },
    []
  );

  if (!open) return null;

  const handleFilesSelected = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onStartUpload(Array.from(list));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upload File ke NEXAVAULT"
      className="glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="glass-modal w-full max-w-xl rounded-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Upload ke NEXAVAULT
            </h2>
            <p className="text-xs text-slate-400">
              {currentFolderName
                ? `Tujuan: Folder "${currentFolderName}"`
                : 'Tujuan: Root Cloud Vault (3 TB)'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal upload"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drag and Drop Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setIsDragging(false);
            const payload = await extractDroppedUploadItems(e.dataTransfer);
            if (
              payload.entries.length > 0 ||
              (payload.emptyFolderPaths?.length ?? 0) > 0
            ) {
              onStartUpload(payload);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all ${
            isDragging
              ? 'border-amber-400 bg-amber-500/12'
              : 'border-white/15 bg-white/[0.02] hover:border-amber-300/60 hover:bg-white/[0.04]'
          }`}
        >
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-400/35 bg-purple-500/15 text-amber-300">
            <CloudUpload className="h-7 w-7 animate-bounce" />
          </div>
          <p className="font-display text-base font-semibold text-white">
            Drop your files here
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Atau klik untuk memilih file &amp; folder — Mendukung semua format
            (JPG, MP4, MP3, PDF, DOCX, ZIP, FIG, PSD, APK, dll.)
          </p>

          <div
            className="mt-4 flex flex-wrap items-center justify-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-300"
            >
              Pilih File
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.1]"
            >
              <FolderUp className="h-3.5 w-3.5 text-purple-300" />
              <span>Upload Folder</span>
            </button>
          </div>
        </div>

        {/* Inputs placed outside the dropzone click area to prevent event bubbling */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          data-testid="upload-file-input"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={setFolderInputElement}
          type="file"
          multiple
          className="hidden"
          data-testid="upload-folder-input"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />

        {/* Real-time Upload Queue */}
        {tasks.length > 0 && (
          <div className="mt-5 max-h-56 space-y-2.5 overflow-y-auto pr-1">
            <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Antrean Upload ({tasks.length})
            </h3>
            {tasks.map((task) => (
              <div
                key={task.id}
                className="glass-card rounded-2xl p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      title={task.relativePath || task.fileName}
                      className="truncate text-xs font-medium text-slate-100"
                    >
                      {task.relativePath || task.fileName}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400 tabular-nums">
                      {formatBytes(task.loadedBytes)} / {formatBytes(task.totalBytes)}
                      {task.status === 'uploading' && task.speedBps > 0 && (
                        <>
                          {' '}
                          · {formatBytes(task.speedBps)}/s · ETA {task.etaSeconds}s
                        </>
                      )}
                      {task.status === 'completed' && ' · Selesai'}
                      {task.status === 'cancelled' && ' · Dibatalkan'}
                      {task.status === 'error' &&
                        ` · Gagal: ${task.errorMessage || 'Error'}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs font-semibold text-amber-300 tabular-nums">
                      {task.percent}%
                    </span>
                    {task.status === 'uploading' ? (
                      <button
                        type="button"
                        onClick={task.cancel}
                        aria-label={`Batalkan upload ${task.fileName}`}
                        className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:border-rose-400/40 hover:text-rose-300"
                      >
                        Batal
                      </button>
                    ) : task.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : task.status === 'cancelled' ? (
                      <XCircle className="h-4 w-4 text-slate-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-400" />
                    )}
                  </div>
                </div>

                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full transition-all duration-150 ${
                      task.status === 'completed'
                        ? 'bg-emerald-400'
                        : task.status === 'error'
                        ? 'bg-rose-400'
                        : 'bg-gradient-to-r from-amber-300 to-purple-400'
                    }`}
                    style={{ width: `${task.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {tasks.some((t) => t.status === 'uploading') && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Mengenkripsi dan menyinkronkan berkas ke vault...</span>
          </div>
        )}
      </div>
    </div>
  );
}
