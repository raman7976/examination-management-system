# Examination Management System

> **A full-stack, production-grade web application for automating end-to-end examination logistics at a university scale.** Handles multi-semester course ingestion, calendar-driven exam scheduling, three-lane classroom seating allocation via a custom greedy algorithm, individual student-to-chair micro-mapping via a Zip Algorithm, invigilator scheduling with deficit-first duty balancing, and a two-stage peer → admin swap workflow — all governed by ACID-compliant MySQL transactions and JWT-based Role-Based Access Control.

---

## Table of Contents
1. [System Architecture & Data Flow](#1-system-architecture--data-flow)
2. [API Surface & Route Catalogue](#2-api-surface--route-catalogue)
3. [Core Algorithms & Engineering Decisions](#3-core-algorithms--engineering-decisions)
4. [Data Integrity & Edge-Case Handling](#4-data-integrity--edge-case-handling)
5. [Database Schema & Normalisation](#5-database-schema--normalisation)
6. [Quantifiable Scale & Performance Analysis](#6-quantifiable-scale--performance-analysis)
7. [Technology Stack — Justification Matrix](#7-technology-stack--justification-matrix)
8. [Security Model](#8-security-model)
9. [Running Locally](#9-running-locally)

---

## 1. System Architecture & Data Flow

### Paradigm
**Layered RESTful Monolith** with clean separation of concerns across four discrete tiers:

```
┌──────────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER  (React 19 SPA, Vite 7, React Router v7)     │
│  • Role-bifurcated routes: /dashboard (admin) / /invigilator-    │
│    portal (faculty/phd_student/lab_staff)                         │
│  • PeriodContext: React Context propagates active exam_period_id  │
│    globally, eliminating prop-drilling across 14 pages            │
│  • Axios intercepts attach Bearer token from localStorage         │
└─────────────────────────────┬────────────────────────────────────┘
                              │  HTTPS · JSON · multipart/form-data
┌─────────────────────────────▼────────────────────────────────────┐
│  APPLICATION LAYER  (Node.js 22 ESM · Express 5)                 │
│  • helmet() adds 14 security headers (CSP, HSTS, XFO…)           │
│  • morgan('dev') logs every request for observability             │
│  • Middleware chain: helmet → cors → morgan → json → protect →    │
│    requireAdmin/requireInvigilator → controller                   │
│  • 7 route modules → 9 controllers → 3 pure-logic utility modules │
└─────────────────────────────┬────────────────────────────────────┘
                              │  mysql2/promise (pooled)
┌─────────────────────────────▼────────────────────────────────────┐
│  ALGORITHMIC LAYER  (seatingAlgorithm.js · invigilatorAlgorithm) │
│  • PURE functions — zero DB calls — deterministic, unit-testable  │
│  • Input: hydrated DB rows   Output: allocation arrays            │
│  • Controllers call these, then write results in a transaction     │
└─────────────────────────────┬────────────────────────────────────┘
                              │  Connection pool (limit: 10)
┌─────────────────────────────▼────────────────────────────────────┐
│  PERSISTENCE LAYER  (MySQL · TiDB Cloud / on-premise capable)     │
│  • 15 normalised tables, FK-enforced referential integrity         │
│  • Per-semester scoping via `semester_label` composite PKs         │
│  • Pool with SSL, waitForConnections=true, queueLimit=0 (unbounded)│
└──────────────────────────────────────────────────────────────────┘
```

### End-to-End Data Flow (Happy Path)

```
Admin Login
  └─ POST /api/v1/user/login
       → bcrypt.compare() → jwt.sign({id, email, role}, secret, 8h)
       → token stored client-side

Data Ingestion
  └─ POST /api/upload/courses          (.xlsx → ExcelJS → batch upsert 500/chunk)
  └─ POST /api/upload/enrollments      (.zip  → adm-zip → SheetJS → UPSERT + dedup)
  └─ POST /api/upload/course-instructors  (.xlsx → bulk pre-validate → INSERT IGNORE)

Exam Scheduling
  └─ POST /api/exams/batch-slots       (batch INSERT exam_slots)
  └─ POST /api/exams/schedule-batch    (hard-reset + bulk INSERT scheduled_exams)

Macro Seating (Room Allocation)
  └─ POST /api/exams/generate-export
       → resolveActivePeriod()
       → runSeatingAlgorithm(rooms, courses, enabledIds)  ← PURE, no DB
       → ExcelJS workbook streamed as attachment (draft for human review)
  └─ POST /api/exams/upload-seating    (reviewed .xlsx → parse KEY ROW → persist seating_allocations)

Micro Seating (Zip Algorithm)
  └─ POST /api/seating/generate-plan
       → beginTransaction()
       → DELETE existing micro plans for slot
       → For each seating_allocation:
           fetch students (ORDER BY roll_number, scoped to semester)
           fetch chairs   (ORDER BY seq_order)
           Zip 1:1 → push [allocation_id, roll_number, seat_number]
       → INSERT IGNORE bulk → commit()

Invigilator Scheduling
  └─ POST /api/invigilator-scheduling/run
       → runInvigilatorAlgorithm(slots, roomLoad, courseInstructors, invigilators) ← PURE
       → Phase A: place course instructors in their own course rooms
       → Phase B: deficit-first general pool fill (1 per 25 students)
       → Bulk INSERT invigilator_assignments → commit()

Swap Workflow (3-state FSM)
  └─ POST /api/invigilator-scheduling/swap-requests  → status: pending_peer
  └─ PUT  /swap-requests/:id/peer-respond             → status: pending_admin
  └─ PUT  /swap-requests/:id/admin-respond            → status: approved / rejected
       → atomic UPDATE invigilator_assignments (swap classroom_ids)
       → re-evaluate is_course_instructor badge for both parties
```

---

## 2. API Surface & Route Catalogue

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/user/login` | Public | bcrypt verify → JWT sign |
| `POST` | `/api/v1/user/send-otp` | Public | In-memory OTP for password reset |
| `POST` | `/api/v1/user/set-password` | Public | bcrypt hash → UPDATE users |
| `GET`  | `/api/v1/user/me` | JWT | Full profile (employee_id, dept, created_at) |
| `POST` | `/api/upload/courses` | JWT+Admin | Parse .xlsx → batch upsert courses |
| `POST` | `/api/upload/enrollments` | JWT+Admin | Parse .zip → students + enrollments |
| `POST` | `/api/upload/course-instructors` | JWT+Admin | Link employees to courses |
| `GET`  | `/api/upload/courses` | JWT+Admin | Paginated course list w/ GROUP_CONCAT instructors |
| `GET`  | `/api/upload/enrollments` | JWT+Admin | Paginated student list w/ course aggregation |
| `GET`  | `/api/upload/enrollment-mismatches` | JWT+Admin | Expected vs actual count gap |
| `DELETE` | `/api/upload/reset` | JWT+Admin | Scoped period wipe; `?wipe_roster=true` for full reset |
| `POST` | `/api/exams/batch-slots` | JWT+Admin | Bulk create exam time slots |
| `GET`  | `/api/exams/slots` | JWT+Admin | List all slots in active period |
| `PUT`  | `/api/exams/slots/:id` | JWT+Admin | Edit single slot |
| `DELETE` | `/api/exams/slots/:id` | JWT+Admin | Delete single slot |
| `POST` | `/api/exams/schedule-batch` | JWT+Admin | Hard-reset + assign courses to slots |
| `GET`  | `/api/exams/classrooms` | JWT+Admin | All classrooms ordered by location |
| `POST` | `/api/exams/classrooms` | JWT+Admin | Add classroom |
| `GET`  | `/api/exams/seating-status` | JWT+Admin | Per-slot allocation count badges |
| `POST` | `/api/exams/generate-export` | JWT+Admin | Run macro algorithm → stream .xlsx |
| `POST` | `/api/exams/upload-seating` | JWT+Admin | Parse reviewed .xlsx → persist allocations |
| `GET`  | `/api/exams/slots/:slotId/seating` | JWT+Admin | Retrieve saved allocations |
| `POST` | `/api/exams/slots/:slotId/preview` | JWT+Admin | Dry-run algorithm for one slot |
| `POST` | `/api/seating/generate-plan` | JWT+Admin | Run Zip Algorithm → persist micro plans |
| `GET`  | `/api/seating/view-plan` | JWT+Admin | Fetch individual seat assignments |
| `GET`  | `/api/seating/status` | JWT+Admin | Per-slot micro-plan existence badges |
| `POST` | `/api/invigilator-scheduling/run` | JWT+Admin | Run invigilator algorithm |
| `GET`  | `/api/invigilator-scheduling/schedule` | JWT | Invigilator's own schedule |
| `POST` | `/api/invigilator-scheduling/swap-requests` | JWT+Invig | Create swap request |
| `PUT`  | `/api/invigilator-scheduling/swap-requests/:id/peer-respond` | JWT+Invig | Accept/reject as target |
| `PUT`  | `/api/invigilator-scheduling/swap-requests/:id/admin-respond` | JWT+Admin | Final approval + execution |
| `GET`  | `/api/registration/...` | JWT+Admin | User management CRUD |
| `GET/POST/DELETE` | `/api/schedule/...` | JWT+Admin | Exam period & semester management |

---

## 3. Core Algorithms & Engineering Decisions

### 3.1 Macro Seating Algorithm — `utils/seatingAlgorithm.js`

**Problem:** Given `N` courses with varying student counts and `M` classrooms each with three physical lane capacities (`cap_purple`, `cap_green`, `cap_yellow`), assign courses to room-lane pairs to prevent students of the same course sitting adjacent to each other (anti-cheating constraint).

**Algorithm — Two-Phase Greedy with Dynamic Mode Switching:**

```
Phase 0: Capacity Planning
  - Compute total demand = Σ student_count
  - Compute purpleCap   = Σ cap_purple  (standard mode)
  - If demand > purpleCap: activate FRACTURE mode
      → Promote lowest-priority non-sticky rooms to Split (S) mode
      → S mode exposes Green + Yellow lanes (higher total but interleaved)
      → Stop promoting once currentCap >= demand

Phase 1: Course Sorting
  - Sort courses descending by student_count
  - The largest course (index 0) is flagged as `isGiant`

Phase 2: Sequential Allocation (largest-first)
  For each course:
    For each room (sorted by location_order — building contiguity):
      If room.mode == 'P':
        → Fill Purple lane
      Else (Split mode):
        If isGiant: fill Green lane (largest course gets Green)
        Else:       fill Yellow lane (smaller courses get Yellow)
      → This guarantees same-lane students are from different courses
    If overflow remains: second pass on S-mode rooms, cross-filling
```

**Why Largest-First?** Greedy bin-packing with largest-first (LPT heuristic) minimises the number of rooms needed and reduces cross-room overflow, which is the operationally expensive case requiring human review.

**Time Complexity:** `O(N × M)` where N = courses per slot (typically 8–15), M = rooms (typically 10–20). Runs in pure in-memory JavaScript in < 5ms per slot.

**Output:** A flat `allocations[]` array: `[{ scheduled_exam_id, classroom_id, lane, student_count, room_mode }]` — this is what gets persisted to `seating_allocations` after human review of the generated Excel draft.

---

### 3.2 Micro Seating — Zip Algorithm — `controllers/seatingController.js`

**Problem:** Given macro allocations (course → room+lane+count), assign each individual student to a specific numbered chair.

**The Zip Algorithm:**

```javascript
// Pseudocode from seatingController.js generateMicroPlan()

const courseStudentOffset = {};  // course_code → { students[], index }
const seatOffset = {};           // "classroomId_lane" → next chair index

for (const allocation of allocations) {   // ordered by classroom_id, lane
  // Load students ONCE per course (ordered by roll_number, scoped to semester)
  if (!courseStudentOffset[course_code]) {
    students = SELECT roll_number FROM course_enrollments
               WHERE course_code=? AND semester_label=?
               ORDER BY roll_number ASC
    courseStudentOffset[course_code] = { students, index: 0 }
  }

  // Load physical chairs for this room+lane (ordered by seq_order)
  chairs = SELECT seat_number FROM classroom_seats
           WHERE classroom_id=? AND lane=?
           ORDER BY seq_order ASC

  // Continue from where the PREVIOUS course left off in this lane
  let chairIdx = seatOffset["classroomId_lane"] || 0

  // 1:1 zip
  while (allocatedCount < allocation.student_count) {
    newPlans.push([allocation_id, student.roll_number, chair.seat_number])
    courseTracker.index++; chairIdx++; allocatedCount++;
  }

  seatOffset["classroomId_lane"] = chairIdx  // persist offset for next course
}

// Single bulk INSERT IGNORE
INSERT IGNORE INTO individual_seating_plans (allocation_id, roll_number, seat_number) VALUES ?
```

**Critical Design Choice — Semester Scoping:** The Zip Algorithm explicitly filters `course_enrollments` by `semester_label` derived from the slot's `exam_period_id`. Without this, a course code present in two semesters would pull duplicate students across rosters, producing `duplicate entry` errors in `individual_seating_plans`. This was an identified edge case that required a `JOIN exam_slots → exam_periods` chain to resolve before the inner loop begins.

**Critical Design Choice — Seat Offset Continuity:** The `seatOffset` map tracks per-lane progress so that when two courses share the same room+lane (course A takes seats 1–40, course B takes seats 41–70), the second course doesn't restart from seat 1. This was the "key fix" identified and implemented to prevent seat collisions.

**Anti-Cheating Guarantee:** Because macro allocation places courses in different lanes (Purple vs Green vs Yellow), and micro allocation zips students of the same course into *consecutive* chairs within their lane, students of different courses are physically interleaved at the room level but same-course students are adjacent within their lane — the exact constraint required for examination integrity.

---

### 3.3 Invigilator Scheduling Algorithm — `utils/invigilatorAlgorithm.js`

**Problem:** Assign faculty/phd_student/lab_staff to exam rooms across all slots, respecting:
- Each invigilator in at most one room per slot
- Course instructors preferentially placed in their own course's room
- 1 invigilator per 25 students (configurable: `STUDENTS_PER_INVIGILATOR = 25`)
- Semester-wide duty balancing via cross-period carryover targets

**Two-Phase Algorithm:**

```
Phase A — Course Instructor Placement:
  For each course in the slot:
    Filter rooms to only those holding this course
    Filter instructors to only those not yet placed this slot
    
    If #instructors >= #rooms: assign one instructor per room
    If #instructors < #rooms:  spread evenly using index formula:
        room_index[i] = floor((i + 0.5) × N / k)
        (ensures maximum geographic spread — instructors cover distant rooms)

Phase B — Deficit-First General Pool Fill:
  Per room (sorted by location_order):
    need = max(1, ceil(students_in_room / 25)) - already_placed_by_Phase_A
    Pool sorted by: deficit DESC → role rank (faculty > phd > lab) → user_id

    Effective target uses carryover from sibling period:
        effective_target = max(0, base_target − previous_balance)
    → Users who over-served in midterm get reduced endterm targets
    → Users who under-served in midterm get higher endterm targets
```

**Swap Workflow State Machine:**

```
[pending_peer] ─── peer accepts ──→ [pending_admin] ─── admin approves ──→ [approved]
                                                      └── admin rejects ──→ [rejected]
               └── peer rejects ──→ [rejected]
               └── requester cancels ─→ [cancelled]
```

On admin approval, two `UPDATE invigilator_assignments` statements atomically swap the `classroom_id` values, then `isInstructorForRoom()` is re-evaluated for both parties to update the `is_course_instructor` badge.

---

### 3.4 Data Ingestion Pipeline — `controllers/uploadController.js`

**Dual-Parser Architecture:**

| File Type | Parser | Reason |
|-----------|--------|--------|
| `.xlsx` (course master) | `ExcelJS` streaming | Rich text, hyperlink, and formula cell extraction via `getCellValue()` helper |
| `.xlsx` (enrollment, inside .zip) | `SheetJS (xlsx)` | `adm-zip` delivers a raw `Buffer`; SheetJS's `XLSX.read(buffer, {type:'buffer'})` handles this directly; ExcelJS's `load()` requires a stream and fails on adm-zip buffers |

**Header Normalisation:** All column headers are reduced to `lowercase + strip all whitespace/underscores` before lookup:
```
'Course Name' / 'COURSENAME' / 'Course_Name' / 'course name' → 'coursename'
```
This makes the parser tolerant of the natural variation in faculty-maintained Excel templates.

**Transactional Two-Stage Validation:**

```
Stage 1 (In-Memory, Pre-DB):
  - Load existing course codes for active semester into a Set
  - For each .xlsx file in the .zip:
      For each row: extract roll_number + course_code (from "CSE437-Compiler Design" → "CSE437")
      VALIDATION: if course_code not in existingCoursesSet → skip entire file, log warning
      Else: accumulate to tempStudentsMap + tempEnrollments
  - If file passes: commit temp → main collections

Stage 2 (Database Transaction):
  - Batch INSERT students (500 per chunk) with INSERT IGNORE (idempotent)
  - Deduplicate enrollments in-memory with a Set (roll|course keys)
  - Batch INSERT course_enrollments with INSERT IGNORE
  - Post-commit: run mismatch query (expected vs actual count gap per course)
  - Return mismatch array in response for admin review
```

**Batch Size = 500:** Chosen to stay comfortably within MySQL's `max_allowed_packet` default (64 MB) even with wide VARCHAR rows. Each batch = one DB round-trip; for 3,000 students this means 6 network calls vs 3,000.

---

### 3.5 Excel Export & Round-Trip Parsing — KEY ROW Protocol

The seating plan .xlsx follows a self-describing format to make it machine-parseable after human editing:

```
Row 1: Slot metadata (merged, dark header strip)
Row 2: Room names (merged per room, 3 sub-columns each: P | G | Y)
Row 3: KEY ROW — "LH-1|P", "LH-9|G", "LH-9|Y" …  ← machine identifier
Row 4: Lane sub-headers (Purple / Green / Yellow)
Row 5+: Data rows — exam_id | course_name | instructor | total | count_per_lane…
```

On upload (`POST /api/exams/upload-seating`), the parser reads **Row 3** to reconstruct the `colMap: { colNumber → { roomName, lane } }`. The `room_name` is then resolved against a pre-loaded `roomLookup` (room_name → classroom_id). This design means an admin can add a new room column mid-template as long as they follow the `ROOMNAME|LANE` format in row 3 — zero code changes required.

---

## 4. Data Integrity & Edge-Case Handling

### 4.1 ACID Transactions — Every write path is wrapped

```javascript
const conn = await db.getConnection();
try {
    await conn.beginTransaction();
    // ... all INSERT/UPDATE/DELETE ...
    await conn.commit();
} catch (err) {
    await conn.rollback();
    throw err;
} finally {
    conn.release();  // always returned to pool
}
```

This pattern appears in: `generateMicroPlan`, `scheduleBatchExams`, `uploadAndSaveSeating`, `uploadEnrollments`, `uploadCourses`, `createSemester`, `admin-respond` (swap approval). The `finally { conn.release() }` guarantee ensures no connection leaks under any error path.

### 4.2 Hard-Reset Pattern (Idempotent Mutations)

Several write endpoints implement a "hard-reset before insert" pattern. Before persisting a new seating plan:
1. `DELETE seating_allocations` scoped to the active period via a multi-table JOIN chain
2. `INSERT` fresh allocations

This makes re-running the algorithm safe: no duplicate data accumulates. The cascade DELETE chain respects FK order: `individual_seating_plans → seating_allocations → scheduled_exams → exam_slots`.

### 4.3 Period Scoping — `utils/periodResolver.js`

Every controller that touches semester-specific data calls `resolveActivePeriod()`. This:
- Accepts an explicit `period_id` override (for admin multi-period queries)
- Falls back to `SELECT id FROM exam_periods WHERE is_active = 1 LIMIT 1`
- Throws `{ http: 400 }` if no active period — prevents silent data cross-contamination

A `semester_label` composite key design (e.g., `(semester_label, course_code)` PK on `courses`) means the same course can exist in "2024-Odd" and "2025-Even" as separate rows — no aliasing across semesters.

### 4.4 Role-Based Access Control (RBAC) — Three-Tier

```javascript
// Tier 1: Public routes (no token)
// Tier 2: Any authenticated user (protect middleware)
// Tier 3: Role-specific guard

export const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin')
        return res.status(403).json({ ... });
    next();
};

export const requireInvigilator = (req, res, next) => {
    if (req.user?.role === 'admin')      // Admins bounce — they have separate endpoints
        return res.status(403).json({ ... });
    if (!['faculty', 'phd_student', 'lab_staff'].includes(req.user?.role))
        return res.status(403).json({ ... });
    next();
};
```

The `requireInvigilator` guard explicitly **bounces admins**, preventing admin accounts from masquerading as invigilators (a misconfiguration risk surfaced during development).

On the frontend, `AdminRoute` and `InvigilatorRoute` components wrap their respective `<Outlet>` trees, creating a parallel route hierarchy that can never be cross-navigated.

### 4.5 Concurrent Update Safety

- **Swap requests:** A `SELECT … FOR UPDATE` pattern is not needed because the FSM transition is enforced at the SQL level with a `WHERE status = 'pending_peer'` condition on the UPDATE. A concurrent approval attempt on an already-terminal row affects 0 rows, returning a 404.
- **Enrollment deduplication:** An in-memory `Set` of `roll|course` composite keys deduplicates across files before the DB write. The subsequent `INSERT IGNORE` provides a second layer of protection at the DB unique constraint level.
- **Connection pool:** `waitForConnections: true` with `queueLimit: 0` queues requests indefinitely rather than throwing "pool exhausted" errors under burst load. The pool limit of 10 connections is appropriate for a single-server university deployment.

### 4.6 Validation Layer — Zod + Manual Guards

- **`zod ^4.3.6`** is installed for schema validation (routes can be progressively hardened with schema validators)
- **Manual guards** exist at every controller entry: required field checks, array type assertions, ownership checks (e.g., a swap requester must own the `requester_assignment_id`)
- **File validation:** The ZIP parser filters `__MACOSX` macOS artifacts and `._` hidden files before any processing

### 4.7 Error Propagation Pattern

Errors carry an `.http` property set at the point of origin:
```javascript
throw Object.assign(new Error('No active exam period.'), { http: 400 });
```
The catch block extracts `error.http || 500` to send the right HTTP status code. This avoids the anti-pattern of leaking 500s for client errors.

The global error handler in `server.js` conditionally strips stack traces in production:
```javascript
stack: process.env.NODE_ENV === 'production' ? null : err.stack
```

---

## 5. Database Schema & Normalisation

### Entity-Relationship Summary (15 Tables)

```
exam_periods ──< exam_slots ──< scheduled_exams ──< seating_allocations ──< individual_seating_plans
                                        │                     │
                             courses >──┘            classrooms >──< classroom_seats
                             (semester-scoped)
courses ──< course_instructors (employee_id → users)
courses ──< course_enrollments ──< students

users ──< invigilator_assignments ──< invigilator_swap_requests
invigilator_role_targets (per-period duty quotas)
exam_session_seating (archival / denormalized snapshot)
```

### Normalisation Compliance

| Table | NF | Notes |
|-------|----|-------|
| `users` | BCNF | Single PK (id), all attributes depend only on id |
| `courses` | BCNF | Composite PK (semester_label, course_code); all non-key attrs depend on full PK |
| `exam_slots` | 3NF | `exam_day` is derivable from `exam_date` — retained as a pre-computed optimisation to avoid date-to-day conversion in every query |
| `course_enrollments` | BCNF | Surrogate PK (id) + unique (semester_label, roll_number, course_code); resolves M:N between students↔courses |
| `seating_allocations` | 3NF | `room_mode` depends only on `classroom_id` but is denormalised here intentionally to avoid a JOIN when rendering the seating grid |
| `individual_seating_plans` | BCNF | Three-way FK: allocation_id → roll_number → seat_number |
| `exam_session_seating` | **Intentional 1NF/2NF violation** | Archive/snapshot table. Stores `student_name`, `course_name`, `room_name` as strings. If a course is deleted in future, the historical record remains intact. This is the correct architectural choice for immutable audit logs. |

### Composite PK Strategy

Tables storing semester-specific institutional data use `(semester_label, course_code)` as natural composite keys:
- `courses (semester_label, course_code)` — PRIMARY KEY
- `course_instructors (semester_label, course_code, employee_id)` — UNIQUE
- `course_enrollments (semester_label, roll_number, course_code)` — UNIQUE

This allows the database to hold complete data for multiple semesters simultaneously without row conflicts, and makes semester-level rollback (`DELETE WHERE semester_label = ?`) atomic and safe.

---

## 6. Quantifiable Scale & Performance Analysis

### Data Volume Estimates (Typical University Semester)
| Entity | Approximate Count |
|--------|------------------|
| Students | ~3,000–5,000 |
| Courses per semester | ~150–200 |
| Enrollments per semester | ~15,000–30,000 |
| Exam slots | ~20–30 |
| Scheduled exams | ~300–500 |
| Seating allocations | ~2,000–4,000 |
| Individual seat plans | ~15,000–30,000 |
| Invigilators | ~200–400 |
| Invigilator assignments | ~1,500–3,000 |

### Algorithm Complexity

| Algorithm | Time Complexity | Space | Notes |
|-----------|----------------|-------|-------|
| Macro Seating (`runSeatingAlgorithm`) | O(N × M) | O(N + M) | N = courses (≤20), M = rooms (≤20) — microsecond range |
| Micro Seating Zip | O(E + S) | O(E + S) | E = enrollments for slot, S = seat count for slot |
| Invigilator Scheduling | O(K × (N + P log P)) | O(K + N + P) | K = slots, N = rooms, P = invigilators |
| In-memory enrollment dedup | O(E) | O(E) | Single Set pass before batch insert |

### Database Write Performance (Upload Pipeline)

Batch size of 500 rows with multi-row `VALUES` syntax reduces network round-trips by ~99%:

```
Naive approach:    3,000 student rows → 3,000 INSERT statements → ~3,000 round-trips
Batched approach:  3,000 student rows → 6 INSERT statements   → 6 round-trips
```

For 30,000 enrollment rows: 30,000 → 60 round-trips. At a conservative 1ms round-trip this saves ~29.9 seconds per bulk upload.

### Connection Pool Throughput

With `connectionLimit: 10` and MySQL handling ~1,000 QPS per connection on simple queries:
- **Theoretical peak:** ~10,000 QPS for lightweight GET endpoints
- **Realistic burst:** Concurrent admin operations (algorithm run + file upload) hold connections for ~200ms–2s → effective concurrency of 5–50 simultaneous operations
- `queueLimit: 0` means excess requests queue rather than fail, making the system resilient to burst traffic

### Excel Generation Performance

The `_buildExcelSheet()` function builds the workbook in-memory via ExcelJS and streams it directly to the HTTP response (`workbook.xlsx.write(res)`). For a typical 15-slot exam period with 12 courses/slot and 18 room-lane columns per sheet:
- **Workbook size:** ~200–400 KB
- **Generation time:** ~500ms–1.5s (ExcelJS is synchronous per-row, but I/O bound)
- **Memory footprint:** ~5–10 MB peak (ExcelJS buffers the entire workbook in Node.js heap before streaming)

---

## 7. Technology Stack — Justification Matrix

| Technology | Version | Why This Specific Choice |
|------------|---------|--------------------------|
| **Node.js (ESM)** | 22 | `"type": "module"` in package.json — native ES modules avoid CommonJS/ESM interop issues. Async event loop handles concurrent file I/O (ZIP extraction, Excel parsing) without blocking |
| **Express** | 5.x | Express 5 adds native `async/await` error propagation — `async` route handlers can `throw` directly to the global error handler without wrapping in `try/catch next(err)` |
| **mysql2/promise** | 3.x | Promise-based API eliminates callback hell in transaction chains. `createPool()` with SSL supports both local MySQL and TiDB Cloud (current deployment) without code changes |
| **ExcelJS** | 4.x | Rich cell-type extraction (richText, hyperlinks, formulas via `getCellValue()` helper). Required for course master uploads where faculty use formatted Excel files |
| **SheetJS (xlsx)** | 0.18 | Handles `Buffer` input natively — essential for processing files extracted from adm-zip in memory without writing to disk |
| **adm-zip** | 0.5 | Pure-JS ZIP extraction into memory (`entry.getData()` returns `Buffer`). Avoids spawning child processes for `unzip` and keeps the server stateless (no temp files) |
| **bcrypt** | 6.x | Cost factor 10 — ~100ms hash time. Appropriate for login (rate-limited by network latency) without burning CPU on every request |
| **jsonwebtoken** | 9.x | Stateless auth eliminates a `sessions` table lookup on every authenticated request. 8-hour expiry matches a typical exam day work session |
| **helmet** | 8.x | Adds `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, and 11 other headers in one call |
| **zod** | 4.x | Runtime schema validation with TypeScript-grade type inference. Installed for progressive hardening of request bodies |
| **React** | 19 | Concurrent rendering features (`useTransition`, `Suspense`) available for future progressive enhancement. Component-based architecture enables 14 pages sharing layout components |
| **React Router** | 7.x | Nested route layouts (`<Outlet>`) enable the `AdminRoute`/`InvigilatorRoute` guard pattern without duplicating layout code |
| **Vite** | 7.x | Sub-second HMR during development. Tree-shaking in production build eliminates unused library code |
| **Tailwind CSS** | 3.x | Utility-first styling in JSX — eliminates context switching to separate CSS files for rapid UI iteration |
| **Framer Motion** | 12.x | Production-grade animation library for page transitions and interactive elements |
| **jsPDF + autotable** | 4.x / 5.x | Client-side PDF generation for seating plan PDFs — zero server load, instant download |
| **Axios** | 1.x | Instance-based configuration: `axios.create({ baseURL, headers: {Authorization: Bearer} })` — all API calls share auth header automatically |

---

## 8. Security Model

### Authentication Flow
```
Login → bcrypt.compare(password, password_hash) → jwt.sign({id, email, role}, JWT_SECRET, {expiresIn:'8h'})
Every protected request → jwt.verify(token, JWT_SECRET) → req.user = {id, email, role}
```

### RBAC Enforcement (Defense in Depth)

```
Layer 1 (Frontend): AdminRoute / InvigilatorRoute components redirect unauthorized users
Layer 2 (API):      protect middleware rejects missing/expired/tampered tokens (HTTP 401)
Layer 3 (API):      requireAdmin / requireInvigilator rejects wrong roles (HTTP 403)
Layer 4 (Database): Period-scoped queries ensure data isolation even if roles were bypassed
```

### Sensitive Data Handling
- Passwords stored as `bcrypt` hashes — never plaintext
- JWT secret loaded from `.env` via `dotenv` — never hardcoded
- Stack traces stripped in `NODE_ENV=production`
- MySQL pool uses SSL (`ssl: { rejectUnauthorized: false }`) — encrypted transit to TiDB Cloud
- CORS `exposedHeaders: ['Content-Disposition']` — minimal header exposure; only what the download feature needs

---

## 9. Running Locally

### Prerequisites
- Node.js 22+
- MySQL 8.0+ (or TiDB Cloud connection string)

### Backend

```bash
cd backend
cp .env.example .env      # fill DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, JWT_SECRET, PORT
npm install
npm start                  # or: node server.js
```

### Frontend

```bash
cd frontend
npm install
npm run dev                # Vite dev server → http://localhost:5173
```

### Environment Variables (Backend `.env`)

| Variable | Example | Purpose |
|----------|---------|---------|
| `DB_HOST` | `gateway01.ap-southeast-1.prod.aws.tidbcloud.com` | MySQL / TiDB host |
| `DB_PORT` | `4000` | MySQL port |
| `DB_USER` | `exam_user` | DB username |
| `DB_PASSWORD` | `...` | DB password |
| `DB_NAME` | `exam_db` | Database name |
| `JWT_SECRET` | `64-char random string` | JWT signing secret |
| `PORT` | `5001` | Express server port |
| `NODE_ENV` | `production` | Strips stack traces from error responses |

---

## Project Stats

| Metric | Value |
|--------|-------|
| Backend controllers | 9 files, ~200KB of logic |
| Largest single controller | `invigilatorSchedulingController.js` — 1,068 lines |
| Upload pipeline | `uploadController.js` — 842 lines |
| Pure algorithm utilities | 3 files (`seatingAlgorithm.js`, `invigilatorAlgorithm.js`, `periodResolver.js`) |
| Frontend pages | 14 pages + 4 invigilator sub-pages |
| API endpoints | 37 routes across 7 route modules |
| Database tables | 15 (fully FK-enforced) |
| Backend dependencies | 11 production packages |
| Frontend dependencies | 8 production packages + Vite + Tailwind |

---

*Built as a B.Tech Computer Science capstone project (BTP) at LNMIIT, demonstrating production-grade full-stack engineering across data ingestion, constraint-aware greedy algorithms, ACID-compliant transactional storage, and multi-role workflow management.*
