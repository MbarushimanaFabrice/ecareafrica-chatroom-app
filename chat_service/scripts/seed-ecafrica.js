/**
 * Seed script — inserts a complete test chain into ECareAfrica_db.
 *
 * Run: node scripts/seed-ecafrica.js
 *
 * Creates (idempotent — safe to re-run):
 *   school 1       → ECA Test School
 *   academic_year  → 2024/2025
 *   term 1         → Term 1
 *   class 1        → Senior 1
 *   section 1      → A  (full_name: Senior 1 A)
 *   subject 1      → Mathematics
 *   teacher user   → phone +250781000001  password Test@1234
 *   parent user    → phone +250781000002  password Test@1234
 *   student        → roll ECA-2025-001  (first_name Bob, last_name Niyonzima)
 *   teacher_section_subjects → teacher teaches Maths in section 1
 *   student_section_enrollments → student enrolled in section 1
 *   student_parent_links → student ↔ parent (is_primary=true)
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  host:     process.env.ECAFRICA_DB_HOST     || 'localhost',
  port:     parseInt(process.env.ECAFRICA_DB_PORT || '5432'),
  database: process.env.ECAFRICA_DB_NAME     || 'ECareAfrica_db',
  user:     process.env.ECAFRICA_DB_USER     || 'postgres',
  password: process.env.ECAFRICA_DB_PASSWORD || '',
  ssl:      false,
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. School ─────────────────────────────────────────────────────────────
    const existingSchool = await client.query(
      `SELECT id FROM schools WHERE id = 1`
    );
    let schoolId = 1;
    if (existingSchool.rows.length === 0) {
      const r = await client.query(`
        INSERT INTO schools (id, uuid, name, province, district, status, created_at, updated_at)
        VALUES (1, $1, 'ECA Test School', 'Kigali City', 'Gasabo',
                'active'::"SchoolStatus", NOW(), NOW())
        RETURNING id
      `, [uuidv4()]);
      schoolId = r.rows[0].id;
      console.log(`✓ school id=${schoolId}`);
    } else {
      console.log(`✓ school already exists id=1`);
    }

    // ── 2. Academic year ──────────────────────────────────────────────────────
    const existingYear = await client.query(
      `SELECT id FROM academic_years WHERE school_id = $1 AND name = '2024/2025'`,
      [schoolId]
    );
    let yearId;
    if (existingYear.rows.length === 0) {
      const r = await client.query(`
        INSERT INTO academic_years (school_id, name, start_date, end_date, is_current, created_at)
        VALUES ($1, '2024/2025', '2024-09-01', '2025-06-30', true, NOW())
        RETURNING id
      `, [schoolId]);
      yearId = r.rows[0].id;
      console.log(`✓ academic_year id=${yearId}`);
    } else {
      yearId = existingYear.rows[0].id;
      console.log(`✓ academic_year already exists id=${yearId}`);
    }

    // ── 3. Term ───────────────────────────────────────────────────────────────
    const existingTerm = await client.query(
      `SELECT id FROM terms WHERE school_id = $1 AND academic_year_id = $2 AND name = 'Term 1'`,
      [schoolId, yearId]
    );
    let termId;
    if (existingTerm.rows.length === 0) {
      const r = await client.query(`
        INSERT INTO terms (school_id, academic_year_id, name, start_date, end_date, is_current, created_at)
        VALUES ($1, $2, 'Term 1', '2024-09-01', '2024-12-20', true, NOW())
        RETURNING id
      `, [schoolId, yearId]);
      termId = r.rows[0].id;
      console.log(`✓ term id=${termId}`);
    } else {
      termId = existingTerm.rows[0].id;
      console.log(`✓ term already exists id=${termId}`);
    }

    // ── 4. Class ──────────────────────────────────────────────────────────────
    const existingClass = await client.query(
      `SELECT id FROM classes WHERE school_id = $1 AND name = 'Senior 1' AND academic_year_id IS NULL`,
      [schoolId]
    );
    let classId;
    if (existingClass.rows.length === 0) {
      const r = await client.query(`
        INSERT INTO classes (school_id, name, level, created_at)
        VALUES ($1, 'Senior 1', 1, NOW())
        RETURNING id
      `, [schoolId]);
      classId = r.rows[0].id;
      console.log(`✓ class id=${classId} (Senior 1)`);
    } else {
      classId = existingClass.rows[0].id;
      console.log(`✓ class already exists id=${classId}`);
    }

    // ── 5. Section ────────────────────────────────────────────────────────────
    const existingSection = await client.query(
      `SELECT id FROM sections WHERE school_id = $1 AND class_id = $2 AND name = 'A'`,
      [schoolId, classId]
    );
    let sectionId;
    if (existingSection.rows.length === 0) {
      const r = await client.query(`
        INSERT INTO sections (school_id, class_id, name, full_name, created_at)
        VALUES ($1, $2, 'A', 'Senior 1 A', NOW())
        RETURNING id
      `, [schoolId, classId]);
      sectionId = r.rows[0].id;
      console.log(`✓ section id=${sectionId} (Senior 1 A)`);
    } else {
      sectionId = existingSection.rows[0].id;
      console.log(`✓ section already exists id=${sectionId}`);
    }

    // ── 6. Subject ────────────────────────────────────────────────────────────
    const existingSubject = await client.query(
      `SELECT id FROM subjects WHERE school_id = $1 AND name = 'Mathematics'`,
      [schoolId]
    );
    let subjectId;
    if (existingSubject.rows.length === 0) {
      const r = await client.query(`
        INSERT INTO subjects (school_id, name, code, created_at)
        VALUES ($1, 'Mathematics', 'MATH', NOW())
        RETURNING id
      `, [schoolId]);
      subjectId = r.rows[0].id;
      console.log(`✓ subject id=${subjectId} (Mathematics)`);
    } else {
      subjectId = existingSubject.rows[0].id;
      console.log(`✓ subject already exists id=${subjectId}`);
    }

    // ── 7. Teacher user ───────────────────────────────────────────────────────
    const teacherPhone = '+250781000001';
    const existingTeacher = await client.query(
      `SELECT id, uuid FROM users WHERE phone = $1`, [teacherPhone]
    );
    let teacherUserId;
    if (existingTeacher.rows.length === 0) {
      const teacherHash = await bcrypt.hash('Test@1234', 10);
      const r = await client.query(`
        INSERT INTO users (uuid, school_id, name, email, phone, password_hash, role, status, created_at, updated_at)
        VALUES ($1, $2, 'Alice Uwimana', 'alice@ecatest.rw', $3, $4,
                'teacher'::"UserRole", 'active'::"UserStatus", NOW(), NOW())
        RETURNING id
      `, [uuidv4(), schoolId, teacherPhone, teacherHash]);
      teacherUserId = r.rows[0].id;
      console.log(`✓ teacher user id=${teacherUserId} phone=${teacherPhone}`);
    } else {
      teacherUserId = existingTeacher.rows[0].id;
      console.log(`✓ teacher user already exists id=${teacherUserId}`);
    }

    // ── 8. Parent user ────────────────────────────────────────────────────────
    const parentPhone = '+250781000002';
    const existingParent = await client.query(
      `SELECT id FROM users WHERE phone = $1`, [parentPhone]
    );
    let parentUserId;
    if (existingParent.rows.length === 0) {
      const parentHash = await bcrypt.hash('Test@1234', 10);
      const r = await client.query(`
        INSERT INTO users (uuid, school_id, name, email, phone, password_hash, role, status, created_at, updated_at)
        VALUES ($1, $2, 'Jean Mugisha', 'jean@ecatest.rw', $3, $4,
                'parent'::"UserRole", 'active'::"UserStatus", NOW(), NOW())
        RETURNING id
      `, [uuidv4(), schoolId, parentPhone, parentHash]);
      parentUserId = r.rows[0].id;
      console.log(`✓ parent user id=${parentUserId} phone=${parentPhone}`);
    } else {
      parentUserId = existingParent.rows[0].id;
      console.log(`✓ parent user already exists id=${parentUserId}`);
    }

    // ── 9. Parent/guardian profile ────────────────────────────────────────────
    const existingPg = await client.query(
      `SELECT id FROM parents_guardians WHERE user_id = $1`, [parentUserId]
    );
    let pgId;
    if (existingPg.rows.length === 0) {
      const r = await client.query(`
        INSERT INTO parents_guardians
              (school_id, user_id, first_name, last_name, phone, relationship, created_at, updated_at)
        VALUES ($1, $2, 'Jean', 'Mugisha', $3, 'Father', NOW(), NOW())
        RETURNING id
      `, [schoolId, parentUserId, parentPhone]);
      pgId = r.rows[0].id;
      console.log(`✓ parents_guardians id=${pgId}`);
    } else {
      pgId = existingPg.rows[0].id;
      console.log(`✓ parents_guardians already exists id=${pgId}`);
    }

    // ── 10. Student ───────────────────────────────────────────────────────────
    const rollNumber = 'ECA-2025-001';
    const existingStudent = await client.query(
      `SELECT id FROM students WHERE student_id_number = $1`, [rollNumber]
    );
    let studentId;
    if (existingStudent.rows.length === 0) {
      const r = await client.query(`
        INSERT INTO students
              (uuid, school_id, first_name, last_name, student_id_number,
               student_type, status, created_at, updated_at)
        VALUES ($1, $2, 'Bob', 'Niyonzima', $3,
                'day'::"StudentType", 'active'::"StudentStatus", NOW(), NOW())
        RETURNING id
      `, [uuidv4(), schoolId, rollNumber]);
      studentId = r.rows[0].id;
      console.log(`✓ student id=${studentId} roll=${rollNumber}`);
    } else {
      studentId = existingStudent.rows[0].id;
      console.log(`✓ student already exists id=${studentId}`);
    }

    // ── 11. Student section enrollment ────────────────────────────────────────
    const existingEnroll = await client.query(
      `SELECT id FROM student_section_enrollments
       WHERE student_id = $1 AND section_id = $2 AND academic_year_id = $3`,
      [studentId, sectionId, yearId]
    );
    if (existingEnroll.rows.length === 0) {
      await client.query(`
        INSERT INTO student_section_enrollments
              (school_id, student_id, section_id, academic_year_id, term_id, enrolled_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
      `, [schoolId, studentId, sectionId, yearId, termId]);
      console.log(`✓ student_section_enrollments`);
    } else {
      console.log(`✓ enrollment already exists`);
    }

    // ── 12. Student–parent link ───────────────────────────────────────────────
    const existingLink = await client.query(
      `SELECT id FROM student_parent_links WHERE student_id = $1 AND parent_id = $2`,
      [studentId, pgId]
    );
    if (existingLink.rows.length === 0) {
      await client.query(`
        INSERT INTO student_parent_links (student_id, parent_id, is_primary)
        VALUES ($1, $2, true)
      `, [studentId, pgId]);
      console.log(`✓ student_parent_links`);
    } else {
      console.log(`✓ student_parent_links already exists`);
    }

    // ── 13. Teacher section subject ───────────────────────────────────────────
    const existingTss = await client.query(
      `SELECT id FROM teacher_section_subjects
       WHERE teacher_id = $1 AND section_id = $2 AND subject_id = $3 AND term_id = $4`,
      [teacherUserId, sectionId, subjectId, termId]
    );
    if (existingTss.rows.length === 0) {
      await client.query(`
        INSERT INTO teacher_section_subjects
              (school_id, teacher_id, section_id, subject_id, term_id, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [schoolId, teacherUserId, sectionId, subjectId, termId]);
      console.log(`✓ teacher_section_subjects`);
    } else {
      console.log(`✓ teacher_section_subjects already exists`);
    }

    await client.query('COMMIT');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Seed complete. Test credentials:');
    console.log('  Teacher  →  phone: +250781000001  password: Test@1234');
    console.log('  Parent   →  phone: +250781000002  password: Test@1234');
    console.log('  Student  →  roll:  ECA-2025-001');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed — rolled back:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
