export type FileCategory =
  | 'photos'
  | 'videos'
  | 'documents'
  | 'audio'
  | 'archives'
  | 'others';

export const THREE_TERABYTES_BYTES = 3_000_000_000_000; // 3,000 GB (3 TB)

const PHOTO_EXTS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'svg',
  'bmp',
  'ico',
  'heic',
  'avif',
  'raw',
  'tiff',
]);

const VIDEO_EXTS = new Set([
  'mp4',
  'mov',
  'avi',
  'mkv',
  'webm',
  'flv',
  'wmv',
  'm4v',
]);

const AUDIO_EXTS = new Set([
  'mp3',
  'wav',
  'flac',
  'aac',
  'ogg',
  'm4a',
  'wma',
  'opus',
]);

const DOCUMENT_EXTS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'ppt',
  'pptx',
  'txt',
  'md',
  'rtf',
  'json',
  'xml',
  'yaml',
  'yml',
  'html',
  'css',
  'ts',
  'tsx',
  'js',
  'jsx',
]);

const ARCHIVE_EXTS = new Set([
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'bz2',
  'xz',
  'iso',
]);

export function extractExtension(filename: string): string {
  const clean = filename.trim();
  const idx = clean.lastIndexOf('.');
  if (idx <= 0 || idx === clean.length - 1) return '';
  return clean.slice(idx + 1).toLowerCase();
}

export function classifyFileCategory(
  filename: string,
  mimeType?: string
): FileCategory {
  const ext = extractExtension(filename);
  if (PHOTO_EXTS.has(ext)) return 'photos';
  if (VIDEO_EXTS.has(ext)) return 'videos';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (DOCUMENT_EXTS.has(ext)) return 'documents';
  if (ARCHIVE_EXTS.has(ext)) return 'archives';

  if (mimeType) {
    const mime = mimeType.toLowerCase();
    if (mime.startsWith('image/')) return 'photos';
    if (mime.startsWith('video/')) return 'videos';
    if (mime.startsWith('audio/')) return 'audio';
    if (
      mime.includes('pdf') ||
      mime.includes('word') ||
      mime.includes('excel') ||
      mime.includes('spreadsheet') ||
      mime.includes('presentation') ||
      mime.startsWith('text/') ||
      mime.includes('json') ||
      mime.includes('xml')
    ) {
      return 'documents';
    }
    if (
      mime.includes('zip') ||
      mime.includes('rar') ||
      mime.includes('7z') ||
      mime.includes('tar') ||
      mime.includes('compressed')
    ) {
      return 'archives';
    }
  }

  return 'others';
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1000;
  const dm = Math.max(0, decimals);
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    sizes.length - 1,
    Math.floor(Math.log(bytes) / Math.log(k))
  );
  const value = bytes / Math.pow(k, i);
  const formatted =
    i === 0 ? String(Math.round(value)) : value.toFixed(value >= 100 ? 1 : dm);
  return `${formatted.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} ${sizes[i]}`;
}

export function formatStorageGb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 GB';
  const gb = bytes / 1_000_000_000;
  if (gb < 0.01) {
    const mb = bytes / 1_000_000;
    if (mb < 0.1) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
    return `${mb.toFixed(1)} MB`;
  }
  if (gb < 1) return `${gb.toFixed(2)} GB`;
  if (gb < 100) return `${gb.toFixed(1)} GB`;
  return `${Math.round(gb).toLocaleString('id-ID')} GB`;
}

export interface StorageSummaryInput {
  category: string;
  sizeBytes: number;
  isTrashed: boolean;
}

export interface StorageBreakdown {
  quotaBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  fileCount: number;
  categories: Record<
    FileCategory,
    {
      bytes: number;
      count: number;
    }
  >;
}

export function computeStorageBreakdown(
  items: StorageSummaryInput[],
  quotaBytes = THREE_TERABYTES_BYTES
): StorageBreakdown {
  const categories: StorageBreakdown['categories'] = {
    photos: { bytes: 0, count: 0 },
    videos: { bytes: 0, count: 0 },
    documents: { bytes: 0, count: 0 },
    audio: { bytes: 0, count: 0 },
    archives: { bytes: 0, count: 0 },
    others: { bytes: 0, count: 0 },
  };

  let usedBytes = 0;
  let fileCount = 0;

  for (const item of items) {
    const size = Math.max(0, Number(item.sizeBytes) || 0);
    usedBytes += size;
    fileCount += 1;
    const cat = (
      item.category in categories ? item.category : 'others'
    ) as FileCategory;
    categories[cat].bytes += size;
    categories[cat].count += 1;
  }

  const safeQuota = Math.max(1, quotaBytes);
  const availableBytes = Math.max(0, safeQuota - usedBytes);
  const usedPercent = Math.min(100, (usedBytes / safeQuota) * 100);

  return {
    quotaBytes: safeQuota,
    usedBytes,
    availableBytes,
    usedPercent,
    fileCount,
    categories,
  };
}

export function canAcceptUpload(
  currentUsedBytes: number,
  incomingBytes: number,
  quotaBytes = THREE_TERABYTES_BYTES
): { allowed: boolean; remainingBytes: number; overflowBytes: number } {
  const used = Math.max(0, currentUsedBytes);
  const incoming = Math.max(0, incomingBytes);
  const remaining = Math.max(0, quotaBytes - used);
  const allowed = used + incoming <= quotaBytes;
  return {
    allowed,
    remainingBytes: remaining,
    overflowBytes: allowed ? 0 : used + incoming - quotaBytes,
  };
}

export function calculateUploadMetrics(
  loadedBytes: number,
  totalBytes: number,
  elapsedSeconds: number
): {
  percent: number;
  speedBps: number;
  etaSeconds: number;
} {
  const total = Math.max(1, totalBytes);
  const loaded = Math.min(total, Math.max(0, loadedBytes));
  const percent = Math.min(100, Math.round((loaded / total) * 100));
  const safeElapsed = Math.max(0.05, elapsedSeconds);
  const speedBps = loaded / safeElapsed;
  const remaining = Math.max(0, total - loaded);
  const etaSeconds = speedBps > 0 ? Math.ceil(remaining / speedBps) : 0;
  return { percent, speedBps, etaSeconds };
}
