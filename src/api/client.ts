import type {
  ActivityLogRecord,
  CloudFile,
  CloudFolder,
  NoteRecord,
  ShareRecord,
  StorageBreakdown,
  UserPreferences,
  UserProfile,
} from '../types/cloud';

let activeAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
  activeAuthToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      window.sessionStorage.setItem('nexavault_session', token);
    } else {
      window.sessionStorage.removeItem('nexavault_session');
    }
  }
}

export function getAuthToken(): string | null {
  if (activeAuthToken) return activeAuthToken;
  if (typeof window !== 'undefined') {
    const saved = window.sessionStorage.getItem('nexavault_session');
    if (saved) {
      activeAuthToken = saved;
      return saved;
    }
  }
  return null;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (
    options.body &&
    typeof options.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  let parsedJson = true;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    parsedJson = false;
    data = {};
  }

  if (!res.ok) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : `Permintaan gagal (${res.status})`
    );
  }

  if (text && !parsedJson) {
    throw new Error('Respon server bukan JSON yang valid.');
  }

  return data as T;
}

export async function initDemoSession() {
  const data = await apiFetch<{
    token: string;
    user: UserProfile;
    storage: StorageBreakdown;
  }>('/api/auth/demo', { method: 'POST' });
  setAuthToken(data.token);
  return data;
}

export async function registerAccount(payload: {
  name: string;
  email: string;
  password: string;
}) {
  const data = await apiFetch<{
    token: string;
    user: UserProfile;
    storage: StorageBreakdown;
    verificationToken?: string;
  }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setAuthToken(data.token);
  return data;
}

export async function loginAccount(payload: {
  email: string;
  password: string;
}) {
  const data = await apiFetch<{
    token: string;
    user: UserProfile;
    storage: StorageBreakdown;
  }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setAuthToken(data.token);
  return data;
}

export async function syncFirebaseUser(idToken: string) {
  setAuthToken(idToken);
  return apiFetch<{ user: UserProfile; storage: StorageBreakdown }>(
    '/api/auth/firebase-sync',
    { method: 'POST' }
  );
}

export async function verifyEmail(token: string) {
  return apiFetch<{ user: UserProfile }>('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function forgotPassword(email: string) {
  return apiFetch<{ message: string; resetToken?: string }>(
    '/api/auth/forgot-password',
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    }
  );
}

export async function resetPassword(token: string, newPassword: string) {
  return apiFetch<{ message: string }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function fetchCurrentUser() {
  return apiFetch<{ user: UserProfile; storage: StorageBreakdown }>(
    '/api/auth/me'
  );
}

export async function updateProfile(payload: {
  name?: string;
  preferences?: UserPreferences;
}) {
  return apiFetch<{ user: UserProfile }>('/api/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function fetchStorage() {
  return apiFetch<StorageBreakdown>('/api/storage');
}

export async function fetchAllFolders() {
  const data = await apiFetch<{ folders?: CloudFolder[] }>('/api/folders');
  return {
    folders: Array.isArray(data?.folders) ? data.folders : [],
  };
}

export async function createFolderApi(
  name: string,
  parentId?: number | null,
  color?: string
) {
  return apiFetch<{ folder: CloudFolder }>('/api/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentId: parentId || null, color }),
  });
}

export async function ensureFolderTreeApi(
  paths: string[],
  baseFolderId?: number | null
) {
  return apiFetch<{
    folderMap: Record<string, number>;
    folders: CloudFolder[];
  }>('/api/folders/ensure-tree', {
    method: 'POST',
    body: JSON.stringify({
      paths,
      baseFolderId: baseFolderId || null,
    }),
  });
}

export async function renameFolderApi(folderId: number, name: string) {
  return apiFetch<{ folder: CloudFolder }>(`/api/folders/${folderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteFolderApi(folderId: number, permanent = false) {
  return apiFetch<{ deleted?: boolean; folder?: CloudFolder }>(
    `/api/folders/${folderId}${permanent ? '?permanent=true' : ''}`,
    { method: 'DELETE' }
  );
}

export async function restoreFolderApi(folderId: number) {
  return apiFetch<{ folder: CloudFolder }>(`/api/folders/${folderId}/restore`, {
    method: 'POST',
  });
}

export async function fetchFiles(params: {
  folderId?: number | null;
  search?: string;
  category?: string;
  trashed?: boolean;
  favorites?: boolean;
  recent?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params.folderId) qs.set('folderId', String(params.folderId));
  if (params.search) qs.set('search', params.search);
  if (params.category) qs.set('category', params.category);
  if (params.trashed) qs.set('trashed', 'true');
  if (params.favorites) qs.set('favorites', 'true');
  if (params.recent) qs.set('recent', 'true');
  const data = await apiFetch<{ folders?: CloudFolder[]; files?: CloudFile[] }>(
    `/api/files?${qs.toString()}`
  );
  return {
    folders: Array.isArray(data?.folders) ? data.folders : [],
    files: Array.isArray(data?.files) ? data.files : [],
  };
}

export async function renameFileApi(fileId: number, name: string) {
  return apiFetch<{ file: CloudFile }>(`/api/files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function moveFileApi(fileId: number, folderId: number | null) {
  return apiFetch<{ file: CloudFile }>(`/api/files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ folderId }),
  });
}

export async function markFileOpenedApi(fileId: number) {
  return apiFetch<{ ok: boolean }>(`/api/files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ opened: true }),
  });
}

export async function copyFileApi(fileId: number, folderId: number | null) {
  return apiFetch<{ file: CloudFile; storage: StorageBreakdown }>(
    `/api/files/${fileId}/copy`,
    {
      method: 'POST',
      body: JSON.stringify({ folderId }),
    }
  );
}

export async function toggleFavoriteApi(fileId: number) {
  return apiFetch<{ isFavorite: boolean }>(`/api/files/${fileId}/favorite`, {
    method: 'POST',
  });
}

export async function deleteFileApi(fileId: number, permanent = false) {
  return apiFetch<{ deleted?: boolean; storage?: StorageBreakdown }>(
    `/api/files/${fileId}${permanent ? '?permanent=true' : ''}`,
    { method: 'DELETE' }
  );
}

export async function restoreFileApi(fileId: number) {
  return apiFetch<{ file: CloudFile }>(`/api/files/${fileId}/restore`, {
    method: 'POST',
  });
}

export async function batchFilesApi(payload: {
  fileIds: number[];
  action: 'trash' | 'restore' | 'delete_permanent' | 'move';
  targetFolderId?: number | null;
}) {
  return apiFetch<{ ok: boolean; storage: StorageBreakdown }>(
    '/api/files/batch',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function fetchSharesApi() {
  const data = await apiFetch<{ owned?: ShareRecord[]; sharedWithMe?: ShareRecord[] }>(
    '/api/shares'
  );
  return {
    owned: Array.isArray(data?.owned) ? data.owned : [],
    sharedWithMe: Array.isArray(data?.sharedWithMe) ? data.sharedWithMe : [],
  };
}

export async function createShareApi(payload: {
  fileId: number;
  permission: 'viewer' | 'downloader';
  password?: string;
  expiresAt?: string | null;
  sharedWithEmail?: string;
}) {
  return apiFetch<{ share: ShareRecord }>('/api/shares', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function revokeShareApi(shareId: number) {
  return apiFetch<{ share: ShareRecord }>(`/api/shares/${shareId}`, {
    method: 'DELETE',
  });
}

export async function fetchPublicShare(token: string) {
  return apiFetch<{
    token: string;
    permission: 'viewer' | 'downloader';
    requiresPassword: boolean;
    expiresAt: string | null;
    downloadCount: number;
    ownerName: string;
    file: CloudFile;
    contentUrl: string | null;
  }>(`/api/public/share/${encodeURIComponent(token)}`);
}

export async function unlockPublicShare(token: string, password: string) {
  return apiFetch<{ contentUrl: string }>(
    `/api/public/share/${encodeURIComponent(token)}/unlock`,
    {
      method: 'POST',
      body: JSON.stringify({ password }),
    }
  );
}

export async function fetchActivityLogs() {
  const data = await apiFetch<{ logs?: ActivityLogRecord[] }>('/api/activity');
  return {
    logs: Array.isArray(data?.logs) ? data.logs : [],
  };
}

export async function fetchNotes() {
  const data = await apiFetch<{ notes?: NoteRecord[] }>('/api/notes');
  return {
    notes: Array.isArray(data?.notes) ? data.notes : [],
  };
}

export async function createNoteApi(title: string, content: string) {
  return apiFetch<{ note: NoteRecord }>('/api/notes', {
    method: 'POST',
    body: JSON.stringify({ title, content }),
  });
}

export async function deleteNoteApi(id: number) {
  return apiFetch<{ deleted: boolean }>(`/api/notes/${id}`, {
    method: 'DELETE',
  });
}

export function uploadFileWithProgress(
  file: File,
  folderId: number | null,
  onProgress: (loadedBytes: number, totalBytes: number, elapsedSec: number) => void
): {
  promise: Promise<{ files: CloudFile[]; storage: StorageBreakdown }>;
  cancel: () => void;
} {
  const CHUNK_THRESHOLD = 20 * 1024 * 1024; // 20 MB uses resumable chunked session
  if (file.size > CHUNK_THRESHOLD) {
    return uploadLargeFileChunked(file, folderId, onProgress);
  }

  const xhr = new XMLHttpRequest();
  const startedAt = performance.now();

  const promise = new Promise<{ files: CloudFile[]; storage: StorageBreakdown }>(
    (resolve, reject) => {
      xhr.open('POST', '/api/files/upload');
      const token = getAuthToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const elapsed = (performance.now() - startedAt) / 1000;
          onProgress(evt.loaded, evt.total, elapsed);
        }
      };

      xhr.onload = () => {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error || `Upload gagal (${xhr.status})`));
          }
        } catch {
          reject(new Error('Respon server tidak valid.'));
        }
      };

      xhr.onerror = () => reject(new Error('Koneksi jaringan terputus.'));
      xhr.onabort = () => reject(new Error('Upload dibatalkan.'));

      const formData = new FormData();
      formData.append('folderId', folderId ? String(folderId) : 'null');
      formData.append('files', file);
      xhr.send(formData);
    }
  );

  return {
    promise,
    cancel: () => xhr.abort(),
  };
}

function uploadLargeFileChunked(
  file: File,
  folderId: number | null,
  onProgress: (loadedBytes: number, totalBytes: number, elapsedSec: number) => void
) {
  let cancelled = false;
  let sessionId: string | null = null;
  const controller = new AbortController();

  const promise = (async () => {
    const startedAt = performance.now();
    const init = await apiFetch<{ session: { id: string } }>('/api/uploads/init', {
      method: 'POST',
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        totalBytes: file.size,
        folderId,
      }),
    });
    sessionId = init.session.id;

    const CHUNK_SIZE = 4 * 1024 * 1024;
    let offset = 0;
    const token = getAuthToken();

    while (offset < file.size) {
      if (cancelled) {
        throw new Error('Upload dibatalkan.');
      }
      const slice = file.slice(offset, Math.min(file.size, offset + CHUNK_SIZE));
      const res = await fetch(`/api/uploads/${sessionId}/chunk`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: slice,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error('Gagal mengirim potongan file.');
      }
      offset += slice.size;
      const elapsed = (performance.now() - startedAt) / 1000;
      onProgress(offset, file.size, elapsed);
    }

    const completed = await apiFetch<{
      file: CloudFile;
      storage: StorageBreakdown;
    }>(`/api/uploads/${sessionId}/complete`, { method: 'POST' });

    return {
      files: [completed.file],
      storage: completed.storage,
    };
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      controller.abort();
      if (sessionId) {
        apiFetch(`/api/uploads/${sessionId}`, { method: 'DELETE' }).catch(() => {});
      }
    },
  };
}
