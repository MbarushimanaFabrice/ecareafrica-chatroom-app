require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'netrack_chat',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function run() {
  // Indexes
  const idx = await pool.query(`
    SELECT indexname, tablename, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('chat_messages','chat_threads','chat_message_status')
    ORDER BY tablename, indexname
  `);
  console.log('=== Indexes ===');
  idx.rows.forEach(r => console.log(`  [${r.tablename}] ${r.indexname}\n    ${r.indexdef}`));

  // Foreign keys
  const fk = await pool.query(`
    SELECT tc.table_name, kcu.column_name,
           ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('chat_messages','chat_threads','chat_message_status')
    ORDER BY tc.table_name
  `);
  console.log('\n=== Foreign Keys ===');
  fk.rows.forEach(r => console.log(`  ${r.table_name}.${r.column_name} → ${r.foreign_table}.${r.foreign_column}`));

  // Sample rows already in chat_messages
  const msgs = await pool.query(`
    SELECT id, thread_id, sender_id, sender_role, content, sent_at
    FROM chat_messages
    ORDER BY sent_at DESC
    LIMIT 5
  `);
  console.log('\n=== Last 5 messages ===');
  console.log(JSON.stringify(msgs.rows, null, 2));

  await pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
