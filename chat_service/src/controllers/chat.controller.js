const { queryEca } = require('../db/ecafrica_pool');
const { v4: uuidv4, v5: uuidv5 } = require('uuid');
const { getUserContext } = require('../services/user_context.service');
const { publishFirebaseEvent } = require('../services/firebase.service');
const { sendPushNotification } = require('../services/notification.service');
const { logger } = require('../utils/logger');

// Fixed namespace UUID for deterministic thread IDs (UUID v5)
const THREAD_NS = 'c3a4b5d6-e7f8-4a9b-b0c1-d2e3f4a5b6c7';

function buildThreadId({ schoolId, teacherId, studentId, initiator, parentId }) {
  const key = [schoolId, teacherId, studentId, initiator, parentId || ''].join(':');
  return uuidv5(key, THREAD_NS);
}

// ── Enrich threads with display_name + subject_label ─────────────────────────
async function resolveDisplayNames(threads, userId, schoolId, role, authToken) {
  if (!threads.length) return threads;
  try {
    const ctx = await getUserContext(userId, schoolId, authToken);

    if (role === 'parent') {
      const teacherMap = {};
      for (const child of (ctx.children || [])) {
        for (const t of (child.teachers || [])) {
          if (!teacherMap[t.user_id]) {
            teacherMap[t.user_id] = { name: t.full_name, subject: t.subject };
          }
        }
      }
      return threads.map(t => {
        const info = teacherMap[t.teacher_id];
        return {
          ...t,
          display_name:  info ? `${info.name} — ${info.subject} Teacher` : '',
          subject_label: info?.subject ?? null,
        };
      });
    }

    if (role === 'teacher') {
      const studentMap = {};
      const parentMap  = {};
      for (const student of (ctx.students || [])) {
        studentMap[student.student_id] = student.full_name;
        if (student.parent_user_id) {
          parentMap[student.parent_user_id] = `Parent of ${student.full_name}`;
        }
      }
      return threads.map(t => {
        const displayName = t.thread_initiator === 'student'
          ? (studentMap[t.student_id] || '')
          : (parentMap[t.parent_id]   || '');
        return {
          ...t,
          display_name:  displayName,
          subject_label: (ctx.subjects || [])[0] ?? null,
        };
      });
    }

    if (role === 'student') {
      const teacherMap = {};
      for (const t of (ctx.teachers || [])) {
        if (!teacherMap[t.user_id]) {
          teacherMap[t.user_id] = { name: t.full_name, subject: t.subject };
        }
      }
      return threads.map(t => {
        const info = teacherMap[t.teacher_id];
        return {
          ...t,
          display_name:  info ? `${info.name} — ${info.subject} Teacher` : '',
          subject_label: info?.subject ?? null,
        };
      });
    }
  } catch (e) {
    logger.warn('resolveDisplayNames failed:', e.message);
  }
  return threads;
}

// ── GET /chat/threads ─────────────────────────────────────────────────────────
async function getThreads(req, res) {
  try {
    const { sub: userId, school_id: schoolId, role } = req.user;

    let roleFilter;
    if (role === 'teacher') {
      roleFilter = `teacher_id = $2`;
    } else if (role === 'parent') {
      roleFilter = `parent_id = $2`;
    } else if (role === 'student') {
      roleFilter = `student_id = $2 AND thread_initiator = 'student'`;
    } else {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const result = await queryEca(
      `WITH thread_anchors AS (
         SELECT thread_id, thread_type, thread_initiator,
                teacher_id, student_id, parent_id, school_id
         FROM   "chatRoom_history"
         WHERE  message_type = 'system' AND school_id = $1 AND ${roleFilter}
       ),
       latest_msg AS (
         SELECT DISTINCT ON (thread_id)
                thread_id, content,
                message_type AS last_message_type,
                sent_at
         FROM   "chatRoom_history"
         WHERE  message_type != 'system' AND is_deleted = FALSE
         ORDER  BY thread_id, sent_at DESC
       ),
       unread AS (
         SELECT thread_id, COUNT(*)::int AS unread_count
         FROM   "chatRoom_history"
         WHERE  recipient_id = $2 AND status != 'seen'
                AND is_deleted = FALSE AND message_type != 'system'
         GROUP  BY thread_id
       )
       SELECT ta.*,
              ta.thread_id         AS id,
              lm.content           AS last_message_preview,
              lm.last_message_type,
              lm.sent_at           AS last_message_at,
              COALESCE(u.unread_count, 0) AS unread_count
       FROM   thread_anchors ta
       LEFT   JOIN latest_msg lm ON lm.thread_id = ta.thread_id
       LEFT   JOIN unread      u ON u.thread_id  = ta.thread_id
       ORDER  BY COALESCE(lm.sent_at, NOW()) DESC`,
      [schoolId, userId]
    );

    const enriched = await resolveDisplayNames(
      result.rows, userId, schoolId, role,
      req.headers.authorization?.slice(7)
    );
    res.json({ data: enriched });
  } catch (err) {
    logger.error('getThreads error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── POST /chat/threads ────────────────────────────────────────────────────────
async function createThread(req, res) {
  try {
    const { sub: userId, school_id: schoolId, role } = req.user;
    const { teacher_id, student_id, thread_type = 'direct', thread_initiator, parent_id } = req.body;

    if (!teacher_id || !student_id) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'teacher_id and student_id are required.' });
    }

    const initiator = thread_initiator || (role === 'student' ? 'student' : 'parent');
    const pId = parent_id || (role === 'parent' ? userId : null);

    const threadId = buildThreadId({
      schoolId, teacherId: teacher_id, studentId: student_id,
      initiator, parentId: pId,
    });

    // System row anchors the thread; idempotent on conflict
    await queryEca(
      `INSERT INTO "chatRoom_history"
         (school_id, thread_id, thread_type, thread_initiator,
          teacher_id, student_id, parent_id,
          sender_id, sender_role, message_type, content)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'system','__thread_created__')
       ON CONFLICT (thread_id) WHERE message_type = 'system' DO NOTHING`,
      [schoolId, threadId, thread_type, initiator,
       teacher_id, student_id, pId, userId, role]
    );

    const result = await queryEca(
      `SELECT thread_id AS id, thread_id, thread_type, thread_initiator,
              teacher_id, student_id, parent_id, school_id
       FROM   "chatRoom_history"
       WHERE  thread_id = $1 AND message_type = 'system'
       LIMIT  1`,
      [threadId]
    );

    logger.info(`createThread: threadId=${threadId}`);
    const [enriched] = await resolveDisplayNames(
      result.rows, userId, schoolId, role,
      req.headers.authorization?.slice(7)
    );
    res.status(200).json({ data: enriched });
  } catch (err) {
    logger.error('createThread error:', err.message);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

// ── GET /chat/threads/:threadId/messages ──────────────────────────────────────
async function getMessages(req, res) {
  try {
    const { sub: userId, school_id: schoolId } = req.user;
    const { threadId } = req.params;
    const page   = parseInt(req.query.page  || '1');
    const limit  = parseInt(req.query.limit || '30');
    const offset = (page - 1) * limit;

    const accessCheck = await queryEca(
      `SELECT 1 FROM "chatRoom_history"
       WHERE  thread_id = $1 AND school_id = $2 AND message_type = 'system'
         AND  (teacher_id = $3 OR parent_id = $3 OR student_id = $3)
       LIMIT  1`,
      [threadId, schoolId, userId]
    );
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const result = await queryEca(
      `SELECT * FROM "chatRoom_history"
       WHERE  thread_id = $1 AND school_id = $2
         AND  message_type != 'system' AND is_deleted = FALSE
       ORDER  BY sent_at ASC
       LIMIT  $3 OFFSET $4`,
      [threadId, schoolId, limit, offset]
    );

    res.json({ data: result.rows, page, limit });
  } catch (err) {
    logger.error('getMessages error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── POST /chat/messages ───────────────────────────────────────────────────────
async function sendMessage(req, res) {
  try {
    const { sub: senderId, school_id: schoolId, role: senderRole } = req.user;
    const { thread_id, message_type = 'text', content,
            media_url, media_type, media_size_bytes, original_filename } = req.body;

    if (!thread_id) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'thread_id is required.' });
    }
    if (!content && !media_url) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'content or media_url is required.' });
    }

    // Get thread context from anchor row
    const threadRes = await queryEca(
      `SELECT thread_type, thread_initiator, teacher_id, student_id, parent_id
       FROM   "chatRoom_history"
       WHERE  thread_id = $1 AND school_id = $2 AND message_type = 'system'
       LIMIT  1`,
      [thread_id, schoolId]
    );
    if (threadRes.rows.length === 0) {
      return res.status(404).json({ error: 'THREAD_NOT_FOUND' });
    }
    const thread = threadRes.rows[0];

    const recipientId = senderRole === 'teacher'
      ? (thread.parent_id || thread.student_id)
      : thread.teacher_id;

    const msgRes = await queryEca(
      `INSERT INTO "chatRoom_history"
         (school_id, thread_id, thread_type, thread_initiator,
          teacher_id, student_id, parent_id,
          sender_id, sender_role, message_type,
          content, media_url, media_type, media_size_bytes, original_filename,
          recipient_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'sent')
       RETURNING *`,
      [schoolId, thread_id, thread.thread_type, thread.thread_initiator,
       thread.teacher_id, thread.student_id, thread.parent_id,
       senderId, senderRole, message_type,
       content ?? null, media_url ?? null, media_type ?? null,
       media_size_bytes ?? null, original_filename ?? null,
       recipientId]
    );
    const message = msgRes.rows[0];

    setImmediate(async () => {
      try {
        await publishFirebaseEvent(schoolId, thread_id, message.id);
        await sendPushNotification(recipientId, schoolId, {
          title: 'New message',
          body:  content ? content.slice(0, 80) : `[${message_type}]`,
          data:  { thread_id, message_id: message.id },
        });
      } catch (e) {
        logger.error('Post-send async error:', e);
      }
    });

    res.status(201).json({ data: message });
  } catch (err) {
    logger.error('sendMessage error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── PUT /chat/messages/:messageId ─────────────────────────────────────────────
async function editMessage(req, res) {
  try {
    const { sub: userId, school_id: schoolId } = req.user;
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'content is required.' });
    }

    const msgRes = await queryEca(
      `SELECT * FROM "chatRoom_history" WHERE id = $1 AND school_id = $2 AND sender_id = $3`,
      [messageId, schoolId, userId]
    );
    if (msgRes.rows.length === 0) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const msg = msgRes.rows[0];
    if ((Date.now() - new Date(msg.sent_at).getTime()) / 60000 > 5) {
      return res.status(422).json({
        error: 'EDIT_WINDOW_EXPIRED',
        message: 'Messages can only be edited within 5 minutes of sending.',
      });
    }
    if (msg.message_type !== 'text') {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Only text messages can be edited.' });
    }

    const updated = await queryEca(
      `UPDATE "chatRoom_history"
       SET content = $1, is_edited = TRUE, edited_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [content.trim(), messageId]
    );

    res.json({ data: updated.rows[0] });
  } catch (err) {
    logger.error('editMessage error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── PUT /chat/messages/:messageId/read ────────────────────────────────────────
async function markSeen(req, res) {
  try {
    const { sub: userId, school_id: schoolId } = req.user;
    const { messageId } = req.params;

    await queryEca(
      `UPDATE "chatRoom_history"
       SET status = 'seen', seen_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND recipient_id = $2 AND school_id = $3`,
      [messageId, userId, schoolId]
    );

    res.json({ success: true });
  } catch (err) {
    logger.error('markSeen error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── POST /chat/broadcast ──────────────────────────────────────────────────────
async function sendBroadcast(req, res) {
  try {
    const { sub: teacherId, school_id: schoolId } = req.user;
    const { class_ids, message_type = 'text', content } = req.body;

    if (!class_ids?.length) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'class_ids array is required.' });
    }
    if (!content && message_type === 'text') {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'content is required for text broadcasts.' });
    }

    const ctx = await getUserContext(teacherId, schoolId, req.headers.authorization?.slice(7));

    // Collect student→parent pairs for target classes
    const targets = [];
    for (const cls of (ctx.classes || [])) {
      if (class_ids.includes(cls.class_id || cls.section_id)) {
        for (const student of (cls.students || [])) {
          if (student.parent_user_id) {
            targets.push({ studentId: student.student_id, parentId: student.parent_user_id });
          }
        }
      }
    }

    const broadcastId  = uuidv4();
    const sectionIds   = JSON.stringify(class_ids);
    let   sent         = 0;

    for (const { studentId, parentId } of targets) {
      try {
        const threadId = buildThreadId({
          schoolId, teacherId, studentId, initiator: 'parent', parentId,
        });

        // Ensure thread anchor exists
        await queryEca(
          `INSERT INTO "chatRoom_history"
             (school_id, thread_id, thread_type, thread_initiator,
              teacher_id, student_id, parent_id,
              sender_id, sender_role, message_type, content)
           VALUES ($1,$2,'broadcast','parent',$3,$4,$5,$3,'teacher','system','__thread_created__')
           ON CONFLICT (thread_id) WHERE message_type = 'system' DO NOTHING`,
          [schoolId, threadId, teacherId, studentId, parentId]
        );

        // Insert broadcast message for this recipient
        await queryEca(
          `INSERT INTO "chatRoom_history"
             (school_id, thread_id, thread_type, thread_initiator,
              teacher_id, student_id, parent_id,
              sender_id, sender_role, message_type, content,
              is_broadcast, broadcast_id, section_ids, total_recipients,
              recipient_id, status)
           VALUES ($1,$2,'broadcast','parent',$3,$4,$5,
                  $3,'teacher',$6,$7,
                  TRUE,$8,$9,$10,
                  $5,'sent')`,
          [schoolId, threadId, teacherId, studentId, parentId,
           message_type, content ?? null,
           broadcastId, sectionIds, targets.length]
        );

        await sendPushNotification(parentId, schoolId, {
          title: '📢 Class Announcement',
          body:  content ? content.slice(0, 80) : '[Broadcast]',
          data:  { broadcast_id: broadcastId },
        });
        sent++;
      } catch (e) {
        logger.error(`Broadcast delivery failed for parent ${parentId}:`, e);
      }
    }

    res.status(202).json({
      data: { broadcast_id: broadcastId, total_parents: targets.length, sent },
      message: 'Broadcast sent.',
    });
  } catch (err) {
    logger.error('sendBroadcast error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── GET /chat/broadcast/:broadcastId ─────────────────────────────────────────
async function getBroadcast(req, res) {
  try {
    const { school_id: schoolId } = req.user;
    const result = await queryEca(
      `SELECT broadcast_id, section_ids, total_recipients, content,
              COUNT(*)::int AS sent_count, MIN(sent_at) AS sent_at
       FROM   "chatRoom_history"
       WHERE  broadcast_id = $1 AND school_id = $2 AND is_broadcast = TRUE
       GROUP  BY broadcast_id, section_ids, total_recipients, content
       LIMIT  1`,
      [req.params.broadcastId, schoolId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── GET /chat/search ──────────────────────────────────────────────────────────
async function search(req, res) {
  try {
    const { sub: userId, school_id: schoolId } = req.user;
    const { q, scope, thread_id } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Query must be at least 2 characters.' });
    }

    let sql, params;
    if (scope === 'global' || !thread_id) {
      sql = `SELECT * FROM "chatRoom_history"
             WHERE  school_id = $1
               AND  (teacher_id = $2 OR parent_id = $2 OR student_id = $2)
               AND  message_type != 'system' AND is_deleted = FALSE
               AND  to_tsvector('english', COALESCE(content,'')) @@ plainto_tsquery('english', $3)
             ORDER  BY sent_at DESC LIMIT 50`;
      params = [schoolId, userId, q.trim()];
    } else {
      sql = `SELECT * FROM "chatRoom_history"
             WHERE  thread_id = $1 AND school_id = $2
               AND  (teacher_id = $3 OR parent_id = $3 OR student_id = $3)
               AND  message_type != 'system' AND is_deleted = FALSE
               AND  to_tsvector('english', COALESCE(content,'')) @@ plainto_tsquery('english', $4)
             ORDER  BY sent_at DESC LIMIT 50`;
      params = [thread_id, schoolId, userId, q.trim()];
    }

    const result = await queryEca(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    logger.error('search error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── GET /chat/me ──────────────────────────────────────────────────────────────
async function getMe(req, res) {
  try {
    const { sub: userId, school_id: schoolId } = req.user;
    const ctx = await getUserContext(userId, schoolId, req.headers.authorization?.slice(7));
    res.json({ data: ctx });
  } catch (err) {
    logger.error('getMe error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── GET /chat/children ────────────────────────────────────────────────────────
async function getChildren(req, res) {
  try {
    const { sub: userId, school_id: schoolId } = req.user;
    const ctx = await getUserContext(userId, schoolId, req.headers.authorization?.slice(7));
    res.json({ data: ctx.children || [] });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── GET /chat/teachers (for a parent's child) ─────────────────────────────────
async function getTeachersForChild(req, res) {
  try {
    const { sub: userId, school_id: schoolId } = req.user;
    const { student_id } = req.query;
    const ctx = await getUserContext(userId, schoolId, req.headers.authorization?.slice(7));
    const child = (ctx.children || []).find(c => c.student_id === student_id);
    res.json({ data: child ? child.teachers : [] });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── GET /chat/student/teachers ────────────────────────────────────────────────
async function getStudentTeachers(req, res) {
  try {
    const { sub: userId, school_id: schoolId } = req.user;
    const ctx = await getUserContext(userId, schoolId, req.headers.authorization?.slice(7));
    res.json({ data: ctx.teachers || [] });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── GET /chat/unread-count ────────────────────────────────────────────────────
async function getUnreadCount(req, res) {
  try {
    const { sub: userId, school_id: schoolId } = req.user;
    const result = await queryEca(
      `SELECT COUNT(*)::int AS total
       FROM   "chatRoom_history"
       WHERE  recipient_id = $1 AND school_id = $2
              AND status != 'seen' AND is_deleted = FALSE AND message_type != 'system'`,
      [userId, schoolId]
    );
    res.json({ data: { unread_count: result.rows[0].total } });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ── PUT /chat/threads/:threadId/mute ─────────────────────────────────────────
async function muteThread(_req, res) { res.json({ success: true }); }

// ── PUT /chat/settings/mute-all ───────────────────────────────────────────────
async function muteAll(_req, res) { res.json({ success: true }); }

module.exports = {
  getMe,
  getThreads, createThread, getMessages, sendMessage,
  editMessage, markSeen, sendBroadcast, getBroadcast,
  search, muteThread, muteAll, getChildren,
  getTeachersForChild, getStudentTeachers, getUnreadCount,
};
