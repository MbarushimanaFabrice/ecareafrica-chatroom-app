/**
 * Creates the chatroom schema inside ECareAfrica_db.
 * Run once:  node src/db/migrate.js
 *
 * ONE table  →  chatRoom_history   (all messages, threads, delivery status,
 *                                   broadcast info, SMS audit)
 * TWO helper →  chatroom_active_status  (online/offline heartbeat)
 *               chatroom_device_tokens  (FCM push-notification tokens)
 *
 * No existing ECareAfrica_db tables are altered.
 */
require('dotenv').config();
const { pool, connectEcafrica } = require('./ecafrica_pool');
const { logger } = require('../utils/logger');

const migrations = [

  // ─── 1. chatRoom_history ─────────────────────────────────────────────────────
  // One row = one message event.
  // Thread context (who/what conversation) is stored on every row so
  // the full history can be read from this table alone — no JOINs needed.
  `CREATE TABLE IF NOT EXISTS "chatRoom_history" (

    -- Identity
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Multi-tenancy
    school_id         UUID         NOT NULL,

    -- Thread / conversation
    -- thread_id groups all messages in the same conversation.
    -- Computed deterministically from participants — same two parties
    -- always share the same thread_id (no duplicate threads).
    thread_id         UUID         NOT NULL,
    thread_type       VARCHAR(20)  NOT NULL DEFAULT 'direct'
                      CHECK (thread_type IN ('direct','broadcast')),
    thread_initiator  VARCHAR(20)  NOT NULL
                      CHECK (thread_initiator IN ('parent','student')),
    teacher_id        UUID         NOT NULL,
    student_id        UUID         NOT NULL,
    parent_id         UUID,

    -- Sender
    sender_id         UUID         NOT NULL,
    sender_role       VARCHAR(20)  NOT NULL
                      CHECK (sender_role IN ('teacher','parent','student')),

    -- Message content
    message_type      VARCHAR(20)  NOT NULL DEFAULT 'text'
                      CHECK (message_type IN ('text','image','document','voice','system')),
    content           TEXT,
    media_url         TEXT,
    media_type        VARCHAR(100),
    media_size_bytes  BIGINT,
    original_filename VARCHAR(255),

    -- Broadcast metadata
    is_broadcast      BOOLEAN      NOT NULL DEFAULT FALSE,
    broadcast_id      UUID,
    section_ids       JSONB        DEFAULT '[]',
    total_recipients  INTEGER      DEFAULT 0,

    -- Edit / delete lifecycle
    is_edited         BOOLEAN      NOT NULL DEFAULT FALSE,
    edited_at         TIMESTAMPTZ,
    is_deleted        BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_at        TIMESTAMPTZ,

    -- Delivery & read receipt (per recipient)
    recipient_id      UUID,
    status            VARCHAR(20)  NOT NULL DEFAULT 'sent'
                      CHECK (status IN ('sent','delivered','seen')),
    delivered_at      TIMESTAMPTZ,
    seen_at           TIMESTAMPTZ,

    -- SMS fallback audit
    sms_status        VARCHAR(20)  DEFAULT NULL
                      CHECK (sms_status IN (NULL,'pending','sent','delivered','failed')),
    sms_sent_at       TIMESTAMPTZ,
    sms_provider_ref  TEXT,

    -- Audit timestamps
    sent_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Every real message must have content or a media file;
    -- system messages (type='system') are exempt.
    CONSTRAINT chk_content_or_media CHECK (
      content IS NOT NULL
      OR media_url IS NOT NULL
      OR message_type = 'system'
    )
  )`,

  // Primary read path: all messages in a thread, newest first
  `CREATE INDEX IF NOT EXISTS idx_crh_thread_sent
     ON "chatRoom_history" (thread_id, sent_at DESC)`,

  // Thread list per teacher (most common query — teacher home screen)
  `CREATE INDEX IF NOT EXISTS idx_crh_teacher_school
     ON "chatRoom_history" (teacher_id, school_id, sent_at DESC)`,

  // Thread list per parent
  `CREATE INDEX IF NOT EXISTS idx_crh_parent_school
     ON "chatRoom_history" (parent_id, school_id, sent_at DESC)`,

  // Thread list per student
  `CREATE INDEX IF NOT EXISTS idx_crh_student_school
     ON "chatRoom_history" (student_id, school_id, sent_at DESC)`,

  // Unread count: received messages not yet seen
  `CREATE INDEX IF NOT EXISTS idx_crh_recipient_status
     ON "chatRoom_history" (recipient_id, status)
     WHERE is_deleted = FALSE AND message_type != 'system'`,

  // School-level reporting / compliance queries
  `CREATE INDEX IF NOT EXISTS idx_crh_school
     ON "chatRoom_history" (school_id, sent_at DESC)`,

  // Full-text search on message content
  `CREATE INDEX IF NOT EXISTS idx_crh_fts
     ON "chatRoom_history"
     USING GIN (to_tsvector('english', COALESCE(content, '')))`,

  // Ensures only one system/anchor row per thread (idempotent thread creation)
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_crh_thread_anchor
     ON "chatRoom_history" (thread_id)
     WHERE message_type = 'system'`,

  // ─── 2. chatroom_active_status ────────────────────────────────────────────────
  // Online/offline presence — one row per user, upserted on heartbeat.
  `CREATE TABLE IF NOT EXISTS chatroom_active_status (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL UNIQUE,
    school_id    UUID        NOT NULL,
    is_online    BOOLEAN     NOT NULL DEFAULT FALSE,
    last_seen_at TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_cas_user
     ON chatroom_active_status (user_id)`,

  // ─── 3. chatroom_device_tokens ────────────────────────────────────────────────
  // FCM / APNs tokens for push notifications.
  `CREATE TABLE IF NOT EXISTS chatroom_device_tokens (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL,
    school_id       UUID        NOT NULL,
    user_role       VARCHAR(20) NOT NULL
                    CHECK (user_role IN ('teacher','parent','student')),
    device_token    TEXT        NOT NULL,
    device_platform VARCHAR(10) NOT NULL
                    CHECK (device_platform IN ('android','ios')),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, device_token)
  )`,
];

async function migrate() {
  await connectEcafrica();
  const client = await pool.connect();
  try {
    logger.info('Running migrations on ECareAfrica_db…');
    for (const sql of migrations) {
      await client.query(sql);
    }
    logger.info(`✅ ${migrations.length} statements applied.`);
    logger.info('   Tables: chatRoom_history, chatroom_active_status, chatroom_device_tokens');
  } catch (err) {
    logger.error('Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
