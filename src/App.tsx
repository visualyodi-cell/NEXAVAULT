import { useCallback, useEffect, useState } from 'react';
import { Bell, LogIn, Menu, Search } from 'lucide-react';
import {
  batchFilesApi,
  copyFileApi,
  createFolderApi,
  createNoteApi,
  deleteFileApi,
  deleteFolderApi,
  deleteNoteApi,
  ensureFolderTreeApi,
  fetchActivityLogs,
  fetchAllFolders,
  fetchCurrentUser,
  fetchFiles,
  fetchNotes,
  fetchSharesApi,
  fetchStorage,
  getAuthToken,
  initDemoSession,
  markFileOpenedApi,
  moveFileApi,
  renameFileApi,
  renameFolderApi,
  restoreFileApi,
  restoreFolderApi,
  revokeShareApi,
  setAuthToken,
  toggleFavoriteApi,
  updateProfile,
  uploadFileWithProgress,
  verifyEmail,
} from './api/client';
import type {
  ActivityLogRecord,
  CloudFile,
  CloudFolder,
  FileCategory,
  NavTab,
  NoteRecord,
  ShareRecord,
  StorageBreakdown,
  UploadTask,
  UserPreferences,
  UserProfile,
} from './types/cloud';
import {
  THREE_TERABYTES_BYTES,
  calculateUploadMetrics,
  formatBytes,
} from './utils/storageMath';
import {
  collectUniqueFolderPaths,
  normalizeUploadInput,
  splitRelativePath,
  type UploadPayload,
} from './utils/folderUpload';
import { Sidebar } from './components/Sidebar';
import { HeroSection } from './components/HeroSection';
import { StorageCapacityCard } from './components/StorageCapacityCard';
import { FileManagerView } from './components/FileManagerView';
import { UploadModal } from './components/UploadModal';
import { PreviewModal } from './components/PreviewModal';
import { ShareModal } from './components/ShareModal';
import { SharedView } from './components/SharedView';
import { ActivityView } from './components/ActivityView';
import { SettingsView } from './components/SettingsView';
import { AuthModal } from './components/AuthModal';
import { PublicSharePage } from './components/PublicSharePage';
import {
  NotesModal,
  NovaAssistantModal,
  ScheduleModal,
} from './components/CommandBarModals';
import { NovaParticlesField } from './components/NovaParticlesField';
import { ToastBanner, type ToastState, type ToastTone } from './components/ToastBanner';

const EMPTY_STORAGE: StorageBreakdown = {
  quotaBytes: THREE_TERABYTES_BYTES,
  usedBytes: 0,
  availableBytes: THREE_TERABYTES_BYTES,
  usedPercent: 0,
  fileCount: 0,
  categories: {
    photos: { bytes: 0, count: 0 },
    videos: { bytes: 0, count: 0 },
    documents: { bytes: 0, count: 0 },
    audio: { bytes: 0, count: 0 },
    archives: { bytes: 0, count: 0 },
    others: { bytes: 0, count: 0 },
  },
};

export default function App() {
  const [publicShareToken, setPublicShareToken] = useState<string | null>(() => {
    const m = window.location.pathname.match(/^\/share\/([^/]+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  });

  const [user, setUser] = useState<UserProfile | null>(null);
  const [storage, setStorage] = useState<StorageBreakdown>(EMPTY_STORAGE);
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // File manager state
  const [folders, setFolders] = useState<CloudFolder[]>([]);
  const [allFolders, setAllFolders] = useState<CloudFolder[]>([]);
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filesLoading, setFilesLoading] = useState(false);

  // Shares, activity, notes
  const [ownedShares, setOwnedShares] = useState<ShareRecord[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<ShareRecord[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [notes, setNotes] = useState<NoteRecord[]>([]);

  // Throughput indicators
  const [uploadMbps, setUploadMbps] = useState(94.74);
  const [downloadMbps, setDownloadMbps] = useState(95.42);

  // Modals
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [previewFile, setPreviewFile] = useState<CloudFile | null>(null);
  const [shareTargetFile, setShareTargetFile] = useState<CloudFile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [assistantModalState, setAssistantModalState] = useState<{
    open: boolean;
    query?: string;
  }>({ open: false });

  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback(
    (
      messageOrOpts:
        | string
        | {
            title?: string;
            message: string;
            tone?: ToastTone;
            durationMs?: number;
            actionLabel?: string;
            onAction?: () => Promise<void> | void;
          },
      tone: ToastTone = 'info'
    ) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const payload: ToastState =
        typeof messageOrOpts === 'string'
          ? {
              id,
              message: messageOrOpts,
              tone,
              durationMs: 3800,
            }
          : {
              id,
              title: messageOrOpts.title,
              message: messageOrOpts.message,
              tone: messageOrOpts.tone ?? tone,
              durationMs: messageOrOpts.durationMs ?? 4500,
              actionLabel: messageOrOpts.actionLabel,
              onAction: messageOrOpts.onAction,
            };

      setToast(payload);
      window.setTimeout(() => {
        setToast((prev) => (prev?.id === id ? null : prev));
      }, payload.durationMs);
    },
    []
  );

  // Listen to browser back/forward for public share URLs
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/^\/share\/([^/]+)$/);
      setPublicShareToken(m ? decodeURIComponent(m[1]) : null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const refreshStorage = useCallback(async () => {
    try {
      const s = await fetchStorage();
      setStorage(s);
    } catch {
      // ignore transient refresh failure
    }
  }, []);

  const refreshFiles = useCallback(
    async (overrideTab?: NavTab) => {
      if (!user) return;
      const tab = overrideTab ?? activeTab;
      setFilesLoading(true);
      try {
        const folderRes = await fetchAllFolders();
        setAllFolders(Array.isArray(folderRes?.folders) ? folderRes.folders : []);

        if (tab === 'shared') {
          setSharesLoading(true);
          const sh = await fetchSharesApi();
          setOwnedShares(Array.isArray(sh?.owned) ? sh.owned : []);
          setSharedWithMe(Array.isArray(sh?.sharedWithMe) ? sh.sharedWithMe : []);
          setSharesLoading(false);
          return;
        }

        if (tab === 'activity') {
          setActivityLoading(true);
          const act = await fetchActivityLogs();
          setActivityLogs(Array.isArray(act?.logs) ? act.logs : []);
          setActivityLoading(false);
          return;
        }

        const res = await fetchFiles({
          folderId: tab === 'files' ? currentFolderId : null,
          search: searchQuery.trim() || undefined,
          category:
            tab === 'media'
              ? 'media'
              : tab === 'files' && categoryFilter !== 'all'
              ? categoryFilter
              : undefined,
          trashed: tab === 'trash',
          favorites: tab === 'favorites',
          recent: tab === 'recent',
        });
        setFolders(Array.isArray(res?.folders) ? res.folders : []);
        setFiles(Array.isArray(res?.files) ? res.files : []);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Gagal memuat data vault.',
          'error'
        );
      } finally {
        setFilesLoading(false);
      }
    },
    [user, activeTab, currentFolderId, searchQuery, categoryFilter, showToast]
  );

  // Initial Bootstrap
  useEffect(() => {
    if (publicShareToken) return;
    let cancelled = false;

    async function bootstrap() {
      const existingToken = getAuthToken();
      if (existingToken) {
        try {
          const res = await fetchCurrentUser();
          if (!cancelled) {
            setUser(res.user);
            setStorage(res.storage);
            if (res.user.preferences?.viewMode) {
              setViewMode(res.user.preferences.viewMode);
            }
          }
          return;
        } catch {
          // Token expired or invalid — fall through to demo workspace
        }
      }

      try {
        const demo = await initDemoSession();
        if (!cancelled) {
          setUser(demo.user);
          setStorage(demo.storage);
        }
      } catch (err) {
        if (!cancelled) {
          showToast(
            err instanceof Error ? err.message : 'Gagal menghubungkan ke server.',
            'error'
          );
        }
      }
    }
    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [publicShareToken, showToast]);

  useEffect(() => {
    if (!user || publicShareToken) return;
    refreshFiles();
  }, [user, publicShareToken, activeTab, currentFolderId, searchQuery, categoryFilter, refreshFiles]);

  const handleOpenNotes = async () => {
    setNotesModalOpen(true);
    try {
      const res = await fetchNotes();
      setNotes(Array.isArray(res?.notes) ? res.notes : []);
    } catch {
      // ignore
    }
  };

  const handleStartUpload = useCallback(
    async (incoming: File[] | UploadPayload) => {
      const { entries, emptyFolderPaths } = normalizeUploadInput(incoming);
      if (!entries.length && !emptyFolderPaths.length) return;

      setUploadModalOpen(true);
      const baseFolderId = activeTab === 'files' ? currentFolderId : null;
      const folderPaths = collectUniqueFolderPaths(entries, emptyFolderPaths);

      let folderMap: Record<string, number> = {};
      if (folderPaths.length > 0) {
        try {
          const treeRes = await ensureFolderTreeApi(folderPaths, baseFolderId);
          folderMap = treeRes.folderMap;
        } catch (err) {
          showToast(
            err instanceof Error
              ? err.message
              : 'Gagal membuat struktur folder di vault.',
            'error'
          );
          return;
        }
      }

      if (entries.length === 0) {
        await refreshFiles();
        showToast(
          `${folderPaths.length} folder kosong berhasil dibuat di NEXAVAULT.`
        );
        return;
      }

      interface QueuedItem {
        taskId: string;
        file: File;
        relativePath: string;
        targetFolderId: number | null;
        cancelled: boolean;
        cancelActive: (() => void) | null;
      }

      const queue: QueuedItem[] = entries.map((entry) => {
        const { parentFolderPath } = splitRelativePath(entry.relativePath);
        const targetFolderId = parentFolderPath
          ? (folderMap[parentFolderPath] ?? baseFolderId)
          : baseFolderId;
        return {
          taskId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: entry.file,
          relativePath: entry.relativePath,
          targetFolderId,
          cancelled: false,
          cancelActive: null,
        };
      });

      const initialTasks: UploadTask[] = queue.map((item) => ({
        id: item.taskId,
        fileName: item.file.name,
        relativePath: item.relativePath,
        totalBytes: item.file.size,
        loadedBytes: 0,
        percent: 0,
        speedBps: 0,
        etaSeconds: 0,
        status: 'uploading',
        cancel: () => {
          item.cancelled = true;
          item.cancelActive?.();
          setUploadTasks((prev) =>
            prev.map((t) =>
              t.id === item.taskId ? { ...t, status: 'cancelled' } : t
            )
          );
        },
      }));

      setUploadTasks((prev) => [...initialTasks.reverse(), ...prev]);

      let nextIndex = 0;
      let completedCount = 0;
      const CONCURRENCY = 4;

      const worker = async () => {
        while (nextIndex < queue.length) {
          const item = queue[nextIndex++];
          if (!item || item.cancelled) continue;

          const { promise, cancel } = uploadFileWithProgress(
            item.file,
            item.targetFolderId,
            (loadedBytes, totalBytes, elapsedSec) => {
              const metrics = calculateUploadMetrics(
                loadedBytes,
                totalBytes,
                elapsedSec
              );
              const mbps = (metrics.speedBps * 8) / 1_000_000;
              if (mbps > 0.1) setUploadMbps(Number(mbps.toFixed(2)));
              setUploadTasks((prev) =>
                prev.map((t) =>
                  t.id === item.taskId
                    ? {
                        ...t,
                        loadedBytes,
                        percent: metrics.percent,
                        speedBps: metrics.speedBps,
                        etaSeconds: metrics.etaSeconds,
                      }
                    : t
                )
              );
            }
          );

          item.cancelActive = cancel;

          try {
            const res = await promise;
            completedCount += 1;
            setStorage(res.storage);
            setUploadTasks((prev) =>
              prev.map((t) =>
                t.id === item.taskId
                  ? {
                      ...t,
                      loadedBytes: t.totalBytes,
                      percent: 100,
                      status: 'completed',
                    }
                  : t
              )
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Upload gagal.';
            const isCancelled = msg.includes('dibatalkan');
            setUploadTasks((prev) =>
              prev.map((t) =>
                t.id === item.taskId
                  ? {
                      ...t,
                      status: isCancelled ? 'cancelled' : 'error',
                      errorMessage: msg,
                    }
                  : t
              )
            );
            if (!isCancelled) {
              showToast(`${item.relativePath}: ${msg}`, 'error');
            }
          }
        }
      };

      const workerCount = Math.min(CONCURRENCY, queue.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      await refreshFiles();

      if (completedCount > 0) {
        if (folderPaths.length > 0) {
          showToast(
            `Folder berhasil diunggah (${completedCount} file dalam ${folderPaths.length} folder).`
          );
        } else if (completedCount === 1) {
          showToast(
            `"${queue[0].file.name}" berhasil diunggah ke NEXAVAULT.`
          );
        } else {
          showToast(`${completedCount} file berhasil diunggah ke NEXAVAULT.`);
        }
      }
    },
    [activeTab, currentFolderId, refreshFiles, showToast]
  );

  const handleOpenPublicShareRoute = (token: string) => {
    window.history.pushState({}, '', `/share/${encodeURIComponent(token)}`);
    setPublicShareToken(token);
  };

  if (publicShareToken) {
    return (
      <PublicSharePage
        token={publicShareToken}
        onExit={() => {
          window.history.pushState({}, '', '/');
          setPublicShareToken(null);
        }}
      />
    );
  }

  const currentFolderObj = Array.isArray(allFolders)
    ? allFolders.find((f) => f.id === currentFolderId)
    : undefined;

  return (
    <div
      className="relative flex min-h-screen flex-col bg-[#090614] text-slate-100 lg:h-screen lg:flex-row lg:gap-3.5 lg:overflow-hidden lg:p-3.5"
      style={{
        backgroundColor: '#090614',
        backgroundImage:
          'radial-gradient(circle at 14% 16%, rgba(168, 85, 247, 0.32) 0%, transparent 46%), radial-gradient(circle at 86% 14%, rgba(250, 204, 21, 0.22) 0%, transparent 44%), radial-gradient(circle at 36% 86%, rgba(139, 92, 246, 0.26) 0%, transparent 48%), radial-gradient(circle at 82% 84%, rgba(234, 179, 8, 0.18) 0%, transparent 46%), linear-gradient(145deg, #090614 0%, #140a2b 48%, #0c071b 100%)',
      }}
    >
      {/* Full-viewport Nova Particle Field across all features */}
      <NovaParticlesField
        reducedMotion={Boolean(user?.preferences?.reducedMotion)}
      />

      {/* Left Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'files') setCategoryFilter('all');
        }}
        uploadMbps={uploadMbps}
        downloadMbps={downloadMbps}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Right Main Shell */}
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col lg:gap-3.5">
        {/* Top Bar */}
        <header className="glass-control flex shrink-0 items-center justify-between gap-4 border-x-0 border-t-0 px-4 py-3 sm:px-6 lg:rounded-2xl lg:border">
          <div className="flex flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="glass-control rounded-xl p-2 text-slate-200 hover:bg-white/[0.14] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.trim() && activeTab === 'home') {
                    setActiveTab('files');
                  }
                }}
                aria-label="Cari file di vault"
                placeholder="Cari file..."
                className="w-full rounded-xl border border-white/[0.14] bg-white/[0.06] py-2 pl-10 pr-4 text-xs text-white placeholder:text-slate-400 focus:border-amber-300/60 focus:bg-white/[0.1] focus:outline-none sm:text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              aria-label="Lihat aktivitas vault"
              className="glass-control flex h-9 w-9 items-center justify-center rounded-xl text-slate-200 transition-colors hover:border-white/30 hover:bg-white/[0.14] hover:text-amber-300"
            >
              <Bell className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="glass-control flex items-center gap-2.5 rounded-xl py-1.5 pl-3 pr-2 text-left transition-colors hover:border-white/30 hover:bg-white/[0.14]"
            >
              <span className="hidden text-xs font-medium text-slate-100 sm:inline">
                {user?.name || 'Nikitin Nova'}
              </span>
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-yellow-300 via-amber-400 to-purple-500 font-display text-xs font-bold text-slate-950">
                  {(user?.name || 'N').charAt(0).toUpperCase()}
                </span>
              )}
              <LogIn className="h-3.5 w-3.5 text-slate-300" />
            </button>
          </div>
        </header>

        {/* Main Workspace Content */}
        <main className="flex min-h-0 flex-1 flex-col gap-4 p-3 sm:p-4 lg:flex-row lg:gap-3.5 lg:overflow-y-auto lg:p-0">
          {activeTab === 'home' && (
            <HeroSection
              reducedMotion={Boolean(user?.preferences?.reducedMotion)}
              onOpenUpload={() => setUploadModalOpen(true)}
              onNavigate={(tab) => setActiveTab(tab)}
              onCommandSearch={(q) => {
                setSearchQuery(q);
                setActiveTab('files');
              }}
              onOpenNotes={handleOpenNotes}
              onOpenSchedule={() => setScheduleModalOpen(true)}
              onOpenAssistant={(q) =>
                setAssistantModalState({ open: true, query: q })
              }
            />
          )}

          {(activeTab === 'files' ||
            activeTab === 'media' ||
            activeTab === 'recent' ||
            activeTab === 'favorites' ||
            activeTab === 'trash') && (
            <FileManagerView
              mode={activeTab}
              folders={folders}
              allFolders={allFolders}
              files={files}
              loading={filesLoading}
              currentFolderId={currentFolderId}
              searchQuery={searchQuery}
              categoryFilter={categoryFilter}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onCategoryFilterChange={setCategoryFilter}
              onFolderOpen={(fid) => setCurrentFolderId(fid)}
              onCreateFolder={async (name) => {
                await createFolderApi(name, currentFolderId);
                await refreshFiles();
                showToast(`Folder "${name}" berhasil dibuat.`);
              }}
              onRenameFile={async (fileId, newName) => {
                await renameFileApi(fileId, newName);
                await refreshFiles();
                showToast(`File diubah namanya menjadi "${newName}".`);
              }}
              onRenameFolder={async (folderId, newName) => {
                await renameFolderApi(folderId, newName);
                await refreshFiles();
                showToast(`Folder diubah namanya menjadi "${newName}".`);
              }}
              onCopyFile={async (fileId, targetFolderId) => {
                const res = await copyFileApi(fileId, targetFolderId);
                setStorage(res.storage);
                await refreshFiles();
                showToast('Salinan file berhasil dibuat.');
              }}
              onMoveFile={async (fileId, targetFolderId) => {
                await moveFileApi(fileId, targetFolderId);
                await refreshFiles();
                showToast('File berhasil dipindahkan.');
              }}
              onToggleFavorite={async (fileId) => {
                const res = await toggleFavoriteApi(fileId);
                await refreshFiles();
                showToast(
                  res.isFavorite
                    ? 'Ditambahkan ke Favorit.'
                    : 'Dihapus dari Favorit.'
                );
              }}
              onDeleteFile={async (fileId, permanent = false) => {
                const targetFile = files.find((f) => f.id === fileId);
                const res = await deleteFileApi(fileId, permanent);
                if (res.storage) setStorage(res.storage);
                else await refreshStorage();
                await refreshFiles();
                const nameLabel = targetFile?.name
                  ? `"${targetFile.name}"`
                  : 'File';
                if (permanent) {
                  showToast({
                    title: 'File Dihapus Permanen',
                    message: targetFile
                      ? `${nameLabel} (${formatBytes(targetFile.sizeBytes)}) telah dihapus permanen & ruang dibebaskan.`
                      : `${nameLabel} telah dihapus permanen & kapasitas dibebaskan.`,
                    tone: 'danger',
                    durationMs: 5000,
                  });
                } else {
                  showToast({
                    title: 'Dipindahkan ke Sampah',
                    message: `${nameLabel} telah dihapus dari daftar dan dipindahkan ke Sampah.`,
                    tone: 'delete',
                    durationMs: 8000,
                    actionLabel: 'Urungkan',
                    onAction: async () => {
                      await restoreFileApi(fileId);
                      await refreshFiles();
                      showToast({
                        title: 'File Dipulihkan',
                        message: `${nameLabel} dikembalikan ke vault Anda.`,
                        tone: 'success',
                      });
                    },
                  });
                }
              }}
              onRestoreFile={async (fileId) => {
                const targetFile = files.find((f) => f.id === fileId);
                await restoreFileApi(fileId);
                await refreshFiles();
                showToast({
                  title: 'File Dipulihkan',
                  message: targetFile
                    ? `"${targetFile.name}" berhasil dipulihkan.`
                    : 'File berhasil dipulihkan.',
                  tone: 'success',
                });
              }}
              onDeleteFolder={async (folderId, permanent = false) => {
                const targetFolder =
                  folders.find((f) => f.id === folderId) ||
                  allFolders.find((f) => f.id === folderId);
                await deleteFolderApi(folderId, permanent);
                await refreshFiles();
                const folderLabel = targetFolder?.name
                  ? `"${targetFolder.name}"`
                  : 'Folder';
                if (permanent) {
                  showToast({
                    title: 'Folder Dihapus Permanen',
                    message: `Folder ${folderLabel} telah dihapus secara permanen.`,
                    tone: 'danger',
                    durationMs: 5000,
                  });
                } else {
                  showToast({
                    title: 'Folder Dipindahkan ke Sampah',
                    message: `Folder ${folderLabel} dipindahkan ke Sampah.`,
                    tone: 'delete',
                    durationMs: 8000,
                    actionLabel: 'Urungkan',
                    onAction: async () => {
                      await restoreFolderApi(folderId);
                      await refreshFiles();
                      showToast({
                        title: 'Folder Dipulihkan',
                        message: `Folder ${folderLabel} berhasil dikembalikan.`,
                        tone: 'success',
                      });
                    },
                  });
                }
              }}
              onRestoreFolder={async (folderId) => {
                const targetFolder = folders.find((f) => f.id === folderId);
                await restoreFolderApi(folderId);
                await refreshFiles();
                showToast({
                  title: 'Folder Dipulihkan',
                  message: targetFolder
                    ? `Folder "${targetFolder.name}" berhasil dipulihkan.`
                    : 'Folder berhasil dipulihkan.',
                  tone: 'success',
                });
              }}
              onBatchAction={async (fileIds, action, targetFolderId) => {
                const res = await batchFilesApi({
                  fileIds,
                  action,
                  targetFolderId,
                });
                setStorage(res.storage);
                await refreshFiles();
                if (action === 'trash') {
                  showToast({
                    title: 'Dipindahkan ke Sampah',
                    message: `${fileIds.length} file dipindahkan ke Sampah.`,
                    tone: 'delete',
                    durationMs: 5500,
                    actionLabel: 'Urungkan',
                    onAction: async () => {
                      const restored = await batchFilesApi({
                        fileIds,
                        action: 'restore',
                      });
                      setStorage(restored.storage);
                      await refreshFiles();
                      showToast({
                        title: 'File Dipulihkan',
                        message: `${fileIds.length} file berhasil dikembalikan.`,
                        tone: 'success',
                      });
                    },
                  });
                } else if (action === 'delete_permanent') {
                  showToast({
                    title: 'Dihapus Permanen',
                    message: `${fileIds.length} file telah dihapus permanen & kapasitas dibebaskan.`,
                    tone: 'danger',
                    durationMs: 5000,
                  });
                } else if (action === 'restore') {
                  showToast({
                    title: 'File Dipulihkan',
                    message: `${fileIds.length} file berhasil dipulihkan.`,
                    tone: 'success',
                  });
                } else {
                  showToast(`${fileIds.length} file berhasil dipindahkan.`);
                }
              }}
              onPreviewFile={(file) => {
                setPreviewFile(file);
                setDownloadMbps(96.18);
                markFileOpenedApi(file.id).catch(() => {});
              }}
              onShareFile={(file) => setShareTargetFile(file)}
              onOpenUpload={() => setUploadModalOpen(true)}
              onDropFiles={handleStartUpload}
            />
          )}

          {activeTab === 'shared' && (
            <SharedView
              ownedShares={ownedShares}
              sharedWithMe={sharedWithMe}
              loading={sharesLoading}
              onRevokeShare={async (shareId) => {
                await revokeShareApi(shareId);
                await refreshFiles('shared');
                showToast('Tautan berbagi dicabut.');
              }}
              onOpenSharePage={handleOpenPublicShareRoute}
            />
          )}

          {activeTab === 'activity' && (
            <ActivityView logs={activityLogs} loading={activityLoading} />
          )}

          {activeTab === 'settings' && user && (
            <SettingsView
              user={user}
              storage={storage}
              onSaveProfile={async (name, prefs: UserPreferences) => {
                const res = await updateProfile({ name, preferences: prefs });
                setUser(res.user);
                if (prefs.viewMode) setViewMode(prefs.viewMode);
              }}
              onOpenAuthModal={() => setAuthModalOpen(true)}
              onLogout={async () => {
                setAuthToken(null);
                const demo = await initDemoSession();
                setUser(demo.user);
                setStorage(demo.storage);
                setActiveTab('home');
                showToast('Anda keluar ke sesi ruang kerja demo.');
              }}
              onVerifyToken={async (token) => {
                const res = await verifyEmail(token);
                setUser(res.user);
                showToast('Email berhasil diverifikasi.');
              }}
            />
          )}

          {/* Right Storage Capacity Card (Home & File Manager) */}
          {(activeTab === 'home' || activeTab === 'files') && (
            <StorageCapacityCard
              storage={storage}
              onUploadClick={() => setUploadModalOpen(true)}
              onCategorySelect={(cat: FileCategory) => {
                setCategoryFilter(cat);
                setActiveTab('files');
              }}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <UploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        tasks={uploadTasks}
        onStartUpload={handleStartUpload}
        currentFolderName={currentFolderObj?.name || null}
      />

      <PreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onShare={(f) => {
          setPreviewFile(null);
          setShareTargetFile(f);
        }}
      />

      <ShareModal
        file={shareTargetFile}
        onClose={() => setShareTargetFile(null)}
        onCreated={() => {
          if (activeTab === 'shared') refreshFiles('shared');
        }}
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={(u, s) => {
          setUser(u);
          setStorage(s);
          setCurrentFolderId(null);
          refreshFiles();
          showToast(`Selamat datang, ${u.name}!`);
        }}
        onUseDemo={async () => {
          const demo = await initDemoSession();
          setUser(demo.user);
          setStorage(demo.storage);
          setCurrentFolderId(null);
          refreshFiles();
        }}
      />

      <NotesModal
        open={notesModalOpen}
        notes={notes}
        onClose={() => setNotesModalOpen(false)}
        onCreateNote={async (title, content) => {
          const res = await createNoteApi(title, content);
          setNotes((prev) => [res.note, ...prev]);
        }}
        onDeleteNote={async (id) => {
          await deleteNoteApi(id);
          setNotes((prev) => prev.filter((n) => n.id !== id));
        }}
      />

      <ScheduleModal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        onUploadNow={() => setUploadModalOpen(true)}
      />

      <NovaAssistantModal
        open={assistantModalState.open}
        initialQuery={assistantModalState.query}
        storage={storage}
        onClose={() => setAssistantModalState({ open: false })}
        onQuickUpload={() => setUploadModalOpen(true)}
        onSearchFiles={(q) => {
          setSearchQuery(q);
          setActiveTab('files');
        }}
      />

      {/* Animated Toast Notification */}
      <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
