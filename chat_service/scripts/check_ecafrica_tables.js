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
  const r = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const all   = r.rows.map(x => x.table_name);
  const chat  = all.filter(t => t.startsWith('chat'));
  const other = all.filter(t => !t.startsWith('chat'));

  console.log(`Total tables: ${all.length}`);
  console.log(`Chat tables:  ${chat.length}`);
  console.log(`Other tables: ${other.length}`);

  if (chat.length > 0) {
    console.log('\n── Chat tables ──');
    chat.forEach(t => console.log('  ' + t));
  } else {
    console.log('\nNo chat_ tables found in ECareAfrica_db.');
  }

  console.log('\n── All other tables ──');
  other.forEach(t => console.log('  ' + t));

  await pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
