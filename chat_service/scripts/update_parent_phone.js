'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.ECAFRICA_DB_HOST,
  port:     parseInt(process.env.ECAFRICA_DB_PORT || '5432'),
  database: process.env.ECAFRICA_DB_NAME,
  user:     process.env.ECAFRICA_DB_USER,
  password: process.env.ECAFRICA_DB_PASSWORD,
});

async function run() {
  const r1 = await pool.query(
    `UPDATE users SET phone = '0773666640', updated_at = NOW()
     WHERE phone = '+250781000002' AND role = 'parent'`
  );
  console.log('users updated:', r1.rowCount, 'row(s)');

  const r2 = await pool.query(
    `UPDATE parents_guardians SET phone = '0773666640', updated_at = NOW()
     WHERE phone = '+250781000002'`
  );
  console.log('parents_guardians updated:', r2.rowCount, 'row(s)');

  await pool.end();
  console.log('Done.');
}

run().catch(e => { console.error(e.message); process.exit(1); });
