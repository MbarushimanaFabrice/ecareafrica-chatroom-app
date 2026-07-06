require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.ECAFRICA_DB_HOST || 'localhost',
  port: 5432,
  database: process.env.ECAFRICA_DB_NAME || 'ECareAfrica_db',
  user: process.env.ECAFRICA_DB_USER || 'postgres',
  password: process.env.ECAFRICA_DB_PASSWORD,
});
async function run() {
  // users table entry for the parent
  const users = await pool.query(`SELECT id, uuid, name, phone, role, status FROM users WHERE role = 'parent' LIMIT 3`);
  console.log('=== users table ===');
  console.log(JSON.stringify(users.rows, null, 2));

  // parents_guardians table
  const pg = await pool.query(`SELECT id, first_name, last_name, phone, user_id FROM parents_guardians LIMIT 3`);
  console.log('\n=== parents_guardians table ===');
  console.log(JSON.stringify(pg.rows, null, 2));

  // link between parent and student
  const links = await pool.query(`SELECT spl.*, s.first_name || ' ' || s.last_name AS student_name FROM student_parent_links spl JOIN students s ON s.id = spl.student_id LIMIT 3`);
  console.log('\n=== student_parent_links table ===');
  console.log(JSON.stringify(links.rows, null, 2));

  pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
