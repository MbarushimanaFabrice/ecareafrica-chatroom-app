require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.ECAFRICA_DB_HOST || 'localhost',
  port: process.env.ECAFRICA_DB_PORT || 5432,
  database: process.env.ECAFRICA_DB_NAME || 'ECareAfrica_db',
  user: process.env.ECAFRICA_DB_USER || 'postgres',
  password: process.env.ECAFRICA_DB_PASSWORD,
});
async function run() {
  const r = await pool.query(`SELECT gen_random_uuid() AS id`);
  console.log('gen_random_uuid() works:', r.rows[0].id);
  // check pgcrypto
  const ext = await pool.query(`SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','uuid-ossp')`);
  console.log('Extensions:', ext.rows.map(r => r.extname));
  await pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
