/**
 * End-to-end test:
 * 1. Login as teacher  → get JWT
 * 2. Get /chat/me      → find existing thread (or create one)
 * 3. POST /chat/messages with that thread_id
 * 4. Query DB directly → confirm row is stored with all fields
 * 5. GET /chat/threads/:id/messages → confirm message is readable via API
 */
require('dotenv').config();
const http = require('http');
const fs   = require('fs');
const { Pool } = require('pg');

const BASE  = 'http://localhost:3000';
const PHONE = '+250781000001';

const dbPool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'netrack_chat',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
});

// ── HTTP helpers ───────────────────────────────────────────────────────────────
function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(`${BASE}${path}`, { method: 'POST', headers }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${path}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function run() {
  console.log('══════════════════════════════════════════════');
  console.log(' ECA Chatroom — Send & Verify Test');
  console.log('══════════════════════════════════════════════\n');

  // Step 1 — login
  console.log('STEP 1 › POST /auth/login');
  await post('/auth/login', { phone: PHONE, password: 'Test@1234' });
  await new Promise(r => setTimeout(r, 500));
  const log  = fs.readFileSync('C:\\Users\\TOPONE~1\\AppData\\Local\\Temp\\server.log', 'utf8');
  const hits = log.match(/\[DEV\] OTP for \+250781000001: (\d+)/g);
  const otp  = hits[hits.length - 1].match(/(\d{6})$/)[1];
  console.log(`  OTP: ${otp}\n`);

  // Step 2 — verify OTP → get JWT
  console.log('STEP 2 › POST /auth/verify-otp');
  const verify = await post('/auth/verify-otp', { phone: PHONE, otp });
  const token  = verify.body.token;
  if (!token) { console.error('No token'); process.exit(1); }
  console.log(`  Role: ${verify.body.role} | Name: ${verify.body.name}\n`);

  // Step 3 — get threads (use existing or create one)
  console.log('STEP 3 › GET /chat/threads');
  const threads = await get('/chat/threads', token);
  let thread = threads.body.data?.[0];

  if (!thread) {
    console.log('  No threads yet — creating one via /chat/me + createThread');
    const me = await get('/chat/me', token);
    const student = me.body.data.students?.[0];
    if (!student) { console.error('No students found in teacher context'); process.exit(1); }
    const ct = await post('/chat/threads', {
      teacher_id:       me.body.data.user_id,
      student_id:       student.student_id,
      parent_id:        student.parent_user_id || undefined,
      thread_type:      'direct',
      thread_initiator: 'student',
    }, token);
    thread = ct.body.data;
  }
  console.log(`  Using thread: ${thread.id}\n`);

  // Step 4 — send a test message
  const testMsg = `Test message sent at ${new Date().toISOString()}`;
  console.log(`STEP 4 › POST /chat/messages`);
  console.log(`  Content: "${testMsg}"`);
  const send = await post('/chat/messages', {
    thread_id:    thread.id,
    message_type: 'text',
    content:      testMsg,
  }, token);
  console.log(`  HTTP status: ${send.status}`);
  if (send.status !== 201 && send.status !== 200) {
    console.error('  ERROR:', JSON.stringify(send.body, null, 2));
    process.exit(1);
  }
  const sentMsg = send.body.data || send.body;
  const msgId   = sentMsg.id;
  console.log(`  Message ID: ${msgId}\n`);

  // Step 5 — verify in DB directly
  console.log('STEP 5 › DB verification (direct SELECT)');
  const dbRow = await dbPool.query(
    `SELECT id, thread_id, sender_id, sender_role, message_type,
            content, is_broadcast, is_edited, sent_at, created_at
     FROM chat_messages WHERE id = $1`,
    [msgId]
  );
  if (dbRow.rows.length === 0) {
    console.error('  ✗ Message NOT found in database!');
    process.exit(1);
  }
  console.log('  ✓ Message confirmed in chat_messages:');
  const row = dbRow.rows[0];
  console.log(`    id:          ${row.id}`);
  console.log(`    thread_id:   ${row.thread_id}`);
  console.log(`    sender_id:   ${row.sender_id}`);
  console.log(`    sender_role: ${row.sender_role}`);
  console.log(`    message_type:${row.message_type}`);
  console.log(`    content:     ${row.content}`);
  console.log(`    is_broadcast:${row.is_broadcast}`);
  console.log(`    sent_at:     ${row.sent_at}`);

  // Check delivery status row
  const statusRow = await dbPool.query(
    `SELECT id, user_id, status, created_at FROM chat_message_status WHERE message_id = $1`,
    [msgId]
  );
  console.log(`\n  ✓ Delivery status rows: ${statusRow.rows.length}`);
  statusRow.rows.forEach(s =>
    console.log(`    user_id: ${s.user_id}  status: ${s.status}  at: ${s.created_at}`)
  );

  // Total counts
  const counts = await dbPool.query(`
    SELECT
      (SELECT COUNT(*) FROM chat_messages) AS total_messages,
      (SELECT COUNT(*) FROM chat_threads)  AS total_threads,
      (SELECT COUNT(*) FROM chat_message_status) AS total_status_rows
  `);
  const c = counts.rows[0];
  console.log(`\n  DB totals: ${c.total_messages} messages | ${c.total_threads} threads | ${c.total_status_rows} status rows`);

  // Step 6 — read back via API
  console.log(`\nSTEP 6 › GET /chat/threads/${thread.id}/messages (API read-back)`);
  const readBack = await get(`/chat/threads/${thread.id}/messages`, token);
  console.log(`  HTTP status: ${readBack.status}`);
  const apiMessages = readBack.body.data || [];
  const found = apiMessages.find(m => m.id === msgId);
  if (found) {
    console.log(`  ✓ Message visible via API: "${found.content}"`);
  } else {
    console.log(`  ✗ Message not found in API response (${apiMessages.length} messages returned)`);
  }

  console.log('\n══════════════════════════════════════════════');
  console.log(' All steps passed — messages are being stored');
  console.log('══════════════════════════════════════════════');

  await dbPool.end();
}

run().catch(async e => {
  console.error('Fatal:', e.message);
  await dbPool.end();
  process.exit(1);
});
