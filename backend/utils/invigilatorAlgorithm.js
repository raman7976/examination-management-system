// ─────────────────────────────────────────────────────────────────────────────
//  utils/invigilatorAlgorithm.js
//  Pure logic – no DB calls.
//
//  Two-phase allocation:
//    Phase A — Place course instructors in rooms that hold their course.
//              When a course spans more rooms than it has instructors, spread
//              the instructors at evenly-spaced indices in the rooms-sorted-by-
//              location_order list so distant rooms still have an instructor
//              within reach.
//    Phase B — Fill remaining required slots with general invigilators,
//              picking those most behind their target first (deficit DESC).
//
//  Hard constraints:
//    - No invigilator is assigned to two rooms in the same slot.
//    - No course instructor is reused for another course in the same slot.
//    - Per-room required = max(1, ceil(students/25)).
//
//  Soft constraints (not enforced but considered):
//    - Aim for everyone to hit their target by end of schedule (deficit-first).
//    - Allow assignments past target if pool is exhausted (overflow path).
//
//  NOTE: `effective_target` is computed by the caller (controller) using
//  symmetric semester-wide carryover:
//      effective_target = max(0, base_target − previous_balance_in_sibling_period)
//  so users who were OVER in midterm get a smaller endterm target, and users
//  who were UNDER get a larger one — keeping cumulative duties balanced.
// ─────────────────────────────────────────────────────────────────────────────

const STUDENTS_PER_INVIGILATOR = 25;

/**
 * @param {Array}  slots                 [{ slot_id, exam_date, start_time }] in chronological order
 * @param {Object} roomLoadBySlot        { slot_id: [{ classroom_id, location_order, students_in_room }] }
 * @param {Object} courseInstructorsBySlot { slot_id: [{ course_code, classroom_ids:[], instructor_user_ids:[] }] }
 * @param {Array}  invigilators          [{ user_id, role, effective_target }]
 * @returns {{ assignments:Array, summary:Array, warnings:Array }}
 */
export function runInvigilatorAlgorithm(slots, roomLoadBySlot, courseInstructorsBySlot, invigilators) {
    const assignments = []; // [{ slot_id, classroom_id, user_id, is_course_instructor }]
    const warnings    = [];

    // Per-user running counters
    const assignedCount = new Map();      // user_id → number of duties allocated so far
    invigilators.forEach(i => assignedCount.set(i.user_id, 0));

    const userTarget = new Map();
    invigilators.forEach(i => userTarget.set(i.user_id, i.effective_target));

    const userRole = new Map();
    invigilators.forEach(i => userRole.set(i.user_id, i.role));

    // Per-slot tracking of already-placed users (so nobody is in two rooms in one slot)
    const placedInSlot = new Map();       // slot_id → Set<user_id>

    // Helper: deficit-first ranker for general invigilators
    const compareForPick = (a, b) => {
        const defA = (userTarget.get(a) || 0) - (assignedCount.get(a) || 0);
        const defB = (userTarget.get(b) || 0) - (assignedCount.get(b) || 0);
        if (defB !== defA) return defB - defA;                  // larger deficit first
        const roleA = userRole.get(a) || '';
        const roleB = userRole.get(b) || '';
        const roleRank = r => (r === 'faculty' ? 0 : r === 'phd_student' ? 1 : 2);
        if (roleRank(roleA) !== roleRank(roleB)) return roleRank(roleA) - roleRank(roleB);
        return a - b;                                            // deterministic tie-break
    };

    // Process slots in chronological order so counters accrue fairly
    for (const slot of slots) {
        const slotId = slot.slot_id;
        const rooms = (roomLoadBySlot[slotId] || []).slice()
            .sort((a, b) => a.location_order - b.location_order);
        if (rooms.length === 0) continue;

        const slotPlaced = new Set();
        placedInSlot.set(slotId, slotPlaced);

        // Per-room required headcount
        const required = new Map();   // classroom_id → remaining required
        for (const r of rooms) {
            const need = Math.max(1, Math.ceil((r.students_in_room || 0) / STUDENTS_PER_INVIGILATOR));
            required.set(r.classroom_id, need);
        }

        // ── PHASE A: Course-instructor placement ─────────────────────────────
        const courses = courseInstructorsBySlot[slotId] || [];
        for (const course of courses) {
            const courseRooms = rooms
                .filter(r => course.classroom_ids.includes(r.classroom_id))
                .sort((a, b) => a.location_order - b.location_order);

            // Instructors who are still available (not yet placed in this slot)
            const availableInstructors = course.instructor_user_ids
                .filter(uid => !slotPlaced.has(uid) && assignedCount.has(uid));

            if (courseRooms.length === 0 || availableInstructors.length === 0) continue;

            const k = availableInstructors.length;
            const n = courseRooms.length;

            // Pick which rooms get an instructor:
            //  - If k >= n  →  every room gets one (use first k instructors, lowest location_order rooms)
            //  - If k <  n  →  spread instructors evenly across the n rooms:
            //                  instructor i goes to room index floor((i + 0.5) * n / k)
            let chosenRoomIndices;
            if (k >= n) {
                chosenRoomIndices = Array.from({ length: n }, (_, i) => i);
            } else {
                chosenRoomIndices = Array.from({ length: k }, (_, i) =>
                    Math.min(n - 1, Math.floor((i + 0.5) * n / k))
                );
            }

            for (let i = 0; i < chosenRoomIndices.length; i++) {
                const instr = availableInstructors[i];
                if (!instr) break;
                const room  = courseRooms[chosenRoomIndices[i]];
                if (!room) continue;

                // Only count this placement against required if the room still needs people.
                // (If the room is already full from prior instructor placements of OTHER courses,
                //  we still place the instructor here — admin intent — and tolerate over-staffing.)
                assignments.push({
                    slot_id:              slotId,
                    classroom_id:         room.classroom_id,
                    user_id:              instr,
                    is_course_instructor: 1,
                });
                slotPlaced.add(instr);
                assignedCount.set(instr, (assignedCount.get(instr) || 0) + 1);
                const cur = required.get(room.classroom_id) || 0;
                if (cur > 0) required.set(room.classroom_id, cur - 1);
            }
        }

        // ── PHASE B: Fill remaining seats from general pool ──────────────────
        // Eligible pool per slot: anyone not yet placed in this slot
        for (const room of rooms) {
            let need = required.get(room.classroom_id) || 0;
            if (need <= 0) continue;

            const pool = invigilators
                .map(i => i.user_id)
                .filter(uid => !slotPlaced.has(uid));

            // Prefer those still under their target; if all over, fall back to all eligible.
            const underTarget = pool.filter(uid => (assignedCount.get(uid) || 0) < (userTarget.get(uid) || 0));
            const fillerPool  = underTarget.length >= need ? underTarget : pool;

            fillerPool.sort(compareForPick);

            for (const uid of fillerPool) {
                if (need <= 0) break;
                assignments.push({
                    slot_id:              slotId,
                    classroom_id:         room.classroom_id,
                    user_id:              uid,
                    is_course_instructor: 0,
                });
                slotPlaced.add(uid);
                assignedCount.set(uid, (assignedCount.get(uid) || 0) + 1);
                need--;
            }
            required.set(room.classroom_id, need);

            if (need > 0) {
                warnings.push(`Slot ${slotId}, room ${room.classroom_id}: short by ${need} invigilator(s) — pool exhausted.`);
            }
        }
    }

    // Build per-user summary
    const summary = invigilators.map(i => {
        const assigned = assignedCount.get(i.user_id) || 0;
        const target   = i.effective_target;
        return {
            user_id:  i.user_id,
            role:     i.role,
            target,
            assigned,
            balance:  assigned - target,   // negative = deficit, positive = extra
        };
    });

    return { assignments, summary, warnings };
}
