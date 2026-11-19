import crypto from 'node:crypto';

const SECRET_KEY =
  process.env.NEXAVAULT_SIGNING_SECRET ||
  crypto
    .createHash('sha256')
    .update(
      `${process.env.SQL_PASSWORD || 'nexavault-local-dev'}:${process.env.SQL_DB_NAME || 'nexavault'}`
    )
    .digest('hex');

export interface LocalTokenPayload {
  uid: string;
  email: string;
  exp: number;
}

export function signSessionToken(uid: string, email: string, ttlMs = 7 * 24 * 60 * 60 * 1000): string {
  const payload: LocalTokenPayload = {
    uid,
    email,
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(encoded)
    .digest('base64url');
  return `nv.${encoded}.${sig}`;
}

export function verifySessionToken(token: string): LocalTokenPayload | null {
  if (!token || !token.startsWith('nv.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expected = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as LocalTokenPayload;
    if (!parsed.uid || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signFileUrl(
  fileId: number,
  userId: number,
  ttlSeconds = 3600
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const data = `${fileId}:${userId}:${exp}`;
  const sig = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(data)
    .digest('base64url');
  return `/api/files/${fileId}/content?uid=${userId}&exp=${exp}&sig=${sig}`;
}

export function verifySignedFileUrl(
  fileId: number,
  userId: number,
  exp: number,
  sig: string
): boolean {
  if (!Number.isFinite(fileId) || !Number.isFinite(userId) || !Number.isFinite(exp) || !sig) {
    return false;
  }
  if (exp < Math.floor(Date.now() / 1000)) return false;
  const data = `${fileId}:${userId}:${exp}`;
  const expected = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(data)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}
