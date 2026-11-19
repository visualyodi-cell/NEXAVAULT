import { useMemo, useState } from 'react';
import {
  Archive,
  ArrowDownAZ,
  Check,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileText,
  Film,
  Folder,
  FolderInput,
  FolderPlus,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Music,
  Pencil,
  RotateCcw,
  Share2,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  CloudFile,
  CloudFolder,
  FileCategory,
  NavTab,
} from '../types/cloud';
import {
  extractDroppedUploadItems,
  type UploadPayload,
} from '../utils/folderUpload';
import { formatBytes } from '../utils/storageMath';

interface FileManagerViewProps {
  mode: Extract<NavTab, 'files' | 'media' | 'recent' | 'favorites' | 'trash'>;
  folders: CloudFolder[];
  allFolders: CloudFolder[];
  files: CloudFile[];
  loading: boolean;
  currentFolderId: number | null;
  searchQuery: string;
  categoryFilter: string;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onCategoryFilterChange: (cat: string) => void;
  onFolderOpen: (folderId: number | null) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFile: (fileId: number, newName: string) => Promise<void>;
  onRenameFolder: (folderId: number, newName: string) => Promise<void>;
  onCopyFile: (fileId: number, targetFolderId: number | null) => Promise<void>;
  onMoveFile: (fileId: number, targetFolderId: number | null) => Promise<void>;
  onToggleFavorite: (fileId: number) => Promise<void>;
  onDeleteFile: (fileId: number, permanent?: boolean) => Promise<void>;
  onRestoreFile: (fileId: number) => Promise<void>;
  onDeleteFolder: (folderId: number, permanent?: boolean) => Promise<void>;
  onRestoreFolder: (folderId: number) => Promise<void>;
  onBatchAction: (
    fileIds: number[],
    action: 'trash' | 'restore' | 'delete_permanent' | 'move',
    targetFolderId?: number | null
  ) => Promise<void>;
  onPreviewFile: (file: CloudFile) => void;
  onShareFile: (file: CloudFile) => void;
  onOpenUpload: () => void;
  onDropFiles: (dropped: File[] | UploadPayload) => void;
}

const CATEGORY_TABS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'Semua' },
  { id: 'photos', label: 'Foto' },
  { id: 'videos', label: 'Video' },
  { id: 'documents', label: 'Dokumen' },
  { id: 'audio', label: 'Audio' },
  { id: 'archives', label: 'Arsip' },
  { id: 'others', label: 'Lainnya' },
];

function getCategoryIcon(category: FileCategory) {
  switch (category) {
    case 'photos':
      return ImageIcon;
    case 'videos':
      return Film;
    case 'audio':
      return Music;
    case 'archives':
      return Archive;
    default:
      return FileText;
  }
}

export function FileManagerView({
  mode,
  folders,
  allFolders,
  files,
  loading,
  currentFolderId,
  searchQuery,
  categoryFilter,
  viewMode,
  onViewModeChange,
  onCategoryFilterChange,
  onFolderOpen,
  onCreateFolder,
  onRenameFile,
  onRenameFolder,
  onCopyFile,
  onMoveFile,
  onToggleFavorite,
  onDeleteFile,
  onRestoreFile,
  onDeleteFolder,
  onRestoreFolder,
  onBatchAction,
  onPreviewFile,
  onShareFile,
  onOpenUpload,
  onDropFiles,
}: FileManagerViewProps) {
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Modals for Folder Create / Rename / Move-Copy
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<{
    type: 'file' | 'folder';
    id: number;
    name: string;
  } | null>(null);
  const [transferTarget, setTransferTarget] = useState<{
    mode: 'move' | 'copy';
    fileIds: number[];
    folderId: number | null;
  } | null>(null);
  const [deletingFileIds, setDeletingFileIds] = useState<number[]>([]);
  const [deletingFolderIds, setDeletingFolderIds] = useState<number[]>([]);
  const [permanentConfirm, setPermanentConfirm] = useState<{
    kind: 'file' | 'folder' | 'batch';
    ids: number[];
    label: string;
  } | null>(null);

  const waitDeleteAnim = () =>
    new Promise<void>((resolve) => window.setTimeout(resolve, 340));

  const runDeleteFile = async (file: CloudFile, permanent: boolean) => {
    if (permanent) {
      setPermanentConfirm({
        kind: 'file',
        ids: [file.id],
        label: file.name,
      });
      return;
    }
    setDeletingFileIds((prev) =>
      prev.includes(file.id) ? prev : [...prev, file.id]
    );
    try {
      await waitDeleteAnim();
      await onDeleteFile(file.id, false);
    } finally {
      setDeletingFileIds((prev) => prev.filter((id) => id !== file.id));
    }
  };

  const runDeleteFolder = async (folder: CloudFolder, permanent: boolean) => {
    if (permanent) {
      setPermanentConfirm({
        kind: 'folder',
        ids: [folder.id],
        label: folder.name,
      });
      return;
    }
    setDeletingFolderIds((prev) =>
      prev.includes(folder.id) ? prev : [...prev, folder.id]
    );
    try {
      await waitDeleteAnim();
      await onDeleteFolder(folder.id, false);
    } finally {
      setDeletingFolderIds((prev) => prev.filter((id) => id !== folder.id));
    }
  };

  const runBatchDelete = async (fileIds: number[], permanent: boolean) => {
    if (fileIds.length === 0) return;
    if (permanent) {
      setPermanentConfirm({
        kind: 'batch',
        ids: [...fileIds],
        label: `${fileIds.length} file terpilih`,
      });
      return;
    }
    setDeletingFileIds((prev) => Array.from(new Set([...prev, ...fileIds])));
    try {
      await waitDeleteAnim();
      await onBatchAction(fileIds, 'trash');
      setSelectedIds([]);
    } finally {
      setDeletingFileIds((prev) => prev.filter((id) => !fileIds.includes(id)));
    }
  };

  const confirmPermanentDelete = async () => {
    if (!permanentConfirm) return;
    const target = permanentConfirm;
    setPermanentConfirm(null);
    if (target.kind === 'folder') {
      const folderId = target.ids[0];
      setDeletingFolderIds((prev) =>
        prev.includes(folderId) ? prev : [...prev, folderId]
      );
      try {
        await waitDeleteAnim();
        await onDeleteFolder(folderId, true);
      } finally {
        setDeletingFolderIds((prev) => prev.filter((id) => id !== folderId));
      }
    } else if (target.kind === 'file') {
      const fileId = target.ids[0];
      setDeletingFileIds((prev) =>
        prev.includes(fileId) ? prev : [...prev, fileId]
      );
      try {
        await waitDeleteAnim();
        await onDeleteFile(fileId, true);
      } finally {
        setDeletingFileIds((prev) => prev.filter((id) => id !== fileId));
      }
    } else {
      setDeletingFileIds((prev) =>
        Array.from(new Set([...prev, ...target.ids]))
      );
      try {
        await waitDeleteAnim();
        await onBatchAction(target.ids, 'delete_permanent');
        setSelectedIds([]);
      } finally {
        setDeletingFileIds((prev) =>
          prev.filter((id) => !target.ids.includes(id))
        );
      }
    }
  };

  const safeAllFolders = useMemo(
    () => (Array.isArray(allFolders) ? allFolders : []),
    [allFolders]
  );

  const breadcrumbs = useMemo(() => {
    const chain: CloudFolder[] = [];
    let cursor = currentFolderId;
    const byId = new Map(safeAllFolders.map((f) => [f.id, f]));
    while (cursor) {
      const f = byId.get(cursor);
      if (!f) break;
      chain.unshift(f);
      cursor = f.parentId;
    }
    return chain;
  }, [safeAllFolders, currentFolderId]);

  const sortedFiles = useMemo(() => {
    const list = Array.isArray(files) ? [...files] : [];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortBy === 'size') {
        cmp = a.sizeBytes - b.sizeBytes;
      } else {
        cmp =
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [files, sortBy, sortDir]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === sortedFiles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(sortedFiles.map((f) => f.id));
    }
  };

  const titleByMode: Record<typeof mode, string> = {
    files: 'File Saya',
    media: 'Foto & Video',
    recent: 'File Terbaru',
    favorites: 'Favorit',
    trash: 'Sampah',
  };

  const subtitleByMode: Record<typeof mode, string> = {
    files: 'Kelola seluruh folder dan file dalam ruang penyimpanan 3 TB Anda.',
    media: 'Galeri visual foto dan video yang tersimpan di vault pribadi.',
    recent: 'File yang baru saja diunggah atau dibuka terakhir kali.',
    favorites: 'Koleksi file penting yang ditandai bintang untuk akses cepat.',
    trash: 'File yang dihapus disimpan sementara sebelum dihapus permanen.',
  };

  return (
    <div
      onDragOver={(e) => {
        if (mode !== 'trash') {
          e.preventDefault();
          setDragActive(true);
        }
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={async (e) => {
        if (mode !== 'trash') {
          e.preventDefault();
          setDragActive(false);
          const payload = await extractDroppedUploadItems(e.dataTransfer);
          if (
            payload.entries.length > 0 ||
            (payload.emptyFolderPaths?.length ?? 0) > 0
          ) {
            onDropFiles(payload);
          }
        }
      }}
      className={`glass-panel relative flex flex-1 flex-col rounded-3xl p-5 transition-colors sm:p-6 ${
        dragActive ? 'border-amber-300/60 bg-amber-400/[0.08]' : ''
      }`}
    >
      {/* Header & Primary Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.12] pb-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-white">
            {titleByMode[mode]}
          </h1>
          <p className="mt-0.5 text-xs text-slate-300/80">{subtitleByMode[mode]}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'files' && (
            <button
              type="button"
              onClick={() => {
                setNewFolderName('');
                setShowNewFolder(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-purple-400/50 hover:text-white whitespace-nowrap shrink-0"
            >
              <FolderPlus className="h-3.5 w-3.5 text-purple-300" />
              <span>Folder Baru</span>
            </button>
          )}

          {mode !== 'trash' && (
            <button
              type="button"
              onClick={onOpenUpload}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-300 whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload</span>
            </button>
          )}
        </div>
      </div>

      {/* Breadcrumbs (File Saya mode) */}
      {mode === 'files' && !searchQuery && (
        <nav
          aria-label="Breadcrumb folder"
          className="mt-3 flex flex-wrap items-center gap-1 text-xs text-slate-300/80"
        >
          <button
            type="button"
            onClick={() => onFolderOpen(null)}
            className={`rounded-md px-2 py-1 transition-colors hover:bg-white/[0.06] hover:text-white ${
              currentFolderId === null ? 'font-semibold text-amber-300' : ''
            }`}
          >
            Vault Saya
          </button>
          {breadcrumbs.map((folder) => (
            <div key={folder.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-purple-400/70" />
              <button
                type="button"
                onClick={() => onFolderOpen(folder.id)}
                className={`rounded-md px-2 py-1 transition-colors hover:bg-white/[0.06] hover:text-white ${
                  currentFolderId === folder.id
                    ? 'font-semibold text-amber-300'
                    : ''
                }`}
              >
                {folder.name}
              </button>
            </div>
          ))}
        </nav>
      )}

      {/* Toolbar: Category Filter + Sort + View Mode */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {mode === 'files' ? (
          <div className="glass-control flex flex-wrap items-center gap-1 rounded-2xl p-1">
            {CATEGORY_TABS.map((tab) => {
              const active = (categoryFilter || 'all') === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onCategoryFilterChange(tab.id)}
                  className={`rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white/[0.16] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]'
                      : 'text-slate-300/80 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-slate-300/80 tabular-nums">
            {sortedFiles.length} item ditampilkan
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="glass-control flex items-center gap-1 rounded-2xl px-2.5 py-1">
            <ArrowDownAZ className="h-3.5 w-3.5 text-slate-300" />
            <select
              aria-label="Urutkan berdasarkan"
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as 'date' | 'name' | 'size')
              }
              className="bg-transparent text-xs text-slate-100 focus:outline-none"
            >
              <option value="date" className="bg-[#160e2a] text-white">
                Tanggal
              </option>
              <option value="name" className="bg-[#160e2a] text-white">
                Nama
              </option>
              <option value="size" className="bg-[#160e2a] text-white">
                Ukuran
              </option>
            </select>
            <button
              type="button"
              onClick={() =>
                setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
              }
              className="rounded-lg px-1.5 py-0.5 text-[11px] font-medium text-amber-300 hover:bg-white/[0.1]"
            >
              {sortDir === 'asc' ? 'Naik' : 'Turun'}
            </button>
          </div>

          <div className="glass-control flex items-center rounded-2xl p-1">
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              aria-label="Tampilan Grid"
              className={`rounded-lg p-1.5 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-amber-400/20 text-amber-300'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              aria-label="Tampilan Daftar"
              className={`rounded-lg p-1.5 transition-colors ${
                viewMode === 'list'
                  ? 'bg-amber-400/20 text-amber-300'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Select Batch Toolbar */}
      {selectedIds.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/35 bg-amber-400/12 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="font-medium text-amber-200 underline-offset-2 hover:underline"
            >
              {selectedIds.length === sortedFiles.length
                ? 'Batal pilih semua'
                : 'Pilih semua'}
            </button>
            <span className="text-slate-200 tabular-nums">
              {selectedIds.length} file dipilih
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {mode !== 'trash' ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setTransferTarget({
                      mode: 'move',
                      fileIds: selectedIds,
                      folderId: currentFolderId,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white hover:bg-white/[0.12]"
                >
                  <FolderInput className="h-3.5 w-3.5" />
                  <span>Pindah</span>
                </button>
                <button
                  type="button"
                  onClick={() => runBatchDelete(selectedIds, false)}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-500/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Pindah ke Sampah</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    await onBatchAction(selectedIds, 'restore');
                    setSelectedIds([]);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/30"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Pulihkan</span>
                </button>
                <button
                  type="button"
                  onClick={() => runBatchDelete(selectedIds, true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-xs text-rose-200 hover:bg-rose-500/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Hapus Permanen</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Content Grid / List */}
      <div className="mt-5 flex-1">
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-24 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.03]"
              />
            ))}
          </div>
        ) : folders.length === 0 && sortedFiles.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center">
            <Folder className="mb-3 h-10 w-10 text-slate-500" />
            <p className="font-display text-base font-medium text-slate-200">
              {mode === 'trash'
                ? 'Sampah kosong'
                : searchQuery
                ? `Tidak ada file yang cocok dengan "${searchQuery}"`
                : 'Belum ada file di tampilan ini'}
            </p>
            <p className="mt-1 max-w-sm text-xs text-slate-400">
              {mode === 'trash'
                ? 'File yang Anda hapus akan muncul di sini sebelum dihapus permanen.'
                : 'Jatuhkan file ke area ini atau klik tombol Upload untuk menyimpan ke ruang 3 TB Anda.'}
            </p>
            {mode !== 'trash' && (
              <button
                type="button"
                onClick={onOpenUpload}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Upload File Pertama</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Folders Section */}
            {folders.length > 0 && (
              <div>
                <h2 className="mb-2.5 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Folder ({folders.length})
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {folders.map((folder) => {
                    const isDeletingFolder = deletingFolderIds.includes(
                      folder.id
                    );
                    return (
                    <div
                      key={folder.id}
                      className={`glass-card group relative flex items-center justify-between rounded-2xl px-3.5 py-3 transition-all ${
                        isDeletingFolder
                          ? 'animate-file-delete border-rose-400/60 bg-rose-500/15'
                          : 'hover:border-white/25 hover:bg-white/[0.1]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          mode !== 'trash' && onFolderOpen(folder.id)
                        }
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/18 text-purple-300">
                          <Folder className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-100">
                            {folder.name}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {new Date(folder.updatedAt).toLocaleDateString(
                              'id-ID'
                            )}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        {mode === 'trash' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onRestoreFolder(folder.id)}
                              aria-label={`Pulihkan folder ${folder.name}`}
                              className="rounded-lg p-1.5 text-emerald-300 hover:bg-white/[0.06]"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => runDeleteFolder(folder, true)}
                              aria-label={`Hapus permanen folder ${folder.name}`}
                              className="rounded-lg p-1.5 text-rose-300 hover:bg-white/[0.06]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setRenameTarget({
                                  type: 'folder',
                                  id: folder.id,
                                  name: folder.name,
                                })
                              }
                              aria-label={`Ubah nama folder ${folder.name}`}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => runDeleteFolder(folder, false)}
                              aria-label={`Hapus folder ${folder.name}`}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-rose-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                  })}
                </div>
              </div>
            )}

            {/* Files Section */}
            {sortedFiles.length > 0 && (
              <div>
                <div className="mb-2.5 flex items-center justify-between">
                  <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                    File ({sortedFiles.length})
                  </h2>
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-xs text-slate-400 hover:text-amber-300"
                  >
                    {selectedIds.length === sortedFiles.length
                      ? 'Batalkan pilih semua'
                      : 'Pilih semua'}
                  </button>
                </div>

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {sortedFiles.map((file) => {
                      const Icon = getCategoryIcon(file.category);
                      const isSelected = selectedIds.includes(file.id);
                      const isDeletingFile = deletingFileIds.includes(file.id);
                      const isImage =
                        file.category === 'photos' ||
                        file.mimeType.startsWith('image/');

                      return (
                        <div
                          key={file.id}
                          className={`glass-card group relative flex flex-col justify-between rounded-2xl p-3.5 transition-all ${
                            isDeletingFile
                              ? 'animate-file-delete border-rose-400/60 bg-rose-500/15'
                              : isSelected
                              ? 'border-amber-300/60 bg-amber-400/15'
                              : 'hover:border-white/25 hover:bg-white/[0.1]'
                          }`}
                        >
                          {isDeletingFile && (
                            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-rose-950/55 backdrop-blur-xs">
                              <Trash2 className="h-6 w-6 animate-bounce text-rose-300" />
                              <span className="text-[11px] font-semibold text-rose-200">
                                {mode === 'trash'
                                  ? 'Menghapus...'
                                  : 'Ke Sampah...'}
                              </span>
                            </div>
                          )}
                          <div>
                            <div className="mb-3 flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => toggleSelect(file.id)}
                                aria-label={`Pilih ${file.name}`}
                                className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                                  isSelected
                                    ? 'border-amber-400 bg-amber-400 text-slate-950'
                                    : 'border-white/20 bg-white/[0.03] text-transparent hover:border-amber-400/60'
                                }`}
                              >
                                <Check className="h-3 w-3" />
                              </button>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => onToggleFavorite(file.id)}
                                  aria-label={
                                    file.isFavorite
                                      ? `Hapus ${file.name} dari favorit`
                                      : `Tambah ${file.name} ke favorit`
                                  }
                                  className={`rounded-lg p-1.5 transition-colors ${
                                    file.isFavorite
                                      ? 'text-amber-300'
                                      : 'text-slate-500 hover:text-amber-300'
                                  }`}
                                >
                                  <Star
                                    className="h-3.5 w-3.5"
                                    fill={
                                      file.isFavorite ? 'currentColor' : 'none'
                                    }
                                  />
                                </button>
                              </div>
                            </div>

                            {/* Preview Thumbnail / Icon */}
                            <button
                              type="button"
                              onClick={() => onPreviewFile(file)}
                              className="mb-3 flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.04] text-purple-200 transition-colors hover:border-white/25 hover:bg-white/[0.07]"
                            >
                              {isImage ? (
                                <img
                                  src={file.signedUrl}
                                  alt={file.name}
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                  <Icon className="h-7 w-7 text-purple-300" />
                                  <span className="font-mono text-[10px] font-semibold uppercase text-slate-400">
                                    .{file.extension}
                                  </span>
                                </div>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => onPreviewFile(file)}
                              className="block w-full truncate text-left text-sm font-medium text-slate-100 hover:text-amber-300"
                            >
                              {file.name}
                            </button>
                            <p className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                              {formatBytes(file.sizeBytes)} ·{' '}
                              {new Date(file.updatedAt).toLocaleDateString(
                                'id-ID'
                              )}
                            </p>
                          </div>

                          {/* Card Actions */}
                          <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5">
                            {mode === 'trash' ? (
                              <div className="flex w-full items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => onRestoreFile(file.id)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  <span>Pulihkan</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => runDeleteFile(file, true)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/25"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Hapus</span>
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => onPreviewFile(file)}
                                    aria-label={`Pratinjau ${file.name}`}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                  <a
                                    href={`${file.signedUrl}&download=1`}
                                    download={file.name}
                                    aria-label={`Unduh ${file.name}`}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-amber-300"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => onShareFile(file)}
                                    aria-label={`Bagikan ${file.name}`}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-purple-300"
                                  >
                                    <Share2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRenameTarget({
                                        type: 'file',
                                        id: file.id,
                                        name: file.name,
                                      })
                                    }
                                    aria-label={`Ubah nama ${file.name}`}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setTransferTarget({
                                        mode: 'copy',
                                        fileIds: [file.id],
                                        folderId: file.folderId,
                                      })
                                    }
                                    aria-label={`Salin ${file.name}`}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setTransferTarget({
                                        mode: 'move',
                                        fileIds: [file.id],
                                        folderId: file.folderId,
                                      })
                                    }
                                    aria-label={`Pindah ${file.name}`}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white"
                                  >
                                    <FolderInput className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => runDeleteFile(file, false)}
                                    aria-label={`Hapus ${file.name}`}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-rose-300"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="glass-card overflow-x-auto rounded-2xl">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-white/[0.1] text-slate-300">
                        <tr>
                          <th className="w-10 px-3 py-2.5">
                            <button
                              type="button"
                              onClick={toggleSelectAll}
                              aria-label="Pilih semua baris"
                              className="flex h-4 w-4 items-center justify-center rounded border border-white/25"
                            >
                              {selectedIds.length === sortedFiles.length && (
                                <Check className="h-3 w-3 text-amber-300" />
                              )}
                            </button>
                          </th>
                          <th className="px-3 py-2.5 font-medium">Nama File</th>
                          <th className="px-3 py-2.5 font-medium">Tipe</th>
                          <th className="px-3 py-2.5 text-right font-medium">
                            Ukuran
                          </th>
                          <th className="px-3 py-2.5 font-medium">Tanggal</th>
                          <th className="px-3 py-2.5 text-right font-medium">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05]">
                        {sortedFiles.map((file) => {
                          const Icon = getCategoryIcon(file.category);
                          const isSelected = selectedIds.includes(file.id);
                          const isDeletingFile = deletingFileIds.includes(
                            file.id
                          );
                          return (
                            <tr
                              key={file.id}
                              className={`transition-all ${
                                isDeletingFile
                                  ? 'animate-file-delete bg-rose-500/15 text-rose-200'
                                  : 'hover:bg-white/[0.03]'
                              }`}
                            >
                              <td className="px-3 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => toggleSelect(file.id)}
                                  aria-label={`Pilih ${file.name}`}
                                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                                    isSelected
                                      ? 'border-amber-400 bg-amber-400 text-slate-950'
                                      : 'border-white/25 text-transparent'
                                  }`}
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                              </td>
                              <td className="px-3 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => onPreviewFile(file)}
                                  className="flex items-center gap-2.5 font-medium text-slate-100 hover:text-amber-300"
                                >
                                  <Icon className="h-4 w-4 shrink-0 text-purple-300" />
                                  <span className="max-w-[240px] truncate">
                                    {file.name}
                                  </span>
                                </button>
                              </td>
                              <td className="px-3 py-2.5 font-mono uppercase text-slate-400">
                                {file.extension}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-slate-200 tabular-nums">
                                {formatBytes(file.sizeBytes)}
                              </td>
                              <td className="px-3 py-2.5 text-slate-400 tabular-nums">
                                {new Date(file.updatedAt).toLocaleDateString(
                                  'id-ID'
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="inline-flex items-center gap-1">
                                  {mode === 'trash' ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => onRestoreFile(file.id)}
                                        aria-label={`Pulihkan ${file.name}`}
                                        className="rounded-md p-1 text-emerald-300 hover:bg-white/[0.06]"
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          runDeleteFile(file, true)
                                        }
                                        aria-label={`Hapus permanen ${file.name}`}
                                        className="rounded-md p-1 text-rose-300 hover:bg-white/[0.06]"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => onToggleFavorite(file.id)}
                                        aria-label={`Favoritkan ${file.name}`}
                                        className={`rounded-md p-1 ${
                                          file.isFavorite
                                            ? 'text-amber-300'
                                            : 'text-slate-400 hover:text-amber-300'
                                        }`}
                                      >
                                        <Star
                                          className="h-3.5 w-3.5"
                                          fill={
                                            file.isFavorite
                                              ? 'currentColor'
                                              : 'none'
                                          }
                                        />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onShareFile(file)}
                                        aria-label={`Bagikan ${file.name}`}
                                        className="rounded-md p-1 text-slate-400 hover:text-purple-300"
                                      >
                                        <Share2 className="h-3.5 w-3.5" />
                                      </button>
                                      <a
                                        href={`${file.signedUrl}&download=1`}
                                        download={file.name}
                                        aria-label={`Unduh ${file.name}`}
                                        className="rounded-md p-1 text-slate-400 hover:text-amber-300"
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          runDeleteFile(file, false)
                                        }
                                        aria-label={`Hapus ${file.name}`}
                                        className="rounded-md p-1 text-slate-400 hover:text-rose-300"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Folder Modal */}
      {showNewFolder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Buat Folder Baru"
          className="glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newFolderName.trim()) return;
              await onCreateFolder(newFolderName.trim());
              setShowNewFolder(false);
            }}
            className="glass-modal w-full max-w-sm rounded-3xl p-5"
          >
            <h3 className="font-display text-base font-semibold text-white">
              Buat Folder Baru
            </h3>
            <label className="mt-3 block text-xs text-slate-300">
              Nama Folder
              <input
                type="text"
                autoFocus
                required
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Misal: Proyek Desain"
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-amber-300 focus:outline-none"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewFolder(false)}
                className="rounded-xl border border-white/15 px-3.5 py-2 text-xs text-slate-200 hover:bg-white/[0.1]"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
              >
                Buat Folder
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ubah Nama"
          className="glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!renameTarget.name.trim()) return;
              if (renameTarget.type === 'file') {
                await onRenameFile(renameTarget.id, renameTarget.name.trim());
              } else {
                await onRenameFolder(renameTarget.id, renameTarget.name.trim());
              }
              setRenameTarget(null);
            }}
            className="glass-modal w-full max-w-sm rounded-3xl p-5"
          >
            <h3 className="font-display text-base font-semibold text-white">
              Ubah Nama {renameTarget.type === 'file' ? 'File' : 'Folder'}
            </h3>
            <label className="mt-3 block text-xs text-slate-300">
              Nama Baru
              <input
                type="text"
                autoFocus
                required
                value={renameTarget.name}
                onChange={(e) =>
                  setRenameTarget({ ...renameTarget, name: e.target.value })
                }
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white focus:border-amber-300 focus:outline-none"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="rounded-xl border border-white/15 px-3.5 py-2 text-xs text-slate-200 hover:bg-white/[0.1]"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
              >
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Move / Copy Folder Picker Modal */}
      {transferTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pilih Folder Tujuan"
          className="glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="glass-modal w-full max-w-sm rounded-3xl p-5">
            <h3 className="font-display text-base font-semibold text-white">
              {transferTarget.mode === 'copy'
                ? 'Salin ke Folder'
                : 'Pindah ke Folder'}
            </h3>
            <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
              <button
                type="button"
                onClick={() =>
                  setTransferTarget({ ...transferTarget, folderId: null })
                }
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs ${
                  transferTarget.folderId === null
                    ? 'bg-amber-400/20 text-amber-300'
                    : 'text-slate-300 hover:bg-white/[0.05]'
                }`}
              >
                <Folder className="h-4 w-4" />
                <span>Vault Saya (Root)</span>
              </button>
              {safeAllFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() =>
                    setTransferTarget({ ...transferTarget, folderId: f.id })
                  }
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs ${
                    transferTarget.folderId === f.id
                      ? 'bg-amber-400/20 text-amber-300'
                      : 'text-slate-300 hover:bg-white/[0.05]'
                  }`}
                >
                  <Folder className="h-4 w-4" />
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTransferTarget(null)}
                className="rounded-xl border border-white/10 px-3.5 py-2 text-xs text-slate-300 hover:bg-white/[0.06]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (transferTarget.mode === 'copy') {
                    await onCopyFile(
                      transferTarget.fileIds[0],
                      transferTarget.folderId
                    );
                  } else if (transferTarget.fileIds.length === 1) {
                    await onMoveFile(
                      transferTarget.fileIds[0],
                      transferTarget.folderId
                    );
                  } else {
                    await onBatchAction(
                      transferTarget.fileIds,
                      'move',
                      transferTarget.folderId
                    );
                  }
                  setSelectedIds([]);
                  setTransferTarget(null);
                }}
                className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300"
              >
                {transferTarget.mode === 'copy' ? 'Salin Di Sini' : 'Pindahkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {permanentConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Hapus Permanen"
          className="glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="glass-modal w-full max-w-sm rounded-3xl border border-rose-400/35 p-5">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-400/40 bg-rose-500/20 text-rose-300">
              <Trash2 className="h-5 w-5" />
            </div>
            <h3 className="font-display text-base font-semibold text-white">
              Hapus Permanen?
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
              <span className="font-semibold text-white">
                {permanentConfirm.label}
              </span>{' '}
              akan dihapus secara permanen dari NEXAVAULT dan tidak dapat
              dipulihkan kembali.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPermanentConfirm(null)}
                className="rounded-xl border border-white/15 px-3.5 py-2 text-xs text-slate-200 hover:bg-white/[0.1]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmPermanentDelete}
                className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-400"
              >
                Ya, Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
