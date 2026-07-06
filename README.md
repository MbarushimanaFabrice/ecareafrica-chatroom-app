# ECareAfrica Chatroom
### Parent · Teacher · Student Communication Module

> **Status:** Active Development  
> **Database:** ECareAfrica_db (single PostgreSQL database — no separate chat DB)  
> **Architecture:** Flutter package + Node.js/Express REST API

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Folder Structure](#3-folder-structure)
4. [Color System & Design](#4-color-system--design)
5. [Flutter Package — Setup](#5-flutter-package--setup)
6. [Node.js Backend — Server Configuration](#6-nodejs-backend--server-configuration)
7. [Database Setup](#7-database-setup)
8. [Firebase Setup](#8-firebase-setup)
9. [Running the System](#9-running-the-system)
10. [API Reference](#10-api-reference)
11. [Database Schema](#11-database-schema)
12. [Feature Checklist](#12-feature-checklist)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Project Overview

The ECareAfrica Chatroom is a **fully independent feature module** that adds real-time parent–teacher–student messaging, built on top of the existing `ECareAfrica_db` PostgreSQL database.

| What | Detail |
|------|--------|
| Flutter package | `chatroom_package` — self-contained; host app passes a JWT |
| Backend | Node.js REST API (Express) — `chat_service/` — port 3000 |
| Database | **ECareAfrica_db** — shared with the main system; chatroom adds **1 table** (`chatRoom_history`) |
| Real-time | Firebase Realtime Database (event signals only — no message content stored) |
| Push | Firebase Cloud Messaging (FCM) |
| SMS | OTP delivery via configured SMS gateway |
| Auth | Teacher: phone + password → OTP → JWT / Parent: phone only → OTP → JWT |

### Who uses it

| Role | Login flow | What they can do |
|------|-----------|-----------------|
| **Teacher** | Phone + password → OTP SMS → JWT | View threads, chat with parents/students, broadcast to class, roll-number search |
| **Parent** | Phone only → OTP SMS → JWT (no password required) | Select child, chat with child's teachers, receive broadcasts |
| **Student** | Roll number → OTP to parent's phone → JWT | Chat with their enrolled subject teachers only |

---

## 2. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     Flutter Mobile App                           │
│                                                                  │
│   ┌───────────────────────────────────────────────────────────┐  │
│   │              chatroom_package                             │  │
│   │  Splash → Login → Teacher/Parent/Student screens          │  │
│   │  ThreadsProvider │ MessagesProvider │ PresenceService     │  │
│   └──────────────┬─────────────────────────────┬──────────────┘  │
│                  │ REST API calls              │ Firebase events  │
└──────────────────┼─────────────────────────────┼─────────────────┘
                   │                             │
                   ▼                             ▼
┌────────────────────────────┐   ┌────────────────────────────────┐
│  chat_service (Node.js)    │   │  Firebase Realtime Database    │
│  Port 3000                 │   │  /schools/{id}/threads/{id}    │
│                            │   │  /schools/{id}/presence/{id}   │
│  JWT Auth middleware        │   └────────────────────────────────┘
│  chat.controller.js         │
│  auth.controller.js         │   ┌────────────────────────────────┐
│  status.controller.js       │   │  Firebase Cloud Messaging      │
│  notification.service.js    │   │  Push notifications            │
│  user_context.service.js    │   └────────────────────────────────┘
│             │               │
│             ▼               │   ┌────────────────────────────────┐
│   ECareAfrica_db             │──▶│  SMS Gateway                   │
│   (PostgreSQL)               │   │  OTP delivery                  │
│   chatRoom_history (1 table) │   └────────────────────────────────┘
└────────────────────────────┘
```

**Key principle:** Firebase carries only a `message_id` signal. All message content lives exclusively in `chatRoom_history`. The chat service reads user/student/parent data directly from ECareAfrica_db — no separate API bridge needed.

---

## 3. Folder Structure

```
ChatRoom/
│
├── chatroom_package/              ← Flutter package (the deliverable)
│   ├── lib/
│   │   ├── chatroom.dart          ← Public API exports
│   │   └── src/
│   │       ├── theme/             ← AppColors, AppTheme
│   │       ├── models/            ← UserContext, ChatThread, ChatMessage
│   │       ├── services/          ← ApiService, AuthService, PresenceService
│   │       ├── providers/         ← ThreadsProvider, MessagesProvider
│   │       ├── screens/
│   │       │   ├── splash_screen.dart          ← ECareAfrica branding + animation
│   │       │   ├── login_screen.dart           ← Entry: "Who are you?" selector
│   │       │   ├── chat_thread_screen.dart     ← Message view (all roles)
│   │       │   ├── auth/
│   │       │   │   ├── teacher_parent_login_screen.dart  ← Teacher/Parent toggle; teacher: phone+password, parent: phone only
│   │       │   │   └── teacher_parent_otp_screen.dart    ← Shared 6-digit OTP entry (teacher + parent)
│   │       │   ├── parent/
│   │       │   │   ├── child_selection_screen.dart
│   │       │   │   ├── parent_home_screen.dart
│   │       │   │   └── teacher_list_screen.dart
│   │       │   ├── teacher/
│   │       │   │   ├── teacher_home_screen.dart
│   │       │   │   ├── contact_picker_screen.dart
│   │       │   │   ├── broadcast_screen.dart
│   │       │   │   └── roll_number_search_screen.dart
│   │       │   └── student/
│   │       │       ├── student_login_screen.dart   ← Roll number entry (back arrow)
│   │       │       ├── student_otp_screen.dart     ← 6-digit OTP input
│   │       │       └── student_home_screen.dart
│   │       └── widgets/
│   │           ├── common/        ← ThreadListTile, EmptyState, etc.
│   │           └── message/       ← MessageBubble, MessageInputBar, TypingIndicator
│   └── pubspec.yaml
│
├── chat_service/                  ← Node.js REST API
│   ├── src/
│   │   ├── server.js              ← Express bootstrap, connects to ECareAfrica_db
│   │   ├── db/
│   │   │   ├── ecafrica_pool.js   ← Single PostgreSQL pool for ECareAfrica_db
│   │   │   └── migrate.js         ← Creates chatRoom_history (1 table only)
│   │   ├── middleware/
│   │   │   └── auth.middleware.js ← JWT validation, requireRole guard
│   │   ├── routes/
│   │   │   ├── auth.routes.js     ← /auth/*
│   │   │   ├── chat.routes.js     ← /chat/*
│   │   │   └── student.routes.js  ← /students/*
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── chat.controller.js
│   │   │   ├── status.controller.js
│   │   │   └── student.controller.js
│   │   └── services/
│   │       ├── firebase.service.js
│   │       ├── notification.service.js  ← FCM via chatroom_device_tokens
│   │       ├── sms.service.js
│   │       └── user_context.service.js  ← Queries ECareAfrica_db directly
│   ├── scripts/
│   │   ├── seed-ecafrica.js            ← Seeds test teacher + parent + students
│   │   └── test_chat_history.js        ← End-to-end API + DB test
│   ├── logs/
│   │   ├── combined.log
│   │   └── error.log
│   ├── .env                       ← Local config (never commit)
│   ├── .env.example               ← Template — copy to .env
│   └── package.json
│
├── test_shell/                    ← Throwaway Flutter app for development
│   ├── lib/
│   │   ├── main.dart              ← Role picker, launches chatroom
│   │   └── firebase_options.dart  ← Replace with your Firebase config
│   └── pubspec.yaml
│
└── README.md
```

---

## 4. Color System & Design

All colors are extracted from the **ECareAfrica logo**.

| Token | Hex | Usage |
|-------|-----|-------|
| `primaryDark` | `#1A237E` | AppBar, headers, primary text |
| `primary` | `#1565C0` | Buttons, sent bubbles, active states |
| `primaryLight` | `#2196F3` | Accents, online indicators |
| `accent` | `#F9A825` | FAB, unread badges, broadcast labels |
| `success` | `#388E3C` | Online presence dot |
| `background` | `#F5F7FA` | Screen backgrounds |
| `surface` | `#FFFFFF` | Cards, received bubbles |

**Design notes:**
- `withValues(alpha: x)` used everywhere — `withOpacity` is deprecated in Flutter 3.x
- Material 3 (`useMaterial3: true`)
- `flutter_animate` for entrance animations (fadeIn, slideX, scale)
- Shimmer skeleton loaders on all lists
- `SafeArea` + `MediaQuery` adaptive padding on all screens
- All interactive elements ≥ 48×48dp touch target

---

## 5. Flutter Package — Setup

### Prerequisites
- Flutter SDK ≥ 3.10.0
- Android emulator (API 24+) or physical device

### Install dependencies

```bash
cd chatroom_package
flutter pub get

cd ../test_shell
flutter pub get
```

### Add to your app's pubspec.yaml

```yaml
dependencies:
  ecafrica_chatroom:
    path: ../chatroom_package   # local during development
```

### Initialize in main.dart

```dart
import 'package:ecafrica_chatroom/chatroom.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await ChatroomService.initialize(
    apiBaseUrl: 'http://10.0.2.2:3000',  // Android emulator → localhost
    firebaseOptions: DefaultFirebaseOptions.currentPlatform,
  );

  runApp(MyApp());
}
```

### Android — minimum SDK

In `android/app/build.gradle`:
```gradle
android {
    defaultConfig {
        minSdkVersion 24
        targetSdkVersion 34
    }
}
```

---

## 6. Node.js Backend — Server Configuration

### Prerequisites
- Node.js ≥ 18.0.0
- npm ≥ 9.0.0
- PostgreSQL ≥ 14 with ECareAfrica_db already created and seeded

### Step 1 — Install dependencies

```bash
cd chat_service
npm install
```

### Step 2 — Create and configure `.env`

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# ── Node ──────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000

# ── ECareAfrica PostgreSQL (single database) ──────────────────────
ECAFRICA_DB_HOST=localhost
ECAFRICA_DB_PORT=5432
ECAFRICA_DB_NAME=ECareAfrica_db
ECAFRICA_DB_USER=postgres
ECAFRICA_DB_PASSWORD=your_db_password

# ── JWT ───────────────────────────────────────────────────────────
JWT_SECRET=your_very_strong_secret_min_32_chars
JWT_EXPIRES_IN=7d

# ── OTP ───────────────────────────────────────────────────────────
OTP_EXPIRES_MINUTES=10

# ── Firebase ──────────────────────────────────────────────────────
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com

# ── SMS Gateway ───────────────────────────────────────────────────
SMS_GATEWAY_URL=https://your-sms-provider.com/send
SMS_GATEWAY_API_KEY=your_sms_api_key
SMS_SENDER_ID=ECareAfrica

# ── CORS ──────────────────────────────────────────────────────────
ALLOWED_ORIGINS=http://localhost:3000,https://your-production-domain.com
```

### Step 3 — Run database migrations

This creates `chatRoom_history` in ECareAfrica_db. **No existing tables are altered.**

```bash
npm run migrate
# or directly:
node src/db/migrate.js
```

### Step 4 — (Optional) Seed test data

Adds one teacher (`+250781000001 / Test@1234`) and one parent with a linked student:

```bash
node scripts/seed-ecafrica.js
```

### Step 5 — Start the server

```bash
# Development — auto-reload on file changes
npm run dev

# Production
npm start
```

Server starts on `http://localhost:3000`.  
Health check: `GET http://localhost:3000/health`

### Available npm scripts

| Script | What it does |
|--------|-------------|
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm start` | Start without auto-reload (production) |
| `npm run migrate` | Create chatroom tables in ECareAfrica_db |
| `npm test` | Run Jest test suite |

---

## 7. Database Setup

### ECareAfrica_db — table created by migration

The chatroom adds **1 table** to the existing ECareAfrica_db. All other tables (users, students, schools, sections, etc.) are read-only from the chatroom's perspective.

Online presence and FCM device tokens are handled **in memory** — no extra tables needed.

#### `chatRoom_history` — the single chat table

One row = one message event. Thread context is embedded on every row so the full history can be queried from this table alone without joins.

```sql
CREATE TABLE IF NOT EXISTS "chatRoom_history" (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID         NOT NULL,

  -- Thread identity (deterministic UUID v5 from participants)
  thread_id         UUID         NOT NULL,
  thread_type       VARCHAR(20)  NOT NULL DEFAULT 'direct'   -- 'direct' | 'broadcast'
  thread_initiator  VARCHAR(20)  NOT NULL,                   -- 'parent' | 'student'
  teacher_id        UUID         NOT NULL,
  student_id        UUID         NOT NULL,
  parent_id         UUID,                                    -- NULL for student-initiated

  -- Sender
  sender_id         UUID         NOT NULL,
  sender_role       VARCHAR(20)  NOT NULL,                   -- 'teacher'|'parent'|'student'

  -- Content
  message_type      VARCHAR(20)  NOT NULL DEFAULT 'text',    -- 'text'|'image'|'document'|'voice'|'system'
  content           TEXT,
  media_url         TEXT,
  media_type        VARCHAR(100),
  media_size_bytes  BIGINT,
  original_filename VARCHAR(255),

  -- Broadcast
  is_broadcast      BOOLEAN      NOT NULL DEFAULT FALSE,
  broadcast_id      UUID,
  section_ids       JSONB        DEFAULT '[]',
  total_recipients  INTEGER      DEFAULT 0,

  -- Lifecycle
  is_edited         BOOLEAN      NOT NULL DEFAULT FALSE,
  edited_at         TIMESTAMPTZ,
  is_deleted        BOOLEAN      NOT NULL DEFAULT FALSE,
  deleted_at        TIMESTAMPTZ,

  -- Delivery / read receipt
  recipient_id      UUID,
  status            VARCHAR(20)  NOT NULL DEFAULT 'sent',    -- 'sent'|'delivered'|'seen'
  delivered_at      TIMESTAMPTZ,
  seen_at           TIMESTAMPTZ,

  -- SMS fallback audit
  sms_status        VARCHAR(20),
  sms_sent_at       TIMESTAMPTZ,
  sms_provider_ref  TEXT,

  -- Timestamps
  sent_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_content_or_media CHECK (
    content IS NOT NULL OR media_url IS NOT NULL OR message_type = 'system'
  )
);

-- Key indexes
CREATE UNIQUE INDEX idx_crh_thread_anchor ON "chatRoom_history" (thread_id) WHERE message_type = 'system';
CREATE INDEX idx_crh_thread_sent          ON "chatRoom_history" (thread_id, sent_at DESC);
CREATE INDEX idx_crh_teacher_school       ON "chatRoom_history" (teacher_id, school_id, sent_at DESC);
CREATE INDEX idx_crh_parent_school        ON "chatRoom_history" (parent_id, school_id, sent_at DESC);
CREATE INDEX idx_crh_student_school       ON "chatRoom_history" (student_id, school_id, sent_at DESC);
CREATE INDEX idx_crh_recipient_status     ON "chatRoom_history" (recipient_id, status) WHERE is_deleted = FALSE AND message_type != 'system';
CREATE INDEX idx_crh_fts                  ON "chatRoom_history" USING GIN (to_tsvector('english', COALESCE(content, '')));
```

#### Presence and device tokens

Online/offline presence and FCM device tokens are stored **in memory** (Node.js `Map`) — no database tables required. They are re-populated on each server start as users reconnect.

---

## 8. Firebase Setup

### Step 1 — Create Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create project: `ecafrica-chatroom`
3. Enable **Realtime Database** (locked mode)
4. Enable **Cloud Messaging**

### Step 2 — Realtime Database security rules

```json
{
  "rules": {
    "schools": {
      "$school_id": {
        ".read": "auth != null && auth.token.school_id == $school_id",
        ".write": "auth != null && auth.token.school_id == $school_id"
      }
    }
  }
}
```

### Step 3 — Service account (for backend)

Firebase Console → Project Settings → Service Accounts → Generate new private key → copy values to `.env`.

### Step 4 — Flutter Firebase config

```bash
dart pub global activate flutterfire_cli
cd test_shell
flutterfire configure --project=ecafrica-chatroom
```

Places `firebase_options.dart` in `test_shell/lib/`.  
Copy `google-services.json` to `test_shell/android/app/`.

---

## 9. Running the System

### Start the backend

```bash
cd chat_service
npm run dev
# → ECareAfrica_db connected
# → ECA Chat Service running on port 3000
```

### Run the Flutter test shell

```bash
cd test_shell
flutter run
```

The test shell connects to `http://10.0.2.2:3000` (Android emulator → localhost).  
For iOS simulator use `http://localhost:3000`.

### Run end-to-end test (verify DB)

```bash
cd chat_service
node scripts/test_chat_history.js
```

This logs in as the seed teacher, creates a thread, sends a message, and confirms the row exists in `chatRoom_history`.

### Two-device testing

```
Device 1:  Log in as teacher (+250781000001 / Test@1234)
Device 2:  Log in as parent  (+250781000002 / Test@1234)

→ Parent initiates chat with teacher
→ Teacher receives push notification
→ Teacher replies
→ Parent sees "seen" status (double blue ticks)
```

### Student OTP flow

```
Enter roll number  →  OTP sent to parent phone
                   →  In dev: OTP printed in chat_service/logs/combined.log
Enter OTP          →  Student JWT issued, chatroom opens
```

---

## 10. API Reference

All endpoints (except `/auth/*`) require:
```
Authorization: Bearer <JWT>
```

The JWT is issued by `/auth/verify-otp` or `/auth/student/verify-otp`.  
JWT payload: `{ sub, user_id, school_id, role, name }`

---

### Auth — `/auth`

#### `POST /auth/login` *(teacher only)*
Validate teacher phone + password, send OTP to their registered phone number.

**Request body:**
```json
{ "phone": "+250781000001", "password": "Test@1234" }
```
**Response `200`:**
```json
{ "success": true, "message": "OTP sent to your registered phone number." }
```

---

#### `POST /auth/parent/request-otp` *(parent only)*
Look up parent by phone number (no password required), send OTP to their phone.

**Request body:**
```json
{ "phone": "+250781000002" }
```
**Response `200`:**
```json
{ "success": true, "message": "OTP sent to your phone." }
```
Returns `404 PARENT_NOT_FOUND` if the phone is not registered as a parent.

---

#### `POST /auth/verify-otp` *(teacher + parent)*
Verify OTP, receive JWT.

**Request body:**
```json
{ "phone": "+250781000001", "otp": "123456" }
```
**Response `200`:**
```json
{ "token": "<JWT>", "role": "teacher", "name": "Alice Uwimana" }
```

---

#### `POST /auth/student/request-otp`
Lookup student by roll number, send OTP to parent's phone.

**Request body:**
```json
{ "student_id": "S2024001" }
```
**Response `200`:**
```json
{ "success": true, "message": "OTP sent to parent phone." }
```

---

#### `POST /auth/student/verify-otp`
Verify student OTP, receive student JWT.

**Request body:**
```json
{ "student_id": "S2024001", "otp": "654321" }
```
**Response `200`:**
```json
{ "token": "<JWT>", "role": "student", "name": "Bob Niyonzima" }
```

---

### User Context — `/chat`

#### `GET /chat/me`
Returns the full resolved user context for the authenticated user. Called by the splash screen on every login.

**Response `200`:**
```json
{
  "data": {
    "user_id": "uuid",
    "school_id": "1",
    "role": "teacher",
    "full_name": "Alice Uwimana",
    "students": [
      {
        "student_id": "uuid",
        "full_name": "Bob Niyonzima",
        "admission_number": "S2024001",
        "section_id": "3",
        "section": "Senior 1 A",
        "parent_name": "Jean Mugisha",
        "parent_phone": "+2507812xxxxx",
        "parent_user_id": "uuid",
        "subjects": ["Mathematics", "Physics"]
      }
    ],
    "subjects": ["Mathematics", "Physics"],
    "classes": [
      { "class_id": "3", "class_name": "Senior 1 A", "section": "Senior 1 A" }
    ]
  }
}
```

For **parent**: returns `{ user_id, school_id, role, full_name, children: [...] }`  
For **student**: returns `{ user_id, school_id, role, full_name, teachers: [...] }`

---

#### `GET /chat/children` *(parent only)*
Returns the authenticated parent's children list.

**Response `200`:**
```json
{ "data": [{ "student_id": "uuid", "full_name": "Bob", "teachers": [...] }] }
```

---

#### `GET /chat/teachers?student_id=<uuid>` *(parent only)*
Returns teachers for a specific child (filtered by enrolled subjects).

**Response `200`:**
```json
{ "data": [{ "user_id": "uuid", "full_name": "Alice Uwimana", "subject": "Mathematics" }] }
```

---

#### `GET /chat/student/teachers` *(student only)*
Returns teachers for the authenticated student.

**Response `200`:**
```json
{ "data": [{ "user_id": "uuid", "full_name": "Alice Uwimana", "subject": "Mathematics" }] }
```

---

### Threads — `/chat`

#### `GET /chat/threads`
Returns all chat threads for the authenticated user, ordered by most recent message. Each thread includes a last-message preview and unread count.

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "thread_id": "uuid",
      "thread_type": "direct",
      "thread_initiator": "parent",
      "teacher_id": "uuid",
      "student_id": "uuid",
      "parent_id": "uuid",
      "school_id": "uuid",
      "last_message_preview": "Hello, how is Bob doing?",
      "last_message_type": "text",
      "last_message_at": "2026-07-05T20:18:51.533Z",
      "unread_count": 2,
      "display_name": "Alice Uwimana — Mathematics Teacher",
      "subject_label": "Mathematics"
    }
  ]
}
```

---

#### `POST /chat/threads`
Create a new thread (idempotent — same participants always return the same thread).

**Request body:**
```json
{
  "teacher_id": "uuid",
  "student_id": "uuid",
  "parent_id": "uuid",
  "thread_initiator": "parent",
  "thread_type": "direct"
}
```
**Response `200`:**
```json
{
  "data": {
    "id": "uuid",
    "thread_id": "uuid",
    "thread_type": "direct",
    "thread_initiator": "parent",
    "teacher_id": "uuid",
    "student_id": "uuid",
    "parent_id": "uuid",
    "school_id": "uuid",
    "display_name": "Alice Uwimana — Mathematics Teacher"
  }
}
```

---

#### `GET /chat/threads/:threadId/messages?page=1&limit=30`
Load messages for a thread (paginated, oldest first).

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "thread_id": "uuid",
      "sender_id": "uuid",
      "sender_role": "teacher",
      "message_type": "text",
      "content": "Hello, how is Bob doing?",
      "status": "seen",
      "is_edited": false,
      "is_deleted": false,
      "sent_at": "2026-07-05T20:18:51.533Z"
    }
  ],
  "page": 1,
  "limit": 30
}
```

---

#### `PUT /chat/threads/:threadId/mute`
Mute notifications for a thread.

**Response `200`:** `{ "success": true }`

---

### Messages — `/chat`

#### `POST /chat/messages`
Send a message. The `thread_id` must already exist (create it first with `POST /chat/threads`).

**Request body:**
```json
{
  "thread_id": "uuid",
  "message_type": "text",
  "content": "Hello!"
}
```
For media messages, omit `content` and include:
```json
{
  "thread_id": "uuid",
  "message_type": "image",
  "media_url": "uploads/school-uuid/image.jpg",
  "media_type": "image/jpeg",
  "media_size_bytes": 204800,
  "original_filename": "photo.jpg"
}
```
**Response `201`:** Full `chatRoom_history` row including `id`, `status: "sent"`, `sent_at`.

---

#### `PUT /chat/messages/:messageId`
Edit a message. Only the sender can edit; only within 5 minutes of sending; only `text` type.

**Request body:**
```json
{ "content": "Updated message text" }
```
**Response `200`:** Updated `chatRoom_history` row with `is_edited: true`.

---

#### `PUT /chat/messages/:messageId/read`
Mark a message as seen (updates `status → 'seen'` and `seen_at`).

**Response `200`:** `{ "success": true }`

---

### Broadcast — `/chat` *(teacher only)*

#### `POST /chat/broadcast`
Send a broadcast message to all parents of students in the given class sections.

**Request body:**
```json
{
  "class_ids": ["3", "4"],
  "message_type": "text",
  "content": "Reminder: Parent-teacher meeting on Friday at 2pm."
}
```
**Response `202`:**
```json
{
  "data": {
    "broadcast_id": "uuid",
    "total_parents": 18,
    "sent": 18
  },
  "message": "Broadcast sent."
}
```

---

#### `GET /chat/broadcast/:broadcastId` *(teacher only)*
Get delivery stats for a broadcast.

**Response `200`:**
```json
{
  "data": {
    "broadcast_id": "uuid",
    "section_ids": ["3", "4"],
    "total_recipients": 18,
    "sent_count": 18,
    "content": "Reminder: Parent-teacher meeting on Friday at 2pm.",
    "sent_at": "2026-07-05T20:18:51.533Z"
  }
}
```

---

### Search — `/chat`

#### `GET /chat/search?q=<query>&scope=global`
Full-text search across all threads the user participates in.

#### `GET /chat/search?q=<query>&thread_id=<uuid>`
Full-text search within a specific thread.

**Response `200`:**
```json
{ "data": [ /* matching chatRoom_history rows */ ] }
```

---

### Student Search — `/students`

#### `GET /students/search?roll_number=<value>` *(teacher only)*
Search for a student by roll/enrollment number.

**Response `200`:**
```json
{
  "data": {
    "student_id": "uuid",
    "full_name": "Bob Niyonzima",
    "student_id_number": "S2024001",
    "section": "Senior 1 A",
    "parent_name": "Jean Mugisha",
    "parent_user_id": "uuid"
  }
}
```

---

### Presence — `/chat`

#### `PUT /chat/status/heartbeat`
Update the authenticated user's online status. Flutter calls this every 30 seconds.

**Response `200`:** `{ "success": true }`

---

#### `GET /chat/status/:userId`
Get online/offline status for any user in the same school.

**Response `200`:**
```json
{ "data": { "is_online": true, "last_seen_at": "2026-07-05T20:18:51.533Z" } }
```

---

### Settings & Misc — `/chat`

#### `PUT /chat/settings/mute-all`
Mute all notifications (stub — returns success).

**Response `200`:** `{ "success": true }`

---

#### `GET /chat/unread-count`
Total unread message count for the authenticated user across all threads.

**Response `200`:**
```json
{ "data": { "unread_count": 5 } }
```

---

#### `POST /chat/device-token`
Register or refresh an FCM device token. Called by Flutter on session start.

**Request body:**
```json
{ "device_token": "fcm-token-string", "device_platform": "android" }
```
**Response `200`:** `{ "success": true }`

---

#### `GET /health`
Health check (no auth required).

**Response `200`:**
```json
{ "status": "ok", "service": "eca-chat-service", "version": "1.0.0" }
```

---

### Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `INVALID_REQUEST` | 400 | Missing or invalid fields |
| `UNAUTHORIZED` | 401 | JWT missing, expired, or invalid |
| `OTP_INVALID` | 401 | Wrong or expired OTP |
| `INVALID_CREDENTIALS` | 401 | Wrong phone or password (teacher login) |
| `PARENT_NOT_FOUND` | 404 | Phone not registered as a parent |
| `FORBIDDEN` | 403 | Wrong school_id, role, or not a thread participant |
| `STUDENT_NOT_FOUND` | 404 | Roll number not found or no primary parent |
| `THREAD_NOT_FOUND` | 404 | thread_id not in chatRoom_history |
| `NOT_FOUND` | 404 | Resource not found |
| `EDIT_WINDOW_EXPIRED` | 422 | 5-minute edit window has passed |
| `RATE_LIMITED` | 429 | Too many requests (200 req / 15 min) |
| `SERVER_ERROR` | 500 | Unhandled error — check server logs |

---

## 11. Database Schema

### How thread IDs work

Thread IDs are computed deterministically using **UUID v5** so that the same two participants always share the same thread — no duplicate conversations are possible.

```js
const key = [schoolId, teacherId, studentId, initiator, parentId || ''].join(':');
const threadId = uuidv5(key, THREAD_NS);
```

A `message_type = 'system'` row is the thread anchor. The unique index `idx_crh_thread_anchor` ensures only one anchor exists per thread, making thread creation idempotent.

### How messages are stored

Every sent message = one row in `chatRoom_history` with:
- All thread context columns filled (teacher_id, student_id, parent_id, school_id)
- `sender_id` / `sender_role` identifying who sent it
- `recipient_id` identifying who should receive it
- `status = 'sent'` on insert; updated to `'delivered'` / `'seen'` by Flutter

### Tables NOT touched by the chatroom

The chatroom reads (SELECT only) from: `users`, `students`, `schools`, `sections`, `subjects`, `parents_guardians`, `student_parent_links`, `student_section_enrollments`, `teacher_section_subjects`.

---

## 12. Feature Checklist

### Authentication
- [x] Teacher: phone + password → OTP SMS → JWT
- [x] Parent: phone only → OTP SMS → JWT (no password required)
- [x] Teacher/Parent login screen with animated toggle (switches between the two flows)
- [x] Student: roll number → OTP to parent phone → JWT
- [x] Logout from all screens (Teacher, Parent, Student home + ChildSelection)
- [x] Back navigation from StudentLoginScreen

### Teacher portal
- [x] Teacher name displayed in AppBar
- [x] Thread list with student/parent display names
- [x] Parent Threads / Student Threads tabs
- [x] Roll number search with student details
- [x] New message FAB (contact picker)
- [x] Class broadcast to multiple sections
- [x] Broadcast delivery stats

### Parent portal
- [x] Child selection screen (with logout)
- [x] Teacher list filtered by child's enrolled subjects
- [x] Online status dot on teacher cards
- [x] 1-on-1 chat thread

### Student portal
- [x] Student ID entry with back arrow
- [x] 6-digit OTP input (auto-advance, paste support)
- [x] Teacher list filtered by enrolled subjects
- [x] Cannot see or join parent-teacher threads (403 enforced)

### Messaging
- [x] Text messages
- [x] Message status: sent → delivered → seen
- [x] 5-minute edit window for text messages
- [x] No message deletion (policy — no DELETE endpoint)
- [x] Full-text search (GIN index on content)

### System
- [x] Single database: ECareAfrica_db
- [x] Single chat table: chatRoom_history
- [x] Firebase real-time event signals
- [x] Heartbeat presence (30 s interval)
- [x] FCM push notifications
- [x] SMS OTP delivery
- [x] school_id isolation on every query
- [x] Rate limiting (200 req / 15 min)
- [x] Helmet security headers

---

## 13. Troubleshooting

### `INVALID_CREDENTIALS` on teacher login
Check the phone number format (must include country code: `+250...`). Password is case-sensitive.

### `PARENT_NOT_FOUND` on parent login
The phone number is not registered as a parent in the `users` table (`role = 'parent'`). Confirm the number with the school admin.

### "Could not connect" on login
The `apiBaseUrl` in `test_shell/lib/main.dart` must match your machine's actual local IP (run `ipconfig` on Windows to find it). Update the IP if your network has changed — e.g. `http://192.168.8.101:3000`. A full app restart (not hot reload) is required after changing `main.dart`.

### OTP not received
In development the OTP is printed to `chat_service/logs/combined.log` — search for `[DEV] OTP for`. In production verify SMS gateway credentials and credit balance.

### `THREAD_NOT_FOUND` when sending a message
Call `POST /chat/threads` first to get a `thread_id`, then use it in `POST /chat/messages`.

### `relation "chatRoom_history" does not exist`
Run migrations: `node src/db/migrate.js`

### PostgreSQL connection refused
Check that PostgreSQL is running: `pg_isready -h localhost -p 5432`  
Verify `ECAFRICA_DB_*` variables in `.env` match your database credentials.

### Emulator cannot reach backend
Android emulator uses `10.0.2.2` (not `localhost`) to reach your machine. iOS simulator uses `localhost` directly. Update `apiBaseUrl` in `ChatroomService.initialize()` accordingly.

### Firebase `auth/invalid-credential`
Verify `FIREBASE_PRIVATE_KEY` in `.env` — the `\n` newlines must be real newlines or escaped as `\n`. Generate a new service account key if in doubt.

### `sec.uuid does not exist` error
This was a bug (now fixed) where `sections.uuid` was referenced but the table only has an integer `id`. Fixed in `user_context.service.js`: uses `sec.id::text AS section_id`.

---

*ECareAfrica Chatroom — v1.1.0*  
*Building Africa's Digital Education Future*
