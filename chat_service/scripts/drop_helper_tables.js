require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host:     process.env.ECAFRICA_DB_HOST || 'localhost',
  port:     process.env.ECAFRICA_DB_PORT || 5432,
  database: process.env.ECAFRICA_DB_NAME || 'ECareAfrica_db',
  user:     process.env.ECAFRICA_DB_USER || 'postgres',
  password: process.env.ECAFRICA_DB_PASSWORD,
});
async function run() {
  await pool.query('DROP TABLE IF EXISTS chatroom_active_status CASCADE');
  console.log('Dropped: chatroom_active_status');
  await pool.query('DROP TABLE IF EXISTS chatroom_device_tokens CASCADE');
  console.log('Dropped: chatroom_device_tokens');
  await pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
