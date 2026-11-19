import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  activityLogs,
  favorites,
  files,
  folders,
  notes,
  shares,
  storageUsage,
  uploadSessions,
  users,
  type UserPreferences,
} from './schema.ts';
import {
  THREE_TERABYTES_BYTES,
  classifyFileCategory,
  computeStorageBreakdown,
  extractExtension,
  type StorageBreakdown,
} from '../utils/storageMath.ts';
import { normalizeRelativePath } from '../utils/folderUpload.ts';

export const VAULT_ROOT = path.resolve(process.cwd(), 'storage_vault');
fs.mkdirSync(VAULT_ROOT, { recursive: true });

export function getUserVaultDir(uid: string): string {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(VAULT_ROOT, safeUid);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function getOrCreateFirebaseUser(
  uid: string,
  email: string,
  name?: string,
  avatarUrl?: string
) {
  try {
    const displayName = name?.trim() || email.split('@')[0] || 'Nova Explorer';
    const result = await db
      .insert(users)
      .values({
        uid,
        email: email.toLowerCase(),
        name: displayName,
        avatarUrl: avatarUrl || null,
        emailVerified: true,
        storageQuotaBytes: THREE_TERABYTES_BYTES,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: email.toLowerCase(),
          name: displayName,
          avatarUrl: avatarUrl || null,
          emailVerified: true,
        },
      })
      .returning();

    const user = result[0];
    await recalculateStorageUsage(user.id);
    return user;
  } catch (error) {
    console.error('getOrCreateFirebaseUser failed:', error);
    throw new Error('Gagal menyinkronkan profil pengguna.', { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('getUserByUid failed:', error);
    throw new Error('Gagal memuat data pengguna.', { cause: error });
  }
}

export async function getUserByEmail(email: string) {
  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('getUserByEmail failed:', error);
    throw new Error('Gagal memeriksa akun pengguna.', { cause: error });
  }
}

export async function createLocalUser(
  email: string,
  name: string,
  password: string
) {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(password, 10);
    const uid = `local_${crypto.randomUUID()}`;
    const verificationToken = crypto.randomBytes(24).toString('hex');

    const [created] = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        name: name.trim(),
        passwordHash,
        emailVerified: false,
        verificationToken,
        storageQuotaBytes: THREE_TERABYTES_BYTES,
      })
      .returning();

    await recalculateStorageUsage(created.id);
    await logActivity(
      created.id,
      'auth',
      created.email,
      'Akun NEXAVAULT baru dibuat dengan kuota 3 TB'
    );
    return created;
  } catch (error) {
    console.error('createLocalUser failed:', error);
    throw new Error('Gagal mendaftarkan akun baru.', { cause: error });
  }
}

export async function verifyUserEmailToken(token: string) {
  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.verificationToken, token))
      .limit(1);
    const user = rows[0];
    if (!user) return null;

    const [updated] = await db
      .update(users)
      .set({ emailVerified: true, verificationToken: null })
      .where(eq(users.id, user.id))
      .returning();

    await logActivity(
      updated.id,
      'auth',
      updated.email,
      'Verifikasi email berhasil'
    );
    return updated;
  } catch (error) {
    console.error('verifyUserEmailToken failed:', error);
    throw new Error('Gagal memverifikasi email.', { cause: error });
  }
}

export async function createPasswordReset(email: string) {
  try {
    const user = await getUserByEmail(email);
    if (!user) return null;
    const resetToken = crypto.randomBytes(20).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db
      .update(users)
      .set({ resetToken, resetTokenExpiresAt: expiresAt })
      .where(eq(users.id, user.id));
    return { user, resetToken };
  } catch (error) {
    console.error('createPasswordReset failed:', error);
    throw new Error('Gagal membuat token reset password.', { cause: error });
  }
}

export async function completePasswordReset(token: string, newPassword: string) {
  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.resetToken, token))
      .limit(1);
    const user = rows[0];
    if (
      !user ||
      !user.resetTokenExpiresAt ||
      user.resetTokenExpiresAt.getTime() < Date.now()
    ) {
      return null;
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const [updated] = await db
      .update(users)
      .set({
        passwordHash,
        resetToken: null,
        resetTokenExpiresAt: null,
      })
      .where(eq(users.id, user.id))
      .returning();

    await logActivity(
      updated.id,
      'auth',
      updated.email,
      'Kata sandi berhasil diperbarui'
    );
    return updated;
  } catch (error) {
    console.error('completePasswordReset failed:', error);
    throw new Error('Gagal memperbarui kata sandi.', { cause: error });
  }
}

export async function updateUserProfile(
  userId: number,
  updates: { name?: string; preferences?: UserPreferences }
) {
  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const current = existing[0];
    if (!current) return null;

    const mergedPrefs: UserPreferences = {
      ...(current.preferences || {}),
      ...(updates.preferences || {}),
    };

    const [updated] = await db
      .update(users)
      .set({
        name: updates.name?.trim() || current.name,
        preferences: mergedPrefs,
      })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  } catch (error) {
    console.error('updateUserProfile failed:', error);
    throw new Error('Gagal menyimpan pengaturan profil.', { cause: error });
  }
}

export async function recalculateStorageUsage(
  userId: number
): Promise<StorageBreakdown> {
  try {
    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const quota = userRow?.storageQuotaBytes || THREE_TERABYTES_BYTES;

    const userFiles = await db
      .select({
        category: files.category,
        sizeBytes: files.sizeBytes,
        isTrashed: files.isTrashed,
      })
      .from(files)
      .where(eq(files.userId, userId));

    const breakdown = computeStorageBreakdown(userFiles, quota);

    await db
      .insert(storageUsage)
      .values({
        userId,
        usedBytes: breakdown.usedBytes,
        photosBytes: breakdown.categories.photos.bytes,
        videosBytes: breakdown.categories.videos.bytes,
        documentsBytes: breakdown.categories.documents.bytes,
        audioBytes: breakdown.categories.audio.bytes,
        archivesBytes: breakdown.categories.archives.bytes,
        othersBytes: breakdown.categories.others.bytes,
        fileCount: breakdown.fileCount,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: storageUsage.userId,
        set: {
          usedBytes: breakdown.usedBytes,
          photosBytes: breakdown.categories.photos.bytes,
          videosBytes: breakdown.categories.videos.bytes,
          documentsBytes: breakdown.categories.documents.bytes,
          audioBytes: breakdown.categories.audio.bytes,
          archivesBytes: breakdown.categories.archives.bytes,
          othersBytes: breakdown.categories.others.bytes,
          fileCount: breakdown.fileCount,
          updatedAt: new Date(),
        },
      });

    return breakdown;
  } catch (error) {
    console.error('recalculateStorageUsage failed:', error);
    throw new Error('Gagal menghitung penggunaan penyimpanan.', {
      cause: error,
    });
  }
}

export async function logActivity(
  userId: number,
  action: string,
  targetName: string,
  details?: string,
  fileId?: number | null
) {
  try {
    await db.insert(activityLogs).values({
      userId,
      fileId: fileId ?? null,
      action,
      targetName,
      details: details || null,
    });
  } catch (error) {
    console.error('logActivity failed:', error);
  }
}

export async function listWorkspaceItems(
  userId: number,
  options: {
    folderId?: number | null;
    search?: string;
    category?: string;
    trashed?: boolean;
    favoritesOnly?: boolean;
    recentOnly?: boolean;
  }
) {
  try {
    const trashed = Boolean(options.trashed);

    const folderConditions = [
      eq(folders.userId, userId),
      eq(folders.isTrashed, trashed),
    ];
    if (!options.search && !options.category && !options.favoritesOnly && !options.recentOnly) {
      if (options.folderId) {
        folderConditions.push(eq(folders.parentId, options.folderId));
      } else if (!trashed) {
        folderConditions.push(isNull(folders.parentId));
      }
    }
    if (options.search) {
      folderConditions.push(ilike(folders.name, `%${options.search}%`));
    }

    const folderRows =
      options.favoritesOnly || options.recentOnly || options.category
        ? []
        : await db
            .select()
            .from(folders)
            .where(and(...folderConditions))
            .orderBy(desc(folders.updatedAt));

    const fileConditions = [
      eq(files.userId, userId),
      eq(files.isTrashed, trashed),
    ];
    if (
      !options.search &&
      !options.category &&
      !options.favoritesOnly &&
      !options.recentOnly &&
      !trashed
    ) {
      if (options.folderId) {
        fileConditions.push(eq(files.folderId, options.folderId));
      } else {
        fileConditions.push(isNull(files.folderId));
      }
    }
    if (options.search) {
      fileConditions.push(ilike(files.name, `%${options.search}%`));
    }
    if (options.category && options.category !== 'all') {
      if (options.category === 'media') {
        fileConditions.push(
          or(eq(files.category, 'photos'), eq(files.category, 'videos'))!
        );
      } else {
        fileConditions.push(eq(files.category, options.category));
      }
    }

    const favRows = await db
      .select({ fileId: favorites.fileId })
      .from(favorites)
      .where(eq(favorites.userId, userId));
    const favSet = new Set(favRows.map((r) => r.fileId));

    const rawFiles = await db
      .select()
      .from(files)
      .where(and(...fileConditions))
      .orderBy(
        options.recentOnly
          ? desc(sql`COALESCE(${files.lastOpenedAt}, ${files.createdAt})`)
          : desc(files.updatedAt)
      );

    const enrichedFiles = rawFiles
      .map((f) => ({
        ...f,
        isFavorite: favSet.has(f.id),
      }))
      .filter((f) => (options.favoritesOnly ? f.isFavorite : true));

    return {
      folders: folderRows,
      files: options.recentOnly ? enrichedFiles.slice(0, 20) : enrichedFiles,
    };
  } catch (error) {
    console.error('listWorkspaceItems failed:', error);
    throw new Error('Gagal memuat daftar file.', { cause: error });
  }
}

export async function getAllFoldersForUser(userId: number) {
  try {
    return await db
      .select()
      .from(folders)
      .where(and(eq(folders.userId, userId), eq(folders.isTrashed, false)))
      .orderBy(folders.name);
  } catch (error) {
    console.error('getAllFoldersForUser failed:', error);
    throw new Error('Gagal memuat daftar folder.', { cause: error });
  }
}

export async function createFolder(
  userId: number,
  name: string,
  parentId?: number | null,
  color?: string
) {
  try {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('Nama folder wajib diisi.');

    if (parentId) {
      const parent = await db
        .select()
        .from(folders)
        .where(and(eq(folders.id, parentId), eq(folders.userId, userId)))
        .limit(1);
      if (!parent[0]) throw new Error('Folder induk tidak ditemukan.');
    }

    const [created] = await db
      .insert(folders)
      .values({
        userId,
        parentId: parentId || null,
        name: cleanName,
        color: color || '#38BDF8',
      })
      .returning();

    await logActivity(userId, 'folder_create', cleanName, 'Folder baru dibuat');
    return created;
  } catch (error) {
    console.error('createFolder failed:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Gagal membuat folder.',
      { cause: error }
    );
  }
}

export async function ensureFolderTree(
  userId: number,
  baseParentId: number | null,
  rawPaths: string[]
) {
  try {
    let resolvedBaseId: number | null = baseParentId || null;
    if (resolvedBaseId) {
      const parent = await db
        .select()
        .from(folders)
        .where(
          and(
            eq(folders.id, resolvedBaseId),
            eq(folders.userId, userId),
            eq(folders.isTrashed, false)
          )
        )
        .limit(1);
      if (!parent[0]) {
        throw new Error('Folder induk tujuan tidak ditemukan.');
      }
      resolvedBaseId = parent[0].id;
    }

    const folderMap: Record<string, number> = {};
    const createdFolders: Array<typeof folders.$inferSelect> = [];

    const cleanedPaths = Array.from(
      new Set(rawPaths.map(normalizeRelativePath).filter(Boolean))
    ).sort((a, b) => {
      const diff = a.split('/').length - b.split('/').length;
      return diff !== 0 ? diff : a.localeCompare(b);
    });

    for (const relPath of cleanedPaths) {
      const segments = relPath.split('/');
      let currentParentId: number | null = resolvedBaseId;
      let accPath = '';

      for (const seg of segments) {
        accPath = accPath ? `${accPath}/${seg}` : seg;
        if (folderMap[accPath]) {
          currentParentId = folderMap[accPath];
          continue;
        }

        const existing = await db
          .select()
          .from(folders)
          .where(
            and(
              eq(folders.userId, userId),
              currentParentId === null
                ? isNull(folders.parentId)
                : eq(folders.parentId, currentParentId),
              eq(folders.name, seg),
              eq(folders.isTrashed, false)
            )
          )
          .limit(1);

        if (existing[0]) {
          folderMap[accPath] = existing[0].id;
          currentParentId = existing[0].id;
        } else {
          const [created] = await db
            .insert(folders)
            .values({
              userId,
              parentId: currentParentId,
              name: seg,
              color: '#A855F7',
            })
            .returning();
          folderMap[accPath] = created.id;
          currentParentId = created.id;
          createdFolders.push(created);
        }
      }
    }

    if (createdFolders.length > 0) {
      await logActivity(
        userId,
        'folder_upload',
        createdFolders[0].name,
        `${createdFolders.length} folder dibuat saat unggah folder`
      );
    }

    return { folderMap, folders: createdFolders };
  } catch (error) {
    console.error('ensureFolderTree failed:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Gagal membuat struktur folder.',
      { cause: error }
    );
  }
}

export async function getFileForUser(fileId: number, userId: number) {
  try {
    const rows = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('getFileForUser failed:', error);
    throw new Error('Gagal mengambil data file.', { cause: error });
  }
}

export async function insertUploadedFile(params: {
  userId: number;
  folderId: number | null;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}) {
  try {
    const extension = extractExtension(params.originalName || params.name);
    const category = classifyFileCategory(
      params.originalName || params.name,
      params.mimeType
    );

    const [inserted] = await db
      .insert(files)
      .values({
        userId: params.userId,
        folderId: params.folderId,
        name: params.name,
        originalName: params.originalName,
        mimeType: params.mimeType || 'application/octet-stream',
        extension: extension || 'bin',
        category,
        sizeBytes: params.sizeBytes,
        storageKey: params.storageKey,
        lastOpenedAt: new Date(),
      })
      .returning();

    await recalculateStorageUsage(params.userId);
    await logActivity(
      params.userId,
      'upload',
      inserted.name,
      `Unggah ${category} (${inserted.sizeBytes} bytes)`,
      inserted.id
    );
    return inserted;
  } catch (error) {
    console.error('insertUploadedFile failed:', error);
    throw new Error('Gagal menyimpan metadata file.', { cause: error });
  }
}

export async function renameFile(
  fileId: number,
  userId: number,
  newName: string
) {
  try {
    const existing = await getFileForUser(fileId, userId);
    if (!existing) return null;
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('Nama file tidak boleh kosong.');

    const [updated] = await db
      .update(files)
      .set({
        name: trimmed,
        extension: extractExtension(trimmed) || existing.extension,
        category: classifyFileCategory(trimmed, existing.mimeType),
        updatedAt: new Date(),
      })
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))
      .returning();

    await recalculateStorageUsage(userId);
    await logActivity(
      userId,
      'rename',
      trimmed,
      `Diubah dari "${existing.name}"`,
      fileId
    );
    return updated;
  } catch (error) {
    console.error('renameFile failed:', error);
    throw new Error('Gagal mengubah nama file.', { cause: error });
  }
}

export async function renameFolder(
  folderId: number,
  userId: number,
  newName: string
) {
  try {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('Nama folder tidak boleh kosong.');
    const [updated] = await db
      .update(folders)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .returning();
    if (updated) {
      await logActivity(userId, 'rename', trimmed, 'Folder diubah namanya');
    }
    return updated || null;
  } catch (error) {
    console.error('renameFolder failed:', error);
    throw new Error('Gagal mengubah nama folder.', { cause: error });
  }
}

export async function moveFile(
  fileId: number,
  userId: number,
  targetFolderId: number | null
) {
  try {
    if (targetFolderId) {
      const folder = await db
        .select()
        .from(folders)
        .where(
          and(eq(folders.id, targetFolderId), eq(folders.userId, userId))
        )
        .limit(1);
      if (!folder[0]) throw new Error('Folder tujuan tidak ditemukan.');
    }

    const [updated] = await db
      .update(files)
      .set({ folderId: targetFolderId, updatedAt: new Date() })
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))
      .returning();
    if (updated) {
      await logActivity(
        userId,
        'move',
        updated.name,
        targetFolderId ? `Dipindah ke folder #${targetFolderId}` : 'Dipindah ke root',
        fileId
      );
    }
    return updated || null;
  } catch (error) {
    console.error('moveFile failed:', error);
    throw new Error('Gagal memindahkan file.', { cause: error });
  }
}

export async function copyFile(
  fileId: number,
  userId: number,
  uid: string,
  targetFolderId: number | null
) {
  try {
    const source = await getFileForUser(fileId, userId);
    if (!source) return null;

    const breakdown = await recalculateStorageUsage(userId);
    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const quota = userRow?.storageQuotaBytes || THREE_TERABYTES_BYTES;
    if (breakdown.usedBytes + source.sizeBytes > quota) {
      throw new Error('Kuota penyimpanan 3 TB tidak mencukupi untuk menyalin file.');
    }

    const userDir = getUserVaultDir(uid);
    const srcPath = path.join(VAULT_ROOT, source.storageKey);
    const newFileName = `${crypto.randomUUID()}.${source.extension || 'bin'}`;
    const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
    const newStorageKey = path.posix.join(safeUid, newFileName);
    const destPath = path.join(userDir, newFileName);

    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
    } else {
      fs.writeFileSync(destPath, '');
    }

    const extPart = source.extension ? `.${source.extension}` : '';
    const base = extPart && source.name.endsWith(extPart)
      ? source.name.slice(0, -extPart.length)
      : source.name;
    const copyName = `${base} (Salinan)${extPart}`;

    const [copied] = await db
      .insert(files)
      .values({
        userId,
        folderId: targetFolderId ?? source.folderId,
        name: copyName,
        originalName: copyName,
        mimeType: source.mimeType,
        extension: source.extension,
        category: source.category,
        sizeBytes: source.sizeBytes,
        storageKey: newStorageKey,
      })
      .returning();

    await recalculateStorageUsage(userId);
    await logActivity(userId, 'copy', copied.name, `Disalin dari ${source.name}`, copied.id);
    return copied;
  } catch (error) {
    console.error('copyFile failed:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Gagal menyalin file.',
      { cause: error }
    );
  }
}

export async function trashFile(fileId: number, userId: number) {
  try {
    const [updated] = await db
      .update(files)
      .set({ isTrashed: true, trashedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))
      .returning();
    if (updated) {
      await logActivity(userId, 'delete', updated.name, 'Dipindahkan ke Sampah', fileId);
    }
    return updated || null;
  } catch (error) {
    console.error('trashFile failed:', error);
    throw new Error('Gagal memindahkan file ke sampah.', { cause: error });
  }
}

export async function restoreFile(fileId: number, userId: number) {
  try {
    const [updated] = await db
      .update(files)
      .set({ isTrashed: false, trashedAt: null, updatedAt: new Date() })
      .where(and(eq(files.id, fileId), eq(files.userId, userId)))
      .returning();
    if (updated) {
      await logActivity(userId, 'restore', updated.name, 'Dipulihkan dari Sampah', fileId);
    }
    return updated || null;
  } catch (error) {
    console.error('restoreFile failed:', error);
    throw new Error('Gagal memulihkan file.', { cause: error });
  }
}

export async function deleteFilePermanently(fileId: number, userId: number) {
  try {
    const existing = await getFileForUser(fileId, userId);
    if (!existing) return false;

    const fullPath = path.join(VAULT_ROOT, existing.storageKey);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    await db
      .delete(files)
      .where(and(eq(files.id, fileId), eq(files.userId, userId)));

    await recalculateStorageUsage(userId);
    await logActivity(userId, 'delete', existing.name, 'Dihapus permanen');
    return true;
  } catch (error) {
    console.error('deleteFilePermanently failed:', error);
    throw new Error('Gagal menghapus file secara permanen.', { cause: error });
  }
}

export async function trashFolder(folderId: number, userId: number) {
  try {
    const [updated] = await db
      .update(folders)
      .set({ isTrashed: true, trashedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .returning();
    if (updated) {
      await logActivity(userId, 'delete', updated.name, 'Folder dipindahkan ke Sampah');
    }
    return updated || null;
  } catch (error) {
    console.error('trashFolder failed:', error);
    throw new Error('Gagal menghapus folder.', { cause: error });
  }
}

export async function restoreFolder(folderId: number, userId: number) {
  try {
    const [updated] = await db
      .update(folders)
      .set({ isTrashed: false, trashedAt: null, updatedAt: new Date() })
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .returning();
    if (updated) {
      await logActivity(userId, 'restore', updated.name, 'Folder dipulihkan');
    }
    return updated || null;
  } catch (error) {
    console.error('restoreFolder failed:', error);
    throw new Error('Gagal memulihkan folder.', { cause: error });
  }
}

export async function deleteFolderPermanently(folderId: number, userId: number) {
  try {
    await db
      .update(files)
      .set({ folderId: null })
      .where(and(eq(files.folderId, folderId), eq(files.userId, userId)));

    const deleted = await db
      .delete(folders)
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .returning();
    return deleted.length > 0;
  } catch (error) {
    console.error('deleteFolderPermanently failed:', error);
    throw new Error('Gagal menghapus folder permanen.', { cause: error });
  }
}

export async function toggleFavorite(fileId: number, userId: number) {
  try {
    const file = await getFileForUser(fileId, userId);
    if (!file) return null;

    const existing = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.fileId, fileId), eq(favorites.userId, userId)))
      .limit(1);

    if (existing[0]) {
      await db
        .delete(favorites)
        .where(eq(favorites.id, existing[0].id));
      await logActivity(userId, 'favorite', file.name, 'Dihapus dari Favorit', fileId);
      return { isFavorite: false };
    } else {
      await db.insert(favorites).values({ userId, fileId });
      await logActivity(userId, 'favorite', file.name, 'Ditambahkan ke Favorit', fileId);
      return { isFavorite: true };
    }
  } catch (error) {
    console.error('toggleFavorite failed:', error);
    throw new Error('Gagal memperbarui favorit.', { cause: error });
  }
}

export async function markFileOpened(fileId: number, userId: number) {
  try {
    await db
      .update(files)
      .set({ lastOpenedAt: new Date() })
      .where(and(eq(files.id, fileId), eq(files.userId, userId)));
  } catch (error) {
    console.error('markFileOpened failed:', error);
  }
}

export async function createShareLink(params: {
  fileId: number;
  ownerId: number;
  permission: 'viewer' | 'downloader';
  password?: string;
  expiresAt?: Date | null;
  sharedWithEmail?: string;
}) {
  try {
    const file = await getFileForUser(params.fileId, params.ownerId);
    if (!file) throw new Error('File tidak ditemukan.');

    const token = crypto.randomBytes(16).toString('base64url');
    const passwordHash = params.password?.trim()
      ? await bcrypt.hash(params.password.trim(), 10)
      : null;

    const [created] = await db
      .insert(shares)
      .values({
        fileId: params.fileId,
        ownerId: params.ownerId,
        token,
        sharedWithEmail: params.sharedWithEmail?.trim().toLowerCase() || null,
        permission: params.permission,
        passwordHash,
        expiresAt: params.expiresAt || null,
      })
      .returning();

    await logActivity(
      params.ownerId,
      'share',
      file.name,
      `Tautan berbagi dibuat (${params.permission})`,
      file.id
    );
    return created;
  } catch (error) {
    console.error('createShareLink failed:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Gagal membuat tautan berbagi.',
      { cause: error }
    );
  }
}

export async function listSharesForUser(userId: number, userEmail: string) {
  try {
    const ownedShares = await db
      .select({
        share: shares,
        file: files,
      })
      .from(shares)
      .innerJoin(files, eq(shares.fileId, files.id))
      .where(eq(shares.ownerId, userId))
      .orderBy(desc(shares.createdAt));

    const sharedWithMe = await db
      .select({
        share: shares,
        file: files,
        ownerName: users.name,
        ownerEmail: users.email,
      })
      .from(shares)
      .innerJoin(files, eq(shares.fileId, files.id))
      .innerJoin(users, eq(shares.ownerId, users.id))
      .where(
        and(
          eq(shares.sharedWithEmail, userEmail.toLowerCase()),
          eq(shares.isRevoked, false),
          ne(shares.ownerId, userId)
        )
      )
      .orderBy(desc(shares.createdAt));

    return {
      owned: ownedShares.map((row) => ({
        ...row.share,
        hasPassword: Boolean(row.share.passwordHash),
        passwordHash: undefined,
        file: row.file,
      })),
      sharedWithMe: sharedWithMe.map((row) => ({
        ...row.share,
        hasPassword: Boolean(row.share.passwordHash),
        passwordHash: undefined,
        ownerName: row.ownerName,
        ownerEmail: row.ownerEmail,
        file: row.file,
      })),
    };
  } catch (error) {
    console.error('listSharesForUser failed:', error);
    throw new Error('Gagal memuat daftar file dibagikan.', { cause: error });
  }
}

export async function revokeShareLink(shareId: number, ownerId: number) {
  try {
    const [updated] = await db
      .update(shares)
      .set({ isRevoked: true })
      .where(and(eq(shares.id, shareId), eq(shares.ownerId, ownerId)))
      .returning();
    if (updated) {
      await logActivity(ownerId, 'revoke_share', `Share #${shareId}`, 'Akses berbagi dicabut');
    }
    return updated || null;
  } catch (error) {
    console.error('revokeShareLink failed:', error);
    throw new Error('Gagal mencabut tautan berbagi.', { cause: error });
  }
}

export async function getShareByToken(token: string) {
  try {
    const rows = await db
      .select({
        share: shares,
        file: files,
        ownerName: users.name,
      })
      .from(shares)
      .innerJoin(files, eq(shares.fileId, files.id))
      .innerJoin(users, eq(shares.ownerId, users.id))
      .where(eq(shares.token, token))
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('getShareByToken failed:', error);
    throw new Error('Gagal mengambil tautan berbagi.', { cause: error });
  }
}

export async function incrementShareDownload(shareId: number) {
  try {
    await db
      .update(shares)
      .set({ downloadCount: sql`${shares.downloadCount} + 1` })
      .where(eq(shares.id, shareId));
  } catch (error) {
    console.error('incrementShareDownload failed:', error);
  }
}

export async function listActivityLogs(userId: number) {
  try {
    return await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(60);
  } catch (error) {
    console.error('listActivityLogs failed:', error);
    throw new Error('Gagal memuat riwayat aktivitas.', { cause: error });
  }
}

export async function listNotes(userId: number) {
  try {
    return await db
      .select()
      .from(notes)
      .where(eq(notes.userId, userId))
      .orderBy(desc(notes.updatedAt));
  } catch (error) {
    console.error('listNotes failed:', error);
    throw new Error('Gagal memuat catatan.', { cause: error });
  }
}

export async function createNote(userId: number, title: string, content: string) {
  try {
    const [created] = await db
      .insert(notes)
      .values({ userId, title: title.trim(), content: content.trim() })
      .returning();
    return created;
  } catch (error) {
    console.error('createNote failed:', error);
    throw new Error('Gagal menyimpan catatan.', { cause: error });
  }
}

export async function deleteNote(noteId: number, userId: number) {
  try {
    const deleted = await db
      .delete(notes)
      .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
      .returning();
    return deleted.length > 0;
  } catch (error) {
    console.error('deleteNote failed:', error);
    throw new Error('Gagal menghapus catatan.', { cause: error });
  }
}

export async function createUploadSessionRecord(params: {
  id: string;
  userId: number;
  folderId: number | null;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  tempKey: string;
}) {
  try {
    const [session] = await db
      .insert(uploadSessions)
      .values({
        id: params.id,
        userId: params.userId,
        folderId: params.folderId,
        fileName: params.fileName,
        mimeType: params.mimeType,
        totalBytes: params.totalBytes,
        tempKey: params.tempKey,
        status: 'active',
      })
      .returning();
    return session;
  } catch (error) {
    console.error('createUploadSessionRecord failed:', error);
    throw new Error('Gagal membuat sesi upload.', { cause: error });
  }
}

export async function getUploadSession(sessionId: string, userId: number) {
  try {
    const rows = await db
      .select()
      .from(uploadSessions)
      .where(
        and(eq(uploadSessions.id, sessionId), eq(uploadSessions.userId, userId))
      )
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('getUploadSession failed:', error);
    throw new Error('Gagal memuat sesi upload.', { cause: error });
  }
}

export async function updateUploadSession(
  sessionId: string,
  userId: number,
  patch: { uploadedBytes?: number; status?: string }
) {
  try {
    const [updated] = await db
      .update(uploadSessions)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(eq(uploadSessions.id, sessionId), eq(uploadSessions.userId, userId))
      )
      .returning();
    return updated || null;
  } catch (error) {
    console.error('updateUploadSession failed:', error);
    throw new Error('Gagal memperbarui sesi upload.', { cause: error });
  }
}

function buildSampleWavBuffer(): Buffer {
  const sampleRate = 8000;
  const durationSec = 1.2;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = t < 0.4 ? 523.25 : t < 0.8 ? 659.25 : 783.99;
    const env = Math.sin(Math.PI * ((t % 0.4) / 0.4));
    const sample = Math.round(Math.sin(2 * Math.PI * freq * t) * 14000 * env);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}

function buildMinimalPdfBuffer(title: string): Buffer {
  const cleanTitle = title.replace(/[()\\]/g, '');
  const streamContent = `BT /F1 18 Tf 50 740 Td (${cleanTitle}) Tj 0 -30 Td /F1 12 Tf (NEXAVAULT Cloud Storage - 3 TB Encrypted Vault Document) Tj 0 -22 Td (Status: Tersimpan aman di penyimpanan terisolasi.) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${streamContent.length} >> stream
${streamContent}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000500 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
570
%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

export async function ensureDemoWorkspaceSeeded() {
  try {
    const demoUid = 'demo-nexavault-user';
    const existing = await getUserByUid(demoUid);
    if (existing) {
      const existingFiles = await db
        .select({ id: files.id })
        .from(files)
        .where(eq(files.userId, existing.id))
        .limit(1);
      if (existingFiles.length > 0) {
        return existing;
      }
    }

    const demoUser =
      existing ||
      (
        await db
          .insert(users)
          .values({
            uid: demoUid,
            email: 'nova.demo@nexavault.cloud',
            name: 'Nikitin Nova',
            emailVerified: true,
            storageQuotaBytes: THREE_TERABYTES_BYTES,
          })
          .onConflictDoUpdate({
            target: users.uid,
            set: { name: 'Nikitin Nova', emailVerified: true },
          })
          .returning()
      )[0];

    const partnerUid = 'alex-partner-nexavault';
    const partnerRows = await db
      .insert(users)
      .values({
        uid: partnerUid,
        email: 'alex.studio@nexavault.cloud',
        name: 'Alex Pratama',
        emailVerified: true,
        storageQuotaBytes: THREE_TERABYTES_BYTES,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { name: 'Alex Pratama' },
      })
      .returning();
    const partnerUser = partnerRows[0];

    const folderDesign = await createFolder(demoUser.id, 'Proyek Desain', null, '#38BDF8');
    const folderMedia = await createFolder(demoUser.id, 'Media Studio', null, '#8B5CF6');
    const folderDocs = await createFolder(demoUser.id, 'Arsip Dokumen', null, '#94A3B8');

    const userDir = getUserVaultDir(demoUid);

    const svgRender = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
  <defs>
    <radialGradient id="g1" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.85"/>
      <stop offset="50%" stop-color="#6366F1" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#08090D" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="800" height="500" fill="#08090D"/>
  <circle cx="400" cy="240" r="220" fill="url(#g1)"/>
  <circle cx="400" cy="240" r="110" fill="none" stroke="#93C5FD" stroke-width="2" stroke-opacity="0.6"/>
  <circle cx="400" cy="240" r="165" fill="none" stroke="#A78BFA" stroke-width="1.5" stroke-dasharray="8 8" stroke-opacity="0.5"/>
  <text x="400" y="250" text-anchor="middle" fill="#F8FAFC" font-family="sans-serif" font-size="28" font-weight="600">NEXAVAULT ORBIT RENDER</text>
</svg>`;

    const seedAssets: Array<{
      name: string;
      mimeType: string;
      folderId: number | null;
      content: Buffer | string;
      favorite?: boolean;
    }> = [
      {
        name: 'Nova_Orbit_Blueprint.svg',
        mimeType: 'image/svg+xml',
        folderId: null,
        content: svgRender,
        favorite: true,
      },
      {
        name: 'Arsitektur_Cloud_3TB.pdf',
        mimeType: 'application/pdf',
        folderId: null,
        content: buildMinimalPdfBuffer('Arsitektur Cloud 3 TB NEXAVAULT'),
        favorite: true,
      },
      {
        name: 'Nova_Chime_Master.wav',
        mimeType: 'audio/wav',
        folderId: null,
        content: buildSampleWavBuffer(),
      },
      {
        name: 'Konfigurasi_Vault_Manifest.json',
        mimeType: 'application/json',
        folderId: folderDocs.id,
        content: JSON.stringify(
          {
            vault: 'NEXAVAULT',
            quotaBytes: THREE_TERABYTES_BYTES,
            encryption: 'AES-256-GCM + Signed URL HMAC',
            regions: ['asia-south1', 'asia-southeast1'],
          },
          null,
          2
        ),
      },
      {
        name: 'Catatan_Rilis_Q4.txt',
        mimeType: 'text/plain',
        folderId: null,
        content:
          'NEXAVAULT Release Notes\n- Kapasitas 3.000 GB (3 TB) per akun\n- Dukungan upload multipart & resumable\n- Pratinjau media terenkripsi & link berbagi berpassword.\n',
      },
      {
        name: 'Studio_Nebula_Backdrop.svg',
        mimeType: 'image/svg+xml',
        folderId: folderMedia.id,
        content: svgRender.replace('NEXAVAULT ORBIT RENDER', 'STUDIO NEBULA BACKDROP'),
      },
      {
        name: 'UI_System_Tokens.fig',
        mimeType: 'application/octet-stream',
        folderId: folderDesign.id,
        content: Buffer.from('FIGMA_DESIGN_TOKENS_NEXAVAULT_V1', 'utf8'),
      },
      {
        name: 'Backup_Asset_Bundle.zip',
        mimeType: 'application/zip',
        folderId: null,
        content: Buffer.from('PK\x05\x06' + '\x00'.repeat(18), 'binary'),
      },
    ];

    for (const asset of seedAssets) {
      const ext = extractExtension(asset.name) || 'bin';
      const storageFileName = `${crypto.randomUUID()}.${ext}`;
      const diskPath = path.join(userDir, storageFileName);
      const buf =
        typeof asset.content === 'string'
          ? Buffer.from(asset.content, 'utf8')
          : asset.content;
      fs.writeFileSync(diskPath, buf);

      const inserted = await insertUploadedFile({
        userId: demoUser.id,
        folderId: asset.folderId,
        name: asset.name,
        originalName: asset.name,
        mimeType: asset.mimeType,
        sizeBytes: buf.byteLength,
        storageKey: path.posix.join(demoUid, storageFileName),
      });

      if (asset.favorite) {
        await db
          .insert(favorites)
          .values({ userId: demoUser.id, fileId: inserted.id })
          .onConflictDoNothing();
      }
    }

    // Create 1 partner file shared with demo user so "Shared With Me" works out of the box
    const partnerDir = getUserVaultDir(partnerUid);
    const partnerKeyName = `${crypto.randomUUID()}.pdf`;
    const partnerPdf = buildMinimalPdfBuffer('Proposal Kolaborasi Studio NEXAVAULT');
    fs.writeFileSync(path.join(partnerDir, partnerKeyName), partnerPdf);

    const partnerFile = await insertUploadedFile({
      userId: partnerUser.id,
      folderId: null,
      name: 'Proposal_Kolaborasi_Studio.pdf',
      originalName: 'Proposal_Kolaborasi_Studio.pdf',
      mimeType: 'application/pdf',
      sizeBytes: partnerPdf.byteLength,
      storageKey: path.posix.join(partnerUid, partnerKeyName),
    });

    await createShareLink({
      fileId: partnerFile.id,
      ownerId: partnerUser.id,
      permission: 'downloader',
      sharedWithEmail: demoUser.email,
    });

    await createNote(
      demoUser.id,
      'Checklist Arsip Proyek',
      '1. Unggah aset desain master (.fig & .svg)\n2. Bagikan tautan PDF berpassword ke tim.'
    );
    await createNote(
      demoUser.id,
      'Jadwal Backup Mingguan',
      'Setiap Jumat pukul 20.00 WIB sinkronkan folder Media Studio.'
    );

    await recalculateStorageUsage(demoUser.id);
    return demoUser;
  } catch (error) {
    console.error('ensureDemoWorkspaceSeeded failed:', error);
    throw new Error('Gagal menyiapkan ruang kerja demo.', { cause: error });
  }
}
