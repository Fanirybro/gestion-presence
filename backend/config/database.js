import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  keepAlive: true,
});

pool.on('error', (err) => {
  console.warn('[db-pool] Client inactif déconnecté ou incident réseau temporaire :', err.message);
});

export default pool;
