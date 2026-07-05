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
  // Check student_section_enrollments
  const sse = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'student_section_enrollments' ORDER BY ordinal_position`
  );
  console.log('=== student_section_enrollments ===');
  sse.rows.forEach(c => console.log(`  ${c.column_name}  (${c.data_type})`));

  // Run the actual teacher context query with the fix applied
  const q = await pool.query(`
    SELECT DISTINCT
      s.uuid               AS student_id,
      s.first_name || ' ' || s.last_name AS student_name,
      s.student_id_number,
      sec.id::text         AS section_id,
      sec.full_name        AS section_name,
      subj.name            AS subject_name,
      pg.first_name || ' ' || pg.last_name AS parent_name,
      pg.phone             AS parent_phone,
      pu.uuid              AS parent_user_id
    FROM teacher_section_subjects tss
    JOIN sections sec   ON sec.id  = tss.section_id  AND sec.deleted_at IS NULL
    JOIN subjects subj  ON subj.id = tss.subject_id  AND subj.deleted_at IS NULL
    JOIN student_section_enrollments sse
                        ON sse.section_id = sec.id   AND sse.status = 'active'
    JOIN students s     ON s.id    = sse.student_id  AND s.status = 'active'
                                                      AND s.deleted_at IS NULL
    LEFT JOIN student_parent_links spl ON spl.student_id = s.id AND spl.is_primary = true
    LEFT JOIN parents_guardians pg     ON pg.id = spl.parent_id
    LEFT JOIN users pu                 ON pu.id = pg.user_id
    WHERE tss.teacher_id = 1
      AND tss.deleted_at IS NULL
    ORDER BY s.uuid, subj.name
  `);
  console.log('\n=== teacher context query result ===');
  console.log(JSON.stringify(q.rows, null, 2));
  console.log(`\nRows returned: ${q.rows.length}`);
  await pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
