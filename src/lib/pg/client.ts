import { Pool, type PoolConfig } from 'pg';
import { CONFIG } from '../../utils/constants/config.js';

function getSSLConfig(url: string) {
  return url.includes('neon.tech') ? { rejectUnauthorized: false } : undefined;
}

const poolConfig: PoolConfig = {
  connectionString: CONFIG.DATABASE_URL,
  ssl: getSSLConfig(CONFIG.DATABASE_URL),
};
export const pgPool = new Pool(poolConfig);

// Puedes importar pgPool en tus servicios para hacer consultas:
// import { pgPool } from '../..//lib/pg/client';
