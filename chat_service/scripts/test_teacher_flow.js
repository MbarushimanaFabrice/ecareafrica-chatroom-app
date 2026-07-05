require('dotenv').config();
const http = require('http');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const PHONE = '+250781000001';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
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

async function run() {
  console.log('1. POST /auth/login');
  const login = await post('/auth/login', { phone: PHONE, password: 'Test@1234' });
  console.log('   Status:', login.status, '|', login.body.message || JSON.stringify(login.body));

  await new Promise(r => setTimeout(r, 500));

  const log = fs.readFileSync('C:\\Users\\TOPONE~1\\AppData\\Local\\Temp\\server.log', 'utf8');
  const matches = log.match(/\[DEV\] OTP for \+250781000001: (\d+)/g);
  const otp = matches ? matches[matches.length - 1].match(/(\d{6})$/)[1] : null;
  console.log('   OTP from server log:', otp);
  if (!otp) { console.error('Could not read OTP'); return; }

  console.log('\n2. POST /auth/verify-otp');
  const verify = await post('/auth/verify-otp', { phone: PHONE, otp });
  console.log('   Status:', verify.status);
  const token = verify.body.token;
  console.log('   Token:', token ? token.substring(0, 50) + '...' : 'MISSING');
  if (!token) { console.log('   Full body:', JSON.stringify(verify.body, null, 2)); return; }

  console.log('\n3. GET /chat/me');
  const me = await get('/chat/me', token);
  console.log('   Status:', me.status);
  console.log('   Full body:\n', JSON.stringify(me.body, null, 2));
}

run().catch(console.error);
