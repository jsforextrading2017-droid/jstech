import 'dotenv/config';
import crypto from 'crypto';
import { Pool } from 'pg';

export type OpenAIKeySource = 'database' | 'environment' | 'none';

type ContentTable = 'content_articles' | 'content_drafts';
type ContentRecord = { id: string };

export type MediaAssetRecord = {
  id: string;
  name: string;
  source_url: string;
  optimized_url: string;
  kind: string;
  width: number;
  height: number;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
};

const databaseUrl = process.env.DATABASE_URL;
const useSsl = process.env.NODE_ENV === 'production' || process.env.PGSSLMODE === 'require';

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    })
  : null;

let schemaReady: Promise<void> | null = null;

const ensureSchema = async () => {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_url TEXT NOT NULL,
      optimized_url TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'image',
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT 'image/webp',
      size_bytes BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS content_articles (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS content_drafts (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const migrateLegacyContentTable = async <T extends ContentRecord>(legacyKey: string, table: ContentTable) => {
  if (!pool) return;

  const legacyValue = await pool.query<{ value: string }>('SELECT value FROM app_settings WHERE key = $1', [legacyKey]);
  const raw = legacyValue.rows[0]?.value;
  if (!raw) {
    return;
  }

  const existing = await pool.query<{ id: string }>(`SELECT id FROM ${table} LIMIT 1`);
  if (existing.rows.length > 0) {
    await pool.query('DELETE FROM app_settings WHERE key = $1', [legacyKey]);
    return;
  }

  let parsed: T[];
  try {
    const data = JSON.parse(raw);
    parsed = Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return;
  }

  for (const item of parsed) {
    await pool.query(
      `INSERT INTO ${table} (id, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [item.id, JSON.stringify(item)]
    );
  }

  await pool.query('DELETE FROM app_settings WHERE key = $1', [legacyKey]);
};

const migrateLegacyContent = async () => {
  if (!pool) return;

  await migrateLegacyContentTable('content_articles', 'content_articles');
  await migrateLegacyContentTable('content_drafts', 'content_drafts');
};

const withPool = async <T>(callback: (activePool: Pool) => Promise<T>): Promise<T | null> => {
  if (!pool) return null;

  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureSchema();
      await migrateLegacyContent();
    })();
  }

  await schemaReady;
  return callback(pool);
};

export const getSetting = async (key: string): Promise<string | null> => {
  const value = await withPool(async (activePool) => {
    const result = await activePool.query<{ value: string }>('SELECT value FROM app_settings WHERE key = $1', [key]);
    return result.rows[0]?.value ?? null;
  });

  return value;
};

export const getJsonSetting = async <T>(key: string, fallback: T): Promise<T> => {
  const stored = await getSetting(key);
  if (!stored) {
    return fallback;
  }

  try {
    return JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
};

export const setSetting = async (key: string, value: string): Promise<void> => {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }

  await withPool(async (activePool) => {
    await activePool.query(
      `
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `,
      [key, value]
    );
  });
};

export const setJsonSetting = async <T>(key: string, value: T): Promise<void> => {
  await setSetting(key, JSON.stringify(value));
};

export const deleteSetting = async (key: string): Promise<void> => {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }

  await withPool(async (activePool) => {
    await activePool.query('DELETE FROM app_settings WHERE key = $1', [key]);
  });
};

export const resolveOpenAIKey = async (): Promise<{ key: string | null; source: OpenAIKeySource }> => {
  const databaseKey = await getSetting('openai_api_key');
  if (databaseKey) {
    return { key: databaseKey, source: 'database' };
  }

  if (process.env.OPENAI_API_KEY) {
    return { key: process.env.OPENAI_API_KEY, source: 'environment' };
  }

  return { key: null, source: 'none' };
};

export const saveOpenAIKey = async (apiKey: string) => {
  await setSetting('openai_api_key', apiKey.trim());
};

export const clearOpenAIKey = async () => {
  await deleteSetting('openai_api_key');
};

export type PasswordRecord = {
  salt: string;
  hash: string;
};

const ADMIN_PASSWORD_KEY = 'admin_password';
const DEFAULT_ADMIN_PASSWORD = 'admin123';
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEYLEN = 64;
const PASSWORD_DIGEST = 'sha512';

const encodePassword = (password: string, salt: string) =>
  crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('hex');

const createPasswordRecord = (password: string): PasswordRecord => {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    salt,
    hash: encodePassword(password, salt),
  };
};

export const verifyPasswordRecord = (password: string, record: PasswordRecord) =>
  crypto.timingSafeEqual(
    Buffer.from(encodePassword(password, record.salt), 'hex'),
    Buffer.from(record.hash, 'hex')
  );

export const getAdminPasswordRecord = async (): Promise<PasswordRecord> => {
  const stored = await getSetting(ADMIN_PASSWORD_KEY);
  if (stored) {
    const [salt, hash] = stored.split(':');
    if (salt && hash) {
      return { salt, hash };
    }
  }

  const fallback = createPasswordRecord(DEFAULT_ADMIN_PASSWORD);
  await setSetting(ADMIN_PASSWORD_KEY, `${fallback.salt}:${fallback.hash}`);
  return fallback;
};

export const setAdminPassword = async (password: string) => {
  const record = createPasswordRecord(password);
  await setSetting(ADMIN_PASSWORD_KEY, `${record.salt}:${record.hash}`);
};

export const createAdminSession = async (token: string, expiresAt: Date) => {
  await withPool(async (activePool) => {
    await activePool.query(
      `
        INSERT INTO admin_sessions (token, expires_at)
        VALUES ($1, $2)
        ON CONFLICT (token)
        DO UPDATE SET expires_at = EXCLUDED.expires_at
      `,
      [token, expiresAt.toISOString()]
    );
  });
};

export const getAdminSession = async (token: string) => {
  const result = await withPool(async (activePool) => {
    const data = await activePool.query<{ token: string; expires_at: string }>(
      'SELECT token, expires_at FROM admin_sessions WHERE token = $1',
      [token]
    );
    return data.rows[0] ?? null;
  });

  return result;
};

export const deleteAdminSession = async (token: string) => {
  await withPool(async (activePool) => {
    await activePool.query('DELETE FROM admin_sessions WHERE token = $1', [token]);
  });
};

export const cleanupExpiredAdminSessions = async () => {
  await withPool(async (activePool) => {
    await activePool.query('DELETE FROM admin_sessions WHERE expires_at < NOW()');
  });
};

export const listMediaAssets = async (): Promise<MediaAssetRecord[]> => {
  const result = await withPool(async (activePool) => {
    const data = await activePool.query<MediaAssetRecord>(
      'SELECT id, name, source_url, optimized_url, kind, width, height, mime_type, size_bytes, created_at, updated_at FROM media_assets ORDER BY updated_at DESC'
    );
    return data.rows;
  });

  return result || [];
};

export const getMediaAsset = async (id: string): Promise<MediaAssetRecord | null> => {
  const result = await withPool(async (activePool) => {
    const data = await activePool.query<MediaAssetRecord>(
      'SELECT id, name, source_url, optimized_url, kind, width, height, mime_type, size_bytes, created_at, updated_at FROM media_assets WHERE id = $1',
      [id]
    );
    return data.rows[0] ?? null;
  });

  return result;
};

export const upsertMediaAsset = async (asset: Omit<MediaAssetRecord, 'created_at' | 'updated_at'>): Promise<void> => {
  await withPool(async (activePool) => {
    await activePool.query(
      `
        INSERT INTO media_assets (
          id, name, source_url, optimized_url, kind, width, height, mime_type, size_bytes, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          source_url = EXCLUDED.source_url,
          optimized_url = EXCLUDED.optimized_url,
          kind = EXCLUDED.kind,
          width = EXCLUDED.width,
          height = EXCLUDED.height,
          mime_type = EXCLUDED.mime_type,
          size_bytes = EXCLUDED.size_bytes,
          updated_at = NOW()
      `,
      [
        asset.id,
        asset.name,
        asset.source_url,
        asset.optimized_url,
        asset.kind,
        asset.width,
        asset.height,
        asset.mime_type,
        asset.size_bytes,
      ]
    );
  });
};

export const deleteMediaAsset = async (id: string): Promise<void> => {
  await withPool(async (activePool) => {
    await activePool.query('DELETE FROM media_assets WHERE id = $1', [id]);
  });
};

const readStoredContent = async <T extends ContentRecord>(table: ContentTable): Promise<T[]> => {
  const result = await withPool(async (activePool) => {
    const data = await activePool.query<{ value: string }>(`SELECT value FROM ${table}`);
    return data.rows.map((row) => JSON.parse(row.value) as T);
  });

  return (result || []).sort((a, b) => {
    const aTime = new Date((a as any).publishedAt || (a as any).createdAt || 0).getTime();
    const bTime = new Date((b as any).publishedAt || (b as any).createdAt || 0).getTime();
    return bTime - aTime;
  });
};

const writeStoredContent = async <T extends ContentRecord>(table: ContentTable, items: T[]): Promise<void> => {
  await withPool(async (activePool) => {
    await activePool.query(`DELETE FROM ${table}`);

    for (const item of items) {
      await activePool.query(
        `INSERT INTO ${table} (id, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (id)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [item.id, JSON.stringify(item)]
      );
    }
  });
};

const upsertStoredContent = async <T extends ContentRecord>(table: ContentTable, item: T): Promise<void> => {
  await withPool(async (activePool) => {
    await activePool.query(
      `INSERT INTO ${table} (id, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [item.id, JSON.stringify(item)]
    );
  });
};

const deleteStoredContent = async (table: ContentTable, id: string): Promise<void> => {
  await withPool(async (activePool) => {
    await activePool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  });
};

export const listStoredArticles = async <T extends ContentRecord>(): Promise<T[]> =>
  readStoredContent<T>('content_articles');

export const listStoredDrafts = async <T extends ContentRecord>(): Promise<T[]> =>
  readStoredContent<T>('content_drafts');

export const replaceStoredArticles = async <T extends ContentRecord>(items: T[]): Promise<void> =>
  writeStoredContent('content_articles', items);

export const replaceStoredDrafts = async <T extends ContentRecord>(items: T[]): Promise<void> =>
  writeStoredContent('content_drafts', items);

export const upsertStoredArticle = async <T extends ContentRecord>(item: T): Promise<void> =>
  upsertStoredContent('content_articles', item);

export const upsertStoredDraft = async <T extends ContentRecord>(item: T): Promise<void> =>
  upsertStoredContent('content_drafts', item);

export const deleteStoredArticle = async (id: string): Promise<void> => deleteStoredContent('content_articles', id);

export const deleteStoredDraft = async (id: string): Promise<void> => deleteStoredContent('content_drafts', id);
