/**
 * End-to-end test: login (OTP flow) → create thread → send message → verify in chatRoom_history
 */
require('dotenv').config();
const http = require('http');
const fs   = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../logs/combined.log');

function post(urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: 'localhost', port: 3000,
      path: urlPath, method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(urlPath, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 3000,
      path: urlPath, method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function extractOtpFromLog(phone) {
  // OTP is logged as: [DEV] OTP for <phone>: <6 digits>
  const logContent = fs.readFileSync(LOG_FILE, 'utf8');
  const lines = logContent.split('\n').reverse();
  for (const line of lines) {
    const match = line.match(new RegExp(`\\[DEV\\] OTP for ${phone.replace('+', '\\+')}: (\\d{6})`));
    if (match) return match[1];
  }
  return null;
}

const { Pool } = require('pg');
const pool = new Pool({
  host:     process.env.ECAFRICA_DB_HOST || 'localhost',
  port:     process.env.ECAFRICA_DB_PORT || 5432,
  database: process.env.ECAFRICA_DB_NAME || 'ECareAfrica_db',
  user:     process.env.ECAFRICA_DB_USER || 'postgres',
  password: process.env.ECAFRICA_DB_PASSWORD,
});

const PHONE = '+250781000001';

async function run() {
  console.log('\n═══ chatRoom_history end-to-end test ═══\n');

  // 1. Trigger OTP login
  console.log('1. Requesting OTP for teacher…');
  const loginRes = await post('/auth/login', { phone: PHONE, password: 'Test@1234' });
  if (loginRes.status !== 200) {
    console.error('   ✗ Login failed:', JSON.stringify(loginRes.body));
    process.exit(1);
  }
  console.log('   ✓', loginRes.body.message);

  // 2. Read OTP from dev log
  await new Promise(r => setTimeout(r, 300));
  const otp = extractOtpFromLog(PHONE);
  if (!otp) {
    console.error('   ✗ Could not find OTP in combined.log');
    process.exit(1);
  }
  console.log(`   ✓ OTP captured: ${otp}`);

  // 3. Verify OTP → get token
  console.log('2. Verifying OTP…');
  const verifyRes = await post('/auth/verify-otp', { phone: PHONE, otp });
  if (verifyRes.status !== 200 || !verifyRes.body.token) {
    console.error('   ✗ verify-otp failed:', JSON.stringify(verifyRes.body));
    process.exit(1);
  }
  const token = verifyRes.body.token;
  console.log(`   ✓ Token obtained (role: ${verifyRes.body.role}, name: ${verifyRes.body.name})`);

  // 4. Get teacher context
  console.log('3. Fetching teacher context…');
  const meRes = await get('/chat/me', token);
  if (meRes.status !== 200) {
    console.error('   ✗ /chat/me failed:', JSON.stringify(meRes.body));
    process.exit(1);
  }
  const ctx = meRes.body.data;
  console.log(`   ✓ Teacher: ${ctx.full_name} | students: ${ctx.students?.length ?? 0}`);

  const student = ctx.students?.[0];
  if (!student) {
    console.error('   ✗ No students found in teacher context');
    process.exit(1);
  }
  console.log(`   ✓ Using student: ${student.full_name} (${student.student_id})`);

  const teacherId = ctx.user_id;
  const studentId = student.student_id;
  const parentId  = student.parent_user_id || null;

  // 5. Create (or reuse) thread
  console.log('4. Creating thread…');
  const threadRes = await post('/chat/threads', {
    teacher_id:       teacherId,
    student_id:       studentId,
    parent_id:        parentId,
    thread_initiator: parentId ? 'parent' : 'student',
    thread_type:      'direct',
  }, token);
  if (threadRes.status !== 200) {
    console.error('   ✗ createThread failed:', JSON.stringify(threadRes.body));
    process.exit(1);
  }
  const threadId = threadRes.body.data?.thread_id || threadRes.body.data?.id;
  console.log(`   ✓ thread_id = ${threadId}`);

  // 6. Send a message
  const msgText = `Hello from test at ${new Date().toISOString()}`;
  console.log('5. Sending message…');
  const sendRes = await post('/chat/messages', {
    thread_id:    threadId,
    message_type: 'text',
    content:      msgText,
  }, token);
  if (sendRes.status !== 201) {
    console.error('   ✗ sendMessage failed:', JSON.stringify(sendRes.body));
    process.exit(1);
  }
  const messageId = sendRes.body.data?.id;
  console.log(`   ✓ message_id = ${messageId}`);

  // 7. Verify in DB
  console.log('6. Verifying message in chatRoom_history…');
  const dbRes = await pool.query(
    `SELECT id, thread_id, sender_role, message_type, content, status, sent_at
     FROM   "chatRoom_history"
     WHERE  id = $1`,
    [messageId]
  );
  if (dbRes.rows.length === 0) {
    console.error('   ✗ Message NOT found in chatRoom_history!');
    process.exit(1);
  }
  const row = dbRes.rows[0];
  console.log('   ✓ Message confirmed in chatRoom_history:');
  console.log(`     id          : ${row.id}`);
  console.log(`     thread_id   : ${row.thread_id}`);
  console.log(`     sender_role : ${row.sender_role}`);
  console.log(`     type        : ${row.message_type}`);
  console.log(`     content     : ${row.content}`);
  console.log(`     status      : ${row.status}`);
  console.log(`     sent_at     : ${row.sent_at}`);

  // 8. Thread list check
  console.log('7. Checking thread list…');
  const threadsRes = await get('/chat/threads', token);
  if (threadsRes.status !== 200) {
    console.error('   ✗ getThreads failed:', JSON.stringify(threadsRes.body));
    process.exit(1);
  }
  const threads = threadsRes.body.data || [];
  const ourThread = threads.find(t => t.thread_id === threadId || t.id === threadId);
  if (!ourThread) {
    console.error(`   ✗ Thread ${threadId} not found in list`);
    process.exit(1);
  }
  console.log(`   ✓ Thread in list: last_preview = "${ourThread.last_message_preview}"`);

  // 9. Total row count
  const countRes = await pool.query(`SELECT COUNT(*) FROM "chatRoom_history"`);
  console.log(`\n   📊 Total rows in chatRoom_history: ${countRes.rows[0].count}`);

  console.log('\n✅ All checks passed — chatRoom_history is working correctly.\n');
  await pool.end();
}

run().catch(err => {
  console.error('\nTest error:', err.message);
  pool.end();
  process.exit(1);
});
