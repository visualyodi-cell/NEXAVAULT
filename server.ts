import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  signFileUrl,
  signSessionToken,
  verifySessionToken,
  verifySignedFileUrl,
} from './src/lib/signedUrls.ts';
import {
  VAULT_ROOT,
  completePasswordReset,
  copyFile,
  createFolder,
  createLocalUser,
  createNote,
  createPasswordReset,
  createShareLink,
  createUploadSessionRecord,
  deleteFilePermanently,
  deleteFolderPermanently,
  deleteNote,
  ensureDemoWorkspaceSeeded,
  ensureFolderTree,
  getAllFoldersForUser,
  getFileForUser,
  getShareByToken,
  getUploadSession,
  getUserByEmail,
  getUserVaultDir,
  incrementShareDownload,
  insertUploadedFile,
  listActivityLogs,
  listNotes,
  listSharesForUser,
  listWorkspaceItems,
  logActivity,
  markFileOpened,
  moveFile,
  recalculateStorageUsage,
  renameFile,
  renameFolder,
  restoreFile,
  restoreFolder,
  revokeShareLink,
  toggleFavorite,
  trashFile,
  trashFolder,
  updateUploadSession,
  updateUserProfile,
  verifyUserEmailToken,
} from './src/db/storageRepo.ts';
import {
  THREE_TERABYTES_BYTES,
  canAcceptUpload,
} from './src/utils/storageMath.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Simple sliding-window IP rate limiter
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${req.baseUrl}:${ip}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > maxRequests) {
      return res.status(429).json({
        error: 'Terlalu banyak permintaan. Coba lagi dalam beberapa saat.',
      });
    }
    return next();
  };
}

// Temporary staging directory for multer before moving into user's private vault
const TEMP_UPLOAD_DIR = path.join(VAULT_ROOT, '_tmp');
fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: TEMP_UPLOAD_DIR,
  limits: {
    fileSize: 512 * 1024 * 1024, // 512 MB per single multipart request; larger files use chunked upload sessions
    files: 25,
  },
});

function sanitizeUserResponse(user: {
  id: number;
  uid: string;
  email: string;
  name: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  storageQuotaBytes: number;
  preferences: unknown;
}) {
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    avatarUrl: user.avatarUrl,
    storageQuotaBytes: user.storageQuotaBytes,
    preferences: user.preferences,
  };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  app.use('/api/uploads/:sessionId/chunk', express.raw({ type: 'application/octet-stream', limit: '32mb' }));
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'NEXAVAULT', quotaBytes: THREE_TERABYTES_BYTES });
  });

  // =========================================================================
  // AUTH ROUTES
  // =========================================================================
  app.post('/api/auth/demo', rateLimit(60, 60_000), async (_req, res) => {
    try {
      const demoUser = await ensureDemoWorkspaceSeeded();
      const sessionToken = signSessionToken(demoUser.uid, demoUser.email);
      const storage = await recalculateStorageUsage(demoUser.id);
      res.json({
        token: sessionToken,
        user: sanitizeUserResponse(demoUser),
        storage,
      });
    } catch (error) {
      console.error('Demo auth error:', error);
      res.status(500).json({ error: 'Gagal memuat sesi demo NEXAVAULT.' });
    }
  });

  app.post('/api/auth/register', rateLimit(20, 60_000), async (req, res) => {
    try {
      const { name, email, password } = req.body as {
        name?: string;
        email?: string;
        password?: string;
      };
      if (!name?.trim() || !email?.trim() || !password) {
        return res
          .status(400)
          .json({ error: 'Nama, email, dan kata sandi wajib diisi.' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: 'Format email tidak valid.' });
      }
      if (password.length < 6) {
        return res
          .status(400)
          .json({ error: 'Kata sandi minimal 6 karakter.' });
      }

      const existing = await getUserByEmail(email.trim());
      if (existing) {
        return res
          .status(409)
          .json({ error: 'Email sudah terdaftar di NEXAVAULT.' });
      }

      const created = await createLocalUser(email.trim(), name.trim(), password);
      const sessionToken = signSessionToken(created.uid, created.email);
      const storage = await recalculateStorageUsage(created.id);

      res.status(201).json({
        token: sessionToken,
        user: sanitizeUserResponse(created),
        storage,
        verificationToken: created.verificationToken,
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Gagal mendaftarkan akun.' });
    }
  });

  app.post('/api/auth/login', rateLimit(30, 60_000), async (req, res) => {
    try {
      const { email, password } = req.body as {
        email?: string;
        password?: string;
      };
      if (!email?.trim() || !password) {
        return res
          .status(400)
          .json({ error: 'Email dan kata sandi wajib diisi.' });
      }

      const user = await getUserByEmail(email.trim());
      if (!user || !user.passwordHash) {
        return res
          .status(401)
          .json({ error: 'Email atau kata sandi tidak valid.' });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res
          .status(401)
          .json({ error: 'Email atau kata sandi tidak valid.' });
      }

      const sessionToken = signSessionToken(user.uid, user.email);
      const storage = await recalculateStorageUsage(user.id);
      await logActivity(user.id, 'auth', user.email, 'Masuk ke NEXAVAULT');

      res.json({
        token: sessionToken,
        user: sanitizeUserResponse(user),
        storage,
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Gagal masuk ke akun.' });
    }
  });

  app.post('/api/auth/verify-email', rateLimit(20, 60_000), async (req, res) => {
    try {
      const { token } = req.body as { token?: string };
      if (!token) {
        return res.status(400).json({ error: 'Token verifikasi diperlukan.' });
      }
      const verified = await verifyUserEmailToken(token);
      if (!verified) {
        return res
          .status(400)
          .json({ error: 'Token verifikasi tidak valid atau sudah digunakan.' });
      }
      res.json({ user: sanitizeUserResponse(verified) });
    } catch (error) {
      console.error('Verify email error:', error);
      res.status(500).json({ error: 'Gagal memverifikasi email.' });
    }
  });

  app.post('/api/auth/forgot-password', rateLimit(15, 60_000), async (req, res) => {
    try {
      const { email } = req.body as { email?: string };
      if (!email?.trim()) {
        return res.status(400).json({ error: 'Email wajib diisi.' });
      }
      const result = await createPasswordReset(email.trim());
      if (!result) {
        return res.json({
          message:
            'Jika email terdaftar, instruksi reset kata sandi telah disiapkan.',
        });
      }
      res.json({
        message: 'Token reset kata sandi berhasil dibuat.',
        resetToken: result.resetToken,
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Gagal memproses lupa kata sandi.' });
    }
  });

  app.post('/api/auth/reset-password', rateLimit(15, 60_000), async (req, res) => {
    try {
      const { token, newPassword } = req.body as {
        token?: string;
        newPassword?: string;
      };
      if (!token || !newPassword || newPassword.length < 6) {
        return res.status(400).json({
          error: 'Token valid dan kata sandi baru minimal 6 karakter diperlukan.',
        });
      }
      const updated = await completePasswordReset(token, newPassword);
      if (!updated) {
        return res
          .status(400)
          .json({ error: 'Token reset tidak valid atau sudah kedaluwarsa.' });
      }
      res.json({ message: 'Kata sandi berhasil diperbarui.' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Gagal memperbarui kata sandi.' });
    }
  });

  app.post('/api/auth/firebase-sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.userRecord!;
      const storage = await recalculateStorageUsage(user.id);
      res.json({
        user: sanitizeUserResponse(user),
        storage,
      });
    } catch (error) {
      console.error('Firebase sync error:', error);
      res.status(500).json({ error: 'Gagal menyinkronkan akun Google.' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.userRecord!;
      const storage = await recalculateStorageUsage(user.id);
      res.json({
        user: sanitizeUserResponse(user),
        storage,
      });
    } catch (error) {
      console.error('Me error:', error);
      res.status(500).json({ error: 'Gagal mengambil profil pengguna.' });
    }
  });

  app.patch('/api/auth/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.userRecord!;
      const { name, preferences } = req.body as {
        name?: string;
        preferences?: Record<string, unknown>;
      };
      const updated = await updateUserProfile(user.id, { name, preferences });
      if (!updated) {
        return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      }
      res.json({ user: sanitizeUserResponse(updated) });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Gagal memperbarui profil.' });
    }
  });

  // =========================================================================
  // STORAGE & FILES ROUTES
  // =========================================================================
  app.get('/api/storage', requireAuth, async (req: AuthRequest, res) => {
    try {
      const storage = await recalculateStorageUsage(req.userRecord!.id);
      res.json(storage);
    } catch (error) {
      console.error('Storage error:', error);
      res.status(500).json({ error: 'Gagal memuat ringkasan penyimpanan.' });
    }
  });

  app.get('/api/folders', requireAuth, async (req: AuthRequest, res) => {
    try {
      const all = await getAllFoldersForUser(req.userRecord!.id);
      res.json({ folders: all });
    } catch (error) {
      console.error('List folders error:', error);
      res.status(500).json({ error: 'Gagal memuat folder.' });
    }
  });

  app.post('/api/folders', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { name, parentId, color } = req.body as {
        name?: string;
        parentId?: number | null;
        color?: string;
      };
      if (!name?.trim()) {
        return res.status(400).json({ error: 'Nama folder wajib diisi.' });
      }
      const created = await createFolder(
        req.userRecord!.id,
        name.trim(),
        parentId || null,
        color
      );
      res.status(201).json({ folder: created });
    } catch (error) {
      console.error('Create folder error:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Gagal membuat folder.',
      });
    }
  });

  app.post(
    '/api/folders/ensure-tree',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const { baseFolderId, paths } = req.body as {
          baseFolderId?: number | null;
          paths?: string[];
        };
        if (!Array.isArray(paths)) {
          return res.status(400).json({ error: 'Daftar path folder tidak valid.' });
        }
        const safeBaseId =
          typeof baseFolderId === 'number' && Number.isFinite(baseFolderId)
            ? baseFolderId
            : null;
        const result = await ensureFolderTree(
          req.userRecord!.id,
          safeBaseId,
          paths.slice(0, 500)
        );
        res.status(201).json(result);
      } catch (error) {
        console.error('Ensure folder tree error:', error);
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : 'Gagal menyinkronkan struktur folder.',
        });
      }
    }
  );

  app.patch('/api/folders/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { name } = req.body as { name?: string };
      if (!name?.trim()) {
        return res.status(400).json({ error: 'Nama folder wajib diisi.' });
      }
      const updated = await renameFolder(id, req.userRecord!.id, name);
      if (!updated) {
        return res.status(404).json({ error: 'Folder tidak ditemukan.' });
      }
      res.json({ folder: updated });
    } catch (error) {
      console.error('Rename folder error:', error);
      res.status(500).json({ error: 'Gagal mengubah nama folder.' });
    }
  });

  app.delete('/api/folders/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const permanent = req.query.permanent === 'true';
      if (permanent) {
        const ok = await deleteFolderPermanently(id, req.userRecord!.id);
        if (!ok) return res.status(404).json({ error: 'Folder tidak ditemukan.' });
        return res.json({ deleted: true });
      }
      const updated = await trashFolder(id, req.userRecord!.id);
      if (!updated) return res.status(404).json({ error: 'Folder tidak ditemukan.' });
      res.json({ folder: updated });
    } catch (error) {
      console.error('Delete folder error:', error);
      res.status(500).json({ error: 'Gagal menghapus folder.' });
    }
  });

  app.post('/api/folders/:id/restore', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const updated = await restoreFolder(id, req.userRecord!.id);
      if (!updated) return res.status(404).json({ error: 'Folder tidak ditemukan.' });
      res.json({ folder: updated });
    } catch (error) {
      console.error('Restore folder error:', error);
      res.status(500).json({ error: 'Gagal memulihkan folder.' });
    }
  });

  app.get('/api/files', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.userRecord!.id;
      const folderId = req.query.folderId ? Number(req.query.folderId) : null;
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const trashed = req.query.trashed === 'true';
      const favoritesOnly = req.query.favorites === 'true';
      const recentOnly = req.query.recent === 'true';

      const result = await listWorkspaceItems(userId, {
        folderId,
        search,
        category,
        trashed,
        favoritesOnly,
        recentOnly,
      });

      const filesWithUrls = result.files.map((file) => ({
        ...file,
        signedUrl: signFileUrl(file.id, userId),
      }));

      res.json({
        folders: result.folders,
        files: filesWithUrls,
      });
    } catch (error) {
      console.error('List files error:', error);
      res.status(500).json({ error: 'Gagal memuat file.' });
    }
  });

  app.post(
    '/api/files/upload',
    requireAuth,
    rateLimit(600, 60_000),
    upload.array('files', 25),
    async (req: AuthRequest, res) => {
      const uploadedFiles = (req.files as Express.Multer.File[]) || [];
      try {
        const user = req.userRecord!;
        const folderIdRaw = req.body.folderId;
        const folderId =
          folderIdRaw && folderIdRaw !== 'null' ? Number(folderIdRaw) : null;

        if (!uploadedFiles.length) {
          return res.status(400).json({ error: 'Tidak ada file yang diunggah.' });
        }

        const totalIncoming = uploadedFiles.reduce((sum, f) => sum + f.size, 0);
        const currentStorage = await recalculateStorageUsage(user.id);
        const quotaCheck = canAcceptUpload(
          currentStorage.usedBytes,
          totalIncoming,
          user.storageQuotaBytes
        );

        if (!quotaCheck.allowed) {
          for (const f of uploadedFiles) {
            if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
          }
          return res.status(413).json({
            error: 'Kuota penyimpanan 3 TB telah penuh atau tidak mencukupi.',
          });
        }

        const userDir = getUserVaultDir(user.uid);
        const safeUid = user.uid.replace(/[^a-zA-Z0-9_-]/g, '_');
        const createdRecords = [];

        for (const f of uploadedFiles) {
          const originalName = path.basename(f.originalname || 'file');
          const ext = path.extname(originalName).replace('.', '').toLowerCase() || 'bin';
          const diskName = `${crypto.randomUUID()}.${ext}`;
          const finalPath = path.join(userDir, diskName);
          fs.renameSync(f.path, finalPath);

          const inserted = await insertUploadedFile({
            userId: user.id,
            folderId: Number.isFinite(folderId) ? folderId : null,
            name: originalName,
            originalName,
            mimeType: f.mimetype || 'application/octet-stream',
            sizeBytes: f.size,
            storageKey: path.posix.join(safeUid, diskName),
          });
          createdRecords.push({
            ...inserted,
            isFavorite: false,
            signedUrl: signFileUrl(inserted.id, user.id),
          });
        }

        const updatedStorage = await recalculateStorageUsage(user.id);
        res.status(201).json({
          files: createdRecords,
          storage: updatedStorage,
        });
      } catch (error) {
        for (const f of uploadedFiles) {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        }
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Gagal mengunggah file ke server.' });
      }
    }
  );

  // =========================================================================
  // RESUMABLE / CHUNKED UPLOAD SESSIONS
  // =========================================================================
  app.post('/api/uploads/init', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.userRecord!;
      const { fileName, mimeType, totalBytes, folderId } = req.body as {
        fileName?: string;
        mimeType?: string;
        totalBytes?: number;
        folderId?: number | null;
      };
      if (!fileName || !Number.isFinite(totalBytes) || (totalBytes ?? 0) < 0) {
        return res.status(400).json({ error: 'Metadata sesi upload tidak valid.' });
      }

      const currentStorage = await recalculateStorageUsage(user.id);
      const quotaCheck = canAcceptUpload(
        currentStorage.usedBytes,
        Number(totalBytes),
        user.storageQuotaBytes
      );
      if (!quotaCheck.allowed) {
        return res
          .status(413)
          .json({ error: 'Kuota penyimpanan 3 TB tidak mencukupi.' });
      }

      const sessionId = crypto.randomUUID();
      const tempKey = `${sessionId}.part`;
      const tempPath = path.join(TEMP_UPLOAD_DIR, tempKey);
      fs.writeFileSync(tempPath, Buffer.alloc(0));

      const session = await createUploadSessionRecord({
        id: sessionId,
        userId: user.id,
        folderId: folderId || null,
        fileName: path.basename(fileName),
        mimeType: mimeType || 'application/octet-stream',
        totalBytes: Number(totalBytes),
        tempKey,
      });

      res.status(201).json({ session });
    } catch (error) {
      console.error('Init upload session error:', error);
      res.status(500).json({ error: 'Gagal memulai sesi upload.' });
    }
  });

  app.put('/api/uploads/:sessionId/chunk', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.userRecord!;
      const session = await getUploadSession(String(req.params.sessionId), user.id);
      if (!session || session.status !== 'active') {
        return res.status(404).json({ error: 'Sesi upload tidak aktif.' });
      }

      const chunk = req.body as Buffer;
      if (!Buffer.isBuffer(chunk)) {
        return res.status(400).json({ error: 'Data chunk biner diperlukan.' });
      }

      const tempPath = path.join(TEMP_UPLOAD_DIR, session.tempKey);
      fs.appendFileSync(tempPath, chunk);
      const newUploaded = session.uploadedBytes + chunk.byteLength;

      const updated = await updateUploadSession(session.id, user.id, {
        uploadedBytes: newUploaded,
      });
      res.json({ session: updated });
    } catch (error) {
      console.error('Chunk upload error:', error);
      res.status(500).json({ error: 'Gagal menulis chunk file.' });
    }
  });

  app.post('/api/uploads/:sessionId/complete', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.userRecord!;
      const session = await getUploadSession(String(req.params.sessionId), user.id);
      if (!session || session.status !== 'active') {
        return res.status(404).json({ error: 'Sesi upload tidak ditemukan.' });
      }

      const tempPath = path.join(TEMP_UPLOAD_DIR, session.tempKey);
      if (!fs.existsSync(tempPath)) {
        return res.status(400).json({ error: 'Berkas sementara tidak ditemukan.' });
      }

      const stat = fs.statSync(tempPath);
      const userDir = getUserVaultDir(user.uid);
      const safeUid = user.uid.replace(/[^a-zA-Z0-9_-]/g, '_');
      const ext =
        path.extname(session.fileName).replace('.', '').toLowerCase() || 'bin';
      const diskName = `${crypto.randomUUID()}.${ext}`;
      const finalPath = path.join(userDir, diskName);
      fs.renameSync(tempPath, finalPath);

      const inserted = await insertUploadedFile({
        userId: user.id,
        folderId: session.folderId,
        name: session.fileName,
        originalName: session.fileName,
        mimeType: session.mimeType,
        sizeBytes: stat.size,
        storageKey: path.posix.join(safeUid, diskName),
      });

      await updateUploadSession(session.id, user.id, {
        status: 'completed',
        uploadedBytes: stat.size,
      });

      const storage = await recalculateStorageUsage(user.id);
      res.status(201).json({
        file: {
          ...inserted,
          isFavorite: false,
          signedUrl: signFileUrl(inserted.id, user.id),
        },
        storage,
      });
    } catch (error) {
      console.error('Complete upload error:', error);
      res.status(500).json({ error: 'Gagal menyelesaikan upload.' });
    }
  });

  app.delete('/api/uploads/:sessionId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.userRecord!;
      const session = await getUploadSession(String(req.params.sessionId), user.id);
      if (!session) {
        return res.status(404).json({ error: 'Sesi upload tidak ditemukan.' });
      }
      const tempPath = path.join(TEMP_UPLOAD_DIR, session.tempKey);
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      await updateUploadSession(session.id, user.id, { status: 'cancelled' });
      res.json({ cancelled: true });
    } catch (error) {
      console.error('Cancel upload error:', error);
      res.status(500).json({ error: 'Gagal membatalkan sesi upload.' });
    }
  });

  // =========================================================================
  // FILE ACTIONS & SIGNED CONTENT DELIVERY
  // =========================================================================
  app.patch('/api/files/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const userId = req.userRecord!.id;
      const { name, folderId, opened } = req.body as {
        name?: string;
        folderId?: number | null;
        opened?: boolean;
      };

      if (opened) {
        await markFileOpened(id, userId);
        return res.json({ ok: true });
      }

      let updated = null;
      if (typeof name === 'string') {
        updated = await renameFile(id, userId, name);
      }
      if (folderId !== undefined) {
        updated = await moveFile(id, userId, folderId);
      }
      if (!updated) {
        return res.status(404).json({ error: 'File tidak ditemukan.' });
      }
      res.json({
        file: { ...updated, signedUrl: signFileUrl(updated.id, userId) },
      });
    } catch (error) {
      console.error('Patch file error:', error);
      res.status(500).json({ error: 'Gagal memperbarui file.' });
    }
  });

  app.post('/api/files/:id/copy', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { folderId } = req.body as { folderId?: number | null };
      const copied = await copyFile(
        id,
        req.userRecord!.id,
        req.userRecord!.uid,
        folderId ?? null
      );
      if (!copied) {
        return res.status(404).json({ error: 'File tidak ditemukan.' });
      }
      const storage = await recalculateStorageUsage(req.userRecord!.id);
      res.status(201).json({
        file: { ...copied, signedUrl: signFileUrl(copied.id, req.userRecord!.id) },
        storage,
      });
    } catch (error) {
      console.error('Copy file error:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Gagal menyalin file.',
      });
    }
  });

  app.post('/api/files/:id/favorite', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const result = await toggleFavorite(id, req.userRecord!.id);
      if (!result) {
        return res.status(404).json({ error: 'File tidak ditemukan.' });
      }
      res.json(result);
    } catch (error) {
      console.error('Favorite toggle error:', error);
      res.status(500).json({ error: 'Gagal memperbarui favorit.' });
    }
  });

  app.delete('/api/files/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const userId = req.userRecord!.id;
      const permanent = req.query.permanent === 'true';

      if (permanent) {
        const deleted = await deleteFilePermanently(id, userId);
        if (!deleted) return res.status(404).json({ error: 'File tidak ditemukan.' });
        const storage = await recalculateStorageUsage(userId);
        return res.json({ deleted: true, storage });
      }

      const trashed = await trashFile(id, userId);
      if (!trashed) return res.status(404).json({ error: 'File tidak ditemukan.' });
      res.json({ file: trashed });
    } catch (error) {
      console.error('Delete file error:', error);
      res.status(500).json({ error: 'Gagal menghapus file.' });
    }
  });

  app.post('/api/files/:id/restore', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const restored = await restoreFile(id, req.userRecord!.id);
      if (!restored) return res.status(404).json({ error: 'File tidak ditemukan.' });
      res.json({ file: restored });
    } catch (error) {
      console.error('Restore file error:', error);
      res.status(500).json({ error: 'Gagal memulihkan file.' });
    }
  });

  app.post('/api/files/batch', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.userRecord!.id;
      const { fileIds, action, targetFolderId } = req.body as {
        fileIds?: number[];
        action?: 'trash' | 'restore' | 'delete_permanent' | 'move';
        targetFolderId?: number | null;
      };
      if (!Array.isArray(fileIds) || !fileIds.length || !action) {
        return res.status(400).json({ error: 'Permintaan batch tidak valid.' });
      }

      for (const fid of fileIds) {
        if (action === 'trash') await trashFile(fid, userId);
        else if (action === 'restore') await restoreFile(fid, userId);
        else if (action === 'delete_permanent') await deleteFilePermanently(fid, userId);
        else if (action === 'move') await moveFile(fid, userId, targetFolderId ?? null);
      }

      const storage = await recalculateStorageUsage(userId);
      res.json({ ok: true, storage });
    } catch (error) {
      console.error('Batch file error:', error);
      res.status(500).json({ error: 'Gagal memproses aksi multi-pilih.' });
    }
  });

  app.get('/api/files/:id/signed-url', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const file = await getFileForUser(id, req.userRecord!.id);
      if (!file) return res.status(404).json({ error: 'File tidak ditemukan.' });
      res.json({ signedUrl: signFileUrl(file.id, req.userRecord!.id) });
    } catch (error) {
      console.error('Signed url error:', error);
      res.status(500).json({ error: 'Gagal membuat tautan unduhan aman.' });
    }
  });

  app.get('/api/files/:id/content', async (req: Request, res: Response) => {
    try {
      const fileId = Number(req.params.id);
      const uidParam = Number(req.query.uid);
      const expParam = Number(req.query.exp);
      const sigParam = typeof req.query.sig === 'string' ? req.query.sig : '';

      let authorizedUserId: number | null = null;

      if (sigParam && verifySignedFileUrl(fileId, uidParam, expParam, sigParam)) {
        authorizedUserId = uidParam;
      } else if (req.headers.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.slice('Bearer '.length).trim();
        const payload = verifySessionToken(token);
        if (payload) {
          const { getUserByUid } = await import('./src/db/storageRepo.ts');
          const u = await getUserByUid(payload.uid);
          if (u) authorizedUserId = u.id;
        }
      }

      if (!authorizedUserId) {
        return res.status(403).json({ error: 'Akses ditolak: tanda tangan URL tidak valid.' });
      }

      const file = await getFileForUser(fileId, authorizedUserId);
      if (!file) {
        return res.status(404).json({ error: 'File tidak ditemukan.' });
      }

      const diskPath = path.join(VAULT_ROOT, file.storageKey);
      if (!fs.existsSync(diskPath)) {
        return res.status(404).json({ error: 'Berkas fisik tidak ditemukan di vault.' });
      }

      if (req.query.download === '1') {
        await logActivity(authorizedUserId, 'download', file.name, 'Diunduh oleh pemilik', file.id);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(file.name)}"`
        );
      } else {
        await markFileOpened(file.id, authorizedUserId);
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(file.name)}"`
        );
      }

      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.sendFile(diskPath);
    } catch (error) {
      console.error('Content delivery error:', error);
      res.status(500).json({ error: 'Gagal membaca berkas dari vault.' });
    }
  });

  // =========================================================================
  // SHARING ROUTES
  // =========================================================================
  app.get('/api/shares', requireAuth, async (req: AuthRequest, res) => {
    try {
      const data = await listSharesForUser(req.userRecord!.id, req.userRecord!.email);
      res.json(data);
    } catch (error) {
      console.error('List shares error:', error);
      res.status(500).json({ error: 'Gagal memuat tautan berbagi.' });
    }
  });

  app.post('/api/shares', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { fileId, permission, password, expiresAt, sharedWithEmail } =
        req.body as {
          fileId?: number;
          permission?: 'viewer' | 'downloader';
          password?: string;
          expiresAt?: string | null;
          sharedWithEmail?: string;
        };
      if (!fileId) {
        return res.status(400).json({ error: 'File wajib dipilih.' });
      }
      const created = await createShareLink({
        fileId: Number(fileId),
        ownerId: req.userRecord!.id,
        permission: permission === 'viewer' ? 'viewer' : 'downloader',
        password,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        sharedWithEmail,
      });

      res.status(201).json({
        share: {
          ...created,
          hasPassword: Boolean(created.passwordHash),
          passwordHash: undefined,
        },
      });
    } catch (error) {
      console.error('Create share error:', error);
      res.status(400).json({
        error:
          error instanceof Error ? error.message : 'Gagal membuat tautan berbagi.',
      });
    }
  });

  app.delete('/api/shares/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const revoked = await revokeShareLink(id, req.userRecord!.id);
      if (!revoked) {
        return res.status(404).json({ error: 'Tautan berbagi tidak ditemukan.' });
      }
      res.json({ share: revoked });
    } catch (error) {
      console.error('Revoke share error:', error);
      res.status(500).json({ error: 'Gagal mencabut tautan berbagi.' });
    }
  });

  app.get('/api/public/share/:token', rateLimit(60, 60_000), async (req, res) => {
    try {
      const row = await getShareByToken(String(req.params.token));
      if (!row || row.share.isRevoked) {
        return res
          .status(404)
          .json({ error: 'Tautan berbagi tidak ditemukan atau telah dicabut.' });
      }
      if (row.share.expiresAt && row.share.expiresAt.getTime() < Date.now()) {
        return res.status(410).json({ error: 'Tautan berbagi telah kedaluwarsa.' });
      }

      const requiresPassword = Boolean(row.share.passwordHash);
      res.json({
        token: row.share.token,
        permission: row.share.permission,
        requiresPassword,
        expiresAt: row.share.expiresAt,
        downloadCount: row.share.downloadCount,
        ownerName: row.ownerName,
        file: {
          id: row.file.id,
          name: row.file.name,
          mimeType: row.file.mimeType,
          extension: row.file.extension,
          category: row.file.category,
          sizeBytes: row.file.sizeBytes,
          createdAt: row.file.createdAt,
        },
        contentUrl: requiresPassword
          ? null
          : `/api/public/share/${row.share.token}/content`,
      });
    } catch (error) {
      console.error('Public share meta error:', error);
      res.status(500).json({ error: 'Gagal memuat file dibagikan.' });
    }
  });

  app.post('/api/public/share/:token/unlock', rateLimit(25, 60_000), async (req, res) => {
    try {
      const row = await getShareByToken(String(req.params.token));
      if (!row || row.share.isRevoked) {
        return res.status(404).json({ error: 'Tautan tidak ditemukan.' });
      }
      if (row.share.expiresAt && row.share.expiresAt.getTime() < Date.now()) {
        return res.status(410).json({ error: 'Tautan telah kedaluwarsa.' });
      }
      const { password } = req.body as { password?: string };
      if (row.share.passwordHash) {
        if (!password || !(await bcrypt.compare(password, row.share.passwordHash))) {
          return res.status(401).json({ error: 'Kata sandi tautan salah.' });
        }
      }
      const accessToken = signSessionToken(`share:${row.share.token}`, 'public-share', 3600_000);
      res.json({
        contentUrl: `/api/public/share/${row.share.token}/content?access=${encodeURIComponent(accessToken)}`,
      });
    } catch (error) {
      console.error('Unlock share error:', error);
      res.status(500).json({ error: 'Gagal membuka tautan berbagi.' });
    }
  });

  app.get('/api/public/share/:token/content', async (req, res) => {
    try {
      const row = await getShareByToken(String(req.params.token));
      if (!row || row.share.isRevoked) {
        return res.status(404).json({ error: 'Tautan tidak aktif.' });
      }
      if (row.share.expiresAt && row.share.expiresAt.getTime() < Date.now()) {
        return res.status(410).json({ error: 'Tautan telah kedaluwarsa.' });
      }

      if (row.share.passwordHash) {
        const access = typeof req.query.access === 'string' ? req.query.access : '';
        const payload = verifySessionToken(access);
        if (!payload || payload.uid !== `share:${row.share.token}`) {
          return res.status(403).json({ error: 'Kata sandi diperlukan.' });
        }
      }

      const wantDownload = req.query.download === '1';
      if (wantDownload && row.share.permission === 'viewer') {
        return res
          .status(403)
          .json({ error: 'Izin tautan ini hanya untuk melihat (viewer).' });
      }

      const diskPath = path.join(VAULT_ROOT, row.file.storageKey);
      if (!fs.existsSync(diskPath)) {
        return res.status(404).json({ error: 'Berkas tidak ditemukan.' });
      }

      if (wantDownload) {
        await incrementShareDownload(row.share.id);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(row.file.name)}"`
        );
      } else {
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(row.file.name)}"`
        );
      }

      res.setHeader('Content-Type', row.file.mimeType || 'application/octet-stream');
      res.sendFile(diskPath);
    } catch (error) {
      console.error('Public share download error:', error);
      res.status(500).json({ error: 'Gagal menyajikan file dibagikan.' });
    }
  });

  // =========================================================================
  // ACTIVITY LOGS & NOTES ROUTES
  // =========================================================================
  app.get('/api/activity', requireAuth, async (req: AuthRequest, res) => {
    try {
      const logs = await listActivityLogs(req.userRecord!.id);
      res.json({ logs });
    } catch (error) {
      console.error('Activity list error:', error);
      res.status(500).json({ error: 'Gagal memuat aktivitas.' });
    }
  });

  app.get('/api/notes', requireAuth, async (req: AuthRequest, res) => {
    try {
      const items = await listNotes(req.userRecord!.id);
      res.json({ notes: items });
    } catch (error) {
      console.error('Notes list error:', error);
      res.status(500).json({ error: 'Gagal memuat catatan.' });
    }
  });

  app.post('/api/notes', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { title, content } = req.body as { title?: string; content?: string };
      if (!title?.trim() || !content?.trim()) {
        return res.status(400).json({ error: 'Judul dan isi catatan wajib diisi.' });
      }
      const created = await createNote(req.userRecord!.id, title, content);
      res.status(201).json({ note: created });
    } catch (error) {
      console.error('Create note error:', error);
      res.status(500).json({ error: 'Gagal menyimpan catatan.' });
    }
  });

  app.delete('/api/notes/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const ok = await deleteNote(id, req.userRecord!.id);
      if (!ok) return res.status(404).json({ error: 'Catatan tidak ditemukan.' });
      res.json({ deleted: true });
    } catch (error) {
      console.error('Delete note error:', error);
      res.status(500).json({ error: 'Gagal menghapus catatan.' });
    }
  });

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
  });

  // =========================================================================
  // VITE / STATIC SPA FALLBACK
  // =========================================================================
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NEXAVAULT server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NEXAVAULT server:', err);
  process.exit(1);
});
