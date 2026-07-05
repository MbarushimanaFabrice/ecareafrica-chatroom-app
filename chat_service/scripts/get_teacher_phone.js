require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.ECAFRICA_DB_HOST || 'localhost',
  port: 5432,
  database: process.env.ECAFRICA_DB_NAME || 'ECareAfrica_db',
  user: process.env.ECAFRICA_DB_USER || 'postgres',
  password: process.env.ECAFRICA_DB_PASSWORD,
});
pool.query("SELECT uuid, name, phone, role FROM users WHERE role='teacher' LIMIT 3")
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
