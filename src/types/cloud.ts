import type { FileCategory, StorageBreakdown } from '../utils/storageMath';

export type NavTab =
  | 'home'
  | 'files'
  | 'media'
  | 'recent'
  | 'shared'
  | 'favorites'
  | 'trash'
  | 'activity'
  | 'settings';

export interface UserPreferences {
  viewMode?: 'grid' | 'list';
  notificationsEnabled?: boolean;
  compactDensity?: boolean;
  reducedMotion?: boolean;
}

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  name: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  storageQuotaBytes: number;
  preferences: UserPreferences | null;
}

export interface CloudFolder {
  id: number;
  userId: number;
  parentId: number | null;
  name: string;
  color: string;
  isTrashed: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudFile {
  id: number;
  userId: number;
  folderId: number | null;
  name: string;
  originalName: string;
  mimeType: string;
  extension: string;
  category: FileCategory;
  sizeBytes: number;
  storageKey: string;
  isFavorite: boolean;
  isTrashed: boolean;
  trashedAt: string | null;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
  signedUrl: string;
}

export interface ShareRecord {
  id: number;
  fileId: number;
  ownerId: number;
  token: string;
  sharedWithEmail: string | null;
  permission: 'viewer' | 'downloader';
  hasPassword: boolean;
  expiresAt: string | null;
  downloadCount: number;
  isRevoked: boolean;
  createdAt: string;
  ownerName?: string;
  ownerEmail?: string;
  file: CloudFile;
}

export interface ActivityLogRecord {
  id: number;
  userId: number;
  fileId: number | null;
  action: string;
  targetName: string;
  details: string | null;
  createdAt: string;
}

export interface NoteRecord {
  id: number;
  userId: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadTask {
  id: string;
  fileName: string;
  relativePath?: string;
  totalBytes: number;
  loadedBytes: number;
  percent: number;
  speedBps: number;
  etaSeconds: number;
  status: 'uploading' | 'completed' | 'cancelled' | 'error';
  errorMessage?: string;
  cancel: () => void;
}

export type { StorageBreakdown, FileCategory };
