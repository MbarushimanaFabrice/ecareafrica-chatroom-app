const { queryEca } = require('../db/ecafrica_pool');
const { logger }   = require('../utils/logger');

// ── Main entry point ──────────────────────────────────────────────────────────
async function getUserContext(userId, schoolId, _token) {
  // userId is users.uuid for teacher/parent, students.uuid for student
  // schoolId is a string of the numeric school id from the JWT

  // Try teacher first, then parent, then student
  const role = await detectRole(userId);

  if (role === 'teacher')  return buildTeacherContext(userId, schoolId);
  if (role === 'parent')   return buildParentContext(userId, schoolId);
  if (role === 'student')  return buildStudentContext(userId);

  throw new Error(`Could not resolve user context for userId=${userId}`);
}

// ── Role detection ────────────────────────────────────────────────────────────
async function detectRole(uuid) {
  const r = await queryEca(
    `SELECT role FROM users WHERE uuid = $1 AND deleted_at IS NULL LIMIT 1`,
    [uuid]
  );
  if (r.rows.length > 0) return r.rows[0].role;

  const s = await queryEca(
    `SELECT id FROM students WHERE uuid = $1 AND deleted_at IS NULL LIMIT 1`,
    [uuid]
  );
  if (s.rows.length > 0) return 'student';

  return null;
}

// ── Teacher context ───────────────────────────────────────────────────────────
async function buildTeacherContext(uuid, schoolId) {
  const userRow = await queryEca(
    `SELECT id, uuid, name, school_id FROM users
     WHERE uuid = $1 AND deleted_at IS NULL LIMIT 1`,
    [uuid]
  );
  if (userRow.rows.length === 0) throw new Error('Teacher not found');
  const teacher = userRow.rows[0];

  const rows = await queryEca(
    `SELECT DISTINCT
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
     WHERE tss.teacher_id = $1
       AND tss.deleted_at IS NULL
     ORDER BY s.uuid, subj.name`,
    [teacher.id]
  );

  // Group students
  const studentMap = new Map();
  const sectionMap = new Map();
  for (const row of rows.rows) {
    if (!studentMap.has(row.student_id)) {
      studentMap.set(row.student_id, {
        student_id:        row.student_id,
        full_name:         row.student_name,
        admission_number:  row.student_id_number,
        section_id:        row.section_id,
        section:           row.section_name,
        parent_name:       row.parent_name,
        parent_phone:      row.parent_phone,
        parent_user_id:    row.parent_user_id,
        subjects:          [],
      });
    }
    studentMap.get(row.student_id).subjects.push(row.subject_name);

    if (row.section_id && !sectionMap.has(row.section_id)) {
      sectionMap.set(row.section_id, {
        class_id:   row.section_id,
        class_name: row.section_name,
        section:    row.section_name,
      });
    }
  }

  return {
    user_id:   uuid,
    school_id: String(teacher.school_id),
    role:      'teacher',
    full_name: teacher.name,
    students:  Array.from(studentMap.values()),
    subjects:  [...new Set(rows.rows.map(r => r.subject_name))],
    classes:   Array.from(sectionMap.values()),
  };
}

// ── Parent context ────────────────────────────────────────────────────────────
async function buildParentContext(uuid, schoolId) {
  const userRow = await queryEca(
    `SELECT id, uuid, name, school_id FROM users
     WHERE uuid = $1 AND deleted_at IS NULL LIMIT 1`,
    [uuid]
  );
  if (userRow.rows.length === 0) throw new Error('Parent user not found');
  const parentUser = userRow.rows[0];

  const pgRow = await queryEca(
    `SELECT id FROM parents_guardians WHERE user_id = $1 LIMIT 1`,
    [parentUser.id]
  );
  if (pgRow.rows.length === 0) throw new Error('Parent profile not found');
  const parentId = pgRow.rows[0].id;

  const rows = await queryEca(
    `SELECT DISTINCT
       s.uuid               AS student_id,
       s.first_name || ' ' || s.last_name AS student_name,
       s.student_id_number,
       sec.full_name        AS section_name,
       tu.uuid              AS teacher_id,
       tu.name              AS teacher_name,
       subj.name            AS subject_name
     FROM student_parent_links spl
     JOIN students s     ON s.id    = spl.student_id   AND s.status = 'active'
                                                         AND s.deleted_at IS NULL
     JOIN student_section_enrollments sse
                         ON sse.student_id = s.id       AND sse.status = 'active'
     JOIN sections sec   ON sec.id  = sse.section_id   AND sec.deleted_at IS NULL
     JOIN teacher_section_subjects tss
                         ON tss.section_id = sec.id     AND tss.deleted_at IS NULL
     JOIN users tu       ON tu.id   = tss.teacher_id   AND tu.role = 'teacher'
     JOIN subjects subj  ON subj.id = tss.subject_id   AND subj.deleted_at IS NULL
     WHERE spl.parent_id = $1
     ORDER BY s.uuid, tu.name, subj.name`,
    [parentId]
  );

  // Group by child
  const childMap = new Map();
  for (const row of rows.rows) {
    if (!childMap.has(row.student_id)) {
      childMap.set(row.student_id, {
        student_id:       row.student_id,
        full_name:        row.student_name,
        admission_number: row.student_id_number,
        class_id:         row.student_id,
        section:          row.section_name,
        teachers:         [],
      });
    }
    const child = childMap.get(row.student_id);
    const alreadyAdded = child.teachers.some(
      t => t.teacher_id === row.teacher_id && t.subject === row.subject_name
    );
    if (!alreadyAdded) {
      child.teachers.push({
        teacher_id: row.teacher_id,
        user_id:    row.teacher_id,
        full_name:  row.teacher_name,
        subject:    row.subject_name,
        is_online:  false,
      });
    }
  }

  return {
    user_id:   uuid,
    school_id: String(parentUser.school_id),
    role:      'parent',
    full_name: parentUser.name,
    children:  Array.from(childMap.values()),
  };
}

// ── Student context ───────────────────────────────────────────────────────────
async function buildStudentContext(uuid) {
  const studentRow = await queryEca(
    `SELECT id, uuid, school_id,
            first_name || ' ' || last_name AS full_name,
            student_id_number
     FROM students
     WHERE uuid = $1 AND deleted_at IS NULL LIMIT 1`,
    [uuid]
  );
  if (studentRow.rows.length === 0) throw new Error('Student not found');
  const student = studentRow.rows[0];

  const rows = await queryEca(
    `SELECT DISTINCT
       tu.uuid              AS teacher_id,
       tu.name              AS teacher_name,
       subj.name            AS subject_name,
       sec.full_name        AS section_name,
       pg.phone             AS parent_phone
     FROM student_section_enrollments sse
     JOIN sections sec   ON sec.id  = sse.section_id   AND sec.deleted_at IS NULL
     JOIN teacher_section_subjects tss
                         ON tss.section_id = sec.id     AND tss.deleted_at IS NULL
     JOIN users tu       ON tu.id   = tss.teacher_id   AND tu.role = 'teacher'
     JOIN subjects subj  ON subj.id = tss.subject_id   AND subj.deleted_at IS NULL
     LEFT JOIN student_parent_links spl ON spl.student_id = sse.student_id
                                        AND spl.is_primary = true
     LEFT JOIN parents_guardians pg     ON pg.id = spl.parent_id
     WHERE sse.student_id = $1 AND sse.status = 'active'
     ORDER BY tu.name, subj.name`,
    [student.id]
  );

  const teachers = rows.rows.map(r => ({
    teacher_id: r.teacher_id,
    user_id:    r.teacher_id,
    full_name:  r.teacher_name,
    subject:    r.subject_name,
    is_online:  false,
  }));

  // Deduplicate teachers (same teacher may appear for multiple subjects)
  const uniqueTeachers = teachers.filter(
    (t, i, arr) => arr.findIndex(x => x.teacher_id === t.teacher_id && x.subject === t.subject) === i
  );

  const section     = rows.rows[0]?.section_name  || '';
  const parentPhone = rows.rows[0]?.parent_phone  || '';

  return {
    user_id:          uuid,
    student_id:       uuid,
    school_id:        String(student.school_id),
    role:             'student',
    full_name:        student.full_name,
    admission_number: student.student_id_number,
    class_id:         uuid,
    section,
    parent_phone:     parentPhone,
    teachers:         uniqueTeachers,
  };
}

module.exports = { getUserContext };
