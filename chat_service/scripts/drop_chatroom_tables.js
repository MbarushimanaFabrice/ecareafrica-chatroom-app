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
  // Drop the 7 chatroom_* tables we just created (they have no data)
  const tables = [
    'chatroom_sms_logs','chatroom_device_tokens','chatroom_active_status',
    'chatroom_broadcasts','chatroom_message_status','chatroom_messages','chatroom_threads'
  ];
  for (const t of tables) {
    await pool.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    console.log(`Dropped: ${t}`);
  }
  await pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
