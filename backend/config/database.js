import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Erreur lors de la connexion à la base de données', err);
  process.exit(-1);
});

export default pool;
