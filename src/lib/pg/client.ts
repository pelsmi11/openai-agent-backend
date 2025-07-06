import { Pool, PoolConfig } from 'pg';
import { CONFIG } from '../../utils/constants/config.js';
import type { ConnectionOptions } from 'tls'; // <- para tipado estricto

function getSSLConfig(url: string): boolean | ConnectionOptions | undefined {
  return url.includes('neon.tech') ? { rejectUnauthorized: false } : undefined;
}

const poolConfig: PoolConfig = {
  connectionString: CONFIG.DATABASE_URL,
  ssl: getSSLConfig(CONFIG.DATABASE_URL),
};
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
export const pgPool: Pool = new Pool(poolConfig);

// Puedes importar pgPool en tus servicios para hacer consultas:
// import { pgPool } from '../..//lib/pg/client';
