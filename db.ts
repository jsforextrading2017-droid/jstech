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
