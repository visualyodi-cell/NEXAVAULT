import type { NextFunction, Request, Response } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySessionToken } from '../lib/signedUrls.ts';
import {
  ensureDemoWorkspaceSeeded,
  getOrCreateFirebaseUser,
  getUserByUid,
} from '../db/storageRepo.ts';

export interface AuthUserRecord {
  id: number;
  uid: string;
  email: string;
  name: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  storageQuotaBytes: number;
  preferences: {
    viewMode?: 'grid' | 'list';
    notificationsEnabled?: boolean;
    compactDensity?: boolean;
    reducedMotion?: boolean;
  } | null;
}

export interface AuthRequest extends Request {
  userRecord?: AuthUserRecord;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ error: 'Autentikasi diperlukan. Silakan masuk terlebih dahulu.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Token sesi tidak ditemukan.' });
  }

  // 1. Check NEXAVAULT HMAC session token (used for Email/Password & Demo Vault sessions)
  if (token.startsWith('nv.')) {
    const payload = verifySessionToken(token);
    if (!payload) {
      return res
        .status(401)
        .json({ error: 'Sesi telah kedaluwarsa atau tidak valid.' });
    }
    try {
      let user = await getUserByUid(payload.uid);
      if (!user && payload.uid === 'demo-nexavault-user') {
        user = await ensureDemoWorkspaceSeeded();
      }
      if (!user) {
        return res.status(401).json({ error: 'Akun tidak ditemukan.' });
      }
      req.userRecord = user;
      return next();
    } catch (error) {
      console.error('Auth session lookup failed:', error);
      return res.status(500).json({ error: 'Gagal memverifikasi sesi.' });
    }
  }

  // 2. Otherwise verify Firebase ID Token (Google Sign-In)
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const user = await getOrCreateFirebaseUser(
      decoded.uid,
      decoded.email || `${decoded.uid}@nexavault.cloud`,
      decoded.name,
      decoded.picture
    );
    req.userRecord = user;
    return next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res
      .status(401)
      .json({ error: 'Token autentikasi tidak valid atau kedaluwarsa.' });
  }
};
