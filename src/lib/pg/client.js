import { Pool } from 'pg';
import { CONFIG } from '../../utils/constants/config.js';

function getSSLConfig(url) {
  return url.includes('neon.tech') ? { rejectUnauthorized: false } : undefined;
}

const poolConfig = {
  connectionString: CONFIG.DATABASE_URL,
  ssl: getSSLConfig(CONFIG.DATABASE_URL),
};
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
export const pgPool = new Pool(poolConfig);

// Puedes importar pgPool en tus servicios para hacer consultas:
// import { pgPool } from '../..//lib/pg/client';
