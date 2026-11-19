import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export interface UserPreferences {
  viewMode?: 'grid' | 'list';
  notificationsEnabled?: boolean;
  compactDensity?: boolean;
  reducedMotion?: boolean;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  emailVerified: boolean('email_verified').default(false).notNull(),
  verificationToken: text('verification_token'),
  resetToken: text('reset_token'),
  resetTokenExpiresAt: timestamp('reset_token_expires_at'),
  avatarUrl: text('avatar_url'),
  storageQuotaBytes: bigint('storage_quota_bytes', { mode: 'number' })
    .default(3_000_000_000_000)
    .notNull(),
  preferences: jsonb('preferences').$type<UserPreferences>().default({
    viewMode: 'grid',
    notificationsEnabled: true,
    compactDensity: false,
    reducedMotion: false,
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const folders = pgTable('folders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  parentId: integer('parent_id'),
  name: text('name').notNull(),
  color: text('color').default('#38BDF8').notNull(),
  isTrashed: boolean('is_trashed').default(false).notNull(),
  trashedAt: timestamp('trashed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const files = pgTable('files', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  folderId: integer('folder_id').references(() => folders.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  extension: text('extension').notNull(),
  category: text('category').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  storageKey: text('storage_key').notNull(),
  isTrashed: boolean('is_trashed').default(false).notNull(),
  trashedAt: timestamp('trashed_at'),
  lastOpenedAt: timestamp('last_opened_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const favorites = pgTable(
  'favorites',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    fileId: integer('file_id')
      .references(() => files.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('favorites_user_file_idx').on(table.userId, table.fileId),
  ]
);

export const shares = pgTable('shares', {
  id: serial('id').primaryKey(),
  fileId: integer('file_id')
    .references(() => files.id, { onDelete: 'cascade' })
    .notNull(),
  ownerId: integer('owner_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  token: text('token').notNull().unique(),
  sharedWithEmail: text('shared_with_email'),
  permission: text('permission').default('downloader').notNull(),
  passwordHash: text('password_hash'),
  expiresAt: timestamp('expires_at'),
  downloadCount: integer('download_count').default(0).notNull(),
  isRevoked: boolean('is_revoked').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const uploadSessions = pgTable('upload_sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  folderId: integer('folder_id'),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  totalBytes: bigint('total_bytes', { mode: 'number' }).notNull(),
  uploadedBytes: bigint('uploaded_bytes', { mode: 'number' })
    .default(0)
    .notNull(),
  status: text('status').default('active').notNull(),
  tempKey: text('temp_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  fileId: integer('file_id'),
  action: text('action').notNull(),
  targetName: text('target_name').notNull(),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const storageUsage = pgTable('storage_usage', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  usedBytes: bigint('used_bytes', { mode: 'number' }).default(0).notNull(),
  photosBytes: bigint('photos_bytes', { mode: 'number' }).default(0).notNull(),
  videosBytes: bigint('videos_bytes', { mode: 'number' }).default(0).notNull(),
  documentsBytes: bigint('documents_bytes', { mode: 'number' })
    .default(0)
    .notNull(),
  audioBytes: bigint('audio_bytes', { mode: 'number' }).default(0).notNull(),
  archivesBytes: bigint('archives_bytes', { mode: 'number' })
    .default(0)
    .notNull(),
  othersBytes: bigint('others_bytes', { mode: 'number' }).default(0).notNull(),
  fileCount: integer('file_count').default(0).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const notes = pgTable('notes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  folders: many(folders),
  files: many(files),
  favorites: many(favorites),
  shares: many(shares),
  uploadSessions: many(uploadSessions),
  activityLogs: many(activityLogs),
  storageUsage: one(storageUsage, {
    fields: [users.id],
    references: [storageUsage.userId],
  }),
  notes: many(notes),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  user: one(users, {
    fields: [folders.userId],
    references: [users.id],
  }),
  files: many(files),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  user: one(users, {
    fields: [files.userId],
    references: [users.id],
  }),
  folder: one(folders, {
    fields: [files.folderId],
    references: [folders.id],
  }),
  favorites: many(favorites),
  shares: many(shares),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
  file: one(files, {
    fields: [favorites.fileId],
    references: [files.id],
  }),
}));

export const sharesRelations = relations(shares, ({ one }) => ({
  file: one(files, {
    fields: [shares.fileId],
    references: [files.id],
  }),
  owner: one(users, {
    fields: [shares.ownerId],
    references: [users.id],
  }),
}));
