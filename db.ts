import crypto from 'crypto';
import { Pool } from 'pg';

export type OpenAIKeySource = 'database' | 'environment' | 'none';

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
};

const withPool = async <T>(callback: (activePool: Pool) => Promise<T>): Promise<T | null> => {
  if (!pool) return null;

  if (!schemaReady) {
    schemaReady = ensureSchema();
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
