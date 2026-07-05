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
  // Columns
  const cols = await pool.query(`
    SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'messages'
    ORDER BY ordinal_position
  `);
  console.log('=== messages table columns ===');
  cols.rows.forEach(c => {
    const len = c.character_maximum_length ? `(${c.character_maximum_length})` : '';
    const nn  = c.is_nullable === 'NO' ? ' NOT NULL' : '';
    const def = c.column_default ? ` DEFAULT ${c.column_default}` : '';
    console.log(`  ${c.column_name}  ${c.data_type}${len}${nn}${def}`);
  });

  // Row count
  const cnt = await pool.query(`SELECT COUNT(*) FROM messages`);
  console.log(`\n  Row count: ${cnt.rows[0].count}`);

  // Sample rows
  const sample = await pool.query(`SELECT * FROM messages LIMIT 5`);
  console.log('\n  Sample rows:');
  console.log(JSON.stringify(sample.rows, null, 2));

  await pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
