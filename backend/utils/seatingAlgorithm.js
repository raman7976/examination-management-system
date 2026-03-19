// ─────────────────────────────────────────────────────────────────────────────
//  utils/seatingAlgorithm.js
//  Pure seating logic – no DB calls. Direct ES-module port of the HTML tool.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Array} rooms           – rows from `classrooms` table
 * @param {Array} courses         – rows from `scheduled_exams` (need: id, course_name, student_count)
 * @param {Array} enabledRoomIds  – classrooms.id values that are active for this sitting
 * @returns {{ allocations, log, summary }}
 */
export function runSeatingAlgorithm(rooms, courses, enabledRoomIds) {
    const log = [];
    const push = (msg, tag = '') => log.push({ tag, msg });

    // ── 1. Filter & hydrate ──────────────────────────────────────────────────
    const activeRooms = rooms
        .filter(r => enabledRoomIds.includes(r.id))
        .map(r => ({
            id:              r.id,
            room_name:       r.room_name,
            p:               r.cap_purple,
            g:               r.cap_green,
            y:               r.cap_yellow,
            priority:        r.priority,
            locOrder:        r.location_order,
            type:            r.type,
            mode:            'P',
            allocs:          { P: [], G: [], Y: [] },
            used:            { P: 0, G: 0, Y: 0 },
            coursesInGreen:  new Set(),
            coursesInYellow: new Set(),
        }));

    // ── 2. Sort courses largest-first ────────────────────────────────────────
    const sortedCourses = [...courses].sort((a, b) => b.student_count - a.student_count);
    const totalDemand   = sortedCourses.reduce((s, c) => s + c.student_count, 0);
    push(`Demand: ${totalDemand}`);

    // ── 3. PHASE 1: Capacity planning (fracture by efficiency priority) ──────
    activeRooms.sort((a, b) => a.priority - b.priority);

    let currentCap  = activeRooms.reduce((s, r) => s + r.p, 0);
    const purpleCap = currentCap;
    push(`Pure-Purple capacity: ${currentCap}`);

    let fractureActive = false;
    if (totalDemand > currentCap) {
        push('Capacity deficit – fracturing rooms…');
        fractureActive = true;
        for (const r of activeRooms) {
            if (currentCap >= totalDemand) break;
            if (r.type === 'sticky') continue;
            r.mode = 'S';
            const gain = (r.g + r.y) - r.p;
            currentCap += gain;
            push(`  Fractured ${r.room_name} (+${gain}) → cap ${currentCap}`);
        }
    } else {
        push('Capacity sufficient – standard Purple mode.');
    }

    // Split-only rooms (cap_purple = 0) always stay in S mode
    activeRooms.forEach(r => { if (r.p === 0) r.mode = 'S'; });

    // ── 4. OPTIMISATION: Re-sort by location order ───────────────────────────
    push('Re-sorting rooms for building contiguity…');
    activeRooms.sort((a, b) => a.locOrder - b.locOrder);

    // ── 5. PHASE 2: Sequential allocation ───────────────────────────────────
    sortedCourses.forEach((course, index) => {
        let rem = course.student_count;
        const isGiant = index === 0;

        push(`Allocating "${course.course_name}" (${rem})…`);

        for (const r of activeRooms) {
            if (rem <= 0) break;
            rem = _allocateIdeally(r, course, isGiant, rem);
        }

        if (rem > 0) {
            push(`  Overflow for "${course.course_name}"…`, 'warn');
            for (const r of activeRooms) {
                if (rem <= 0) break;
                rem = _allocateOverflow(r, course, rem);
            }
        }

        if (rem > 0) push(`CRITICAL: "${course.course_name}" unallocated: ${rem}`, 'error');
    });

    // ── 6. Flatten to return array ───────────────────────────────────────────
    const allocations = [];
    activeRooms.forEach(r => {
        ['P', 'G', 'Y'].forEach(lane => {
            r.allocs[lane].forEach(a => {
                const course = sortedCourses.find(c => c.id === a.courseId);
                if (!course) return;
                allocations.push({
                    scheduled_exam_id: course.id,
                    classroom_id:      r.id,
                    room_name:         r.room_name,
                    course_name:       course.course_name,
                    lane,
                    student_count:     a.count,
                    room_mode:         r.mode,
                });
            });
        });
    });

    return { allocations, log, summary: { totalDemand, purpleCap, finalCap: currentCap, fractureActive } };
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _allocateIdeally(room, course, isGiant, rem) {
    if (room.mode === 'P') {
        const space = room.p - room.used.P;
        if (space > 0) {
            const take = Math.min(rem, space);
            room.allocs.P.push({ courseId: course.id, count: take });
            room.used.P += take;
            rem -= take;
        }
    } else {
        if (isGiant) {
            if (!room.coursesInYellow.has(course.id)) {
                const space = room.g - room.used.G;
                if (space > 0) {
                    const take = Math.min(rem, space);
                    room.allocs.G.push({ courseId: course.id, count: take });
                    room.used.G += take;
                    room.coursesInGreen.add(course.id);
                    rem -= take;
                }
            }
        } else {
            if (!room.coursesInGreen.has(course.id)) {
                const space = room.y - room.used.Y;
                if (space > 0) {
                    const take = Math.min(rem, space);
                    room.allocs.Y.push({ courseId: course.id, count: take });
                    room.used.Y += take;
                    room.coursesInYellow.add(course.id);
                    rem -= take;
                }
            }
        }
    }
    return rem;
}

function _allocateOverflow(room, course, rem) {
    if (room.mode !== 'S') return rem;
    if (!room.coursesInYellow.has(course.id)) {
        const spaceG = room.g - room.used.G;
        if (spaceG > 0) {
            const take = Math.min(rem, spaceG);
            room.allocs.G.push({ courseId: course.id, count: take });
            room.used.G += take;
            room.coursesInGreen.add(course.id);
            rem -= take;
        }
    }
    if (rem > 0 && !room.coursesInGreen.has(course.id)) {
        const spaceY = room.y - room.used.Y;
        if (spaceY > 0) {
            const take = Math.min(rem, spaceY);
            room.allocs.Y.push({ courseId: course.id, count: take });
            room.used.Y += take;
            room.coursesInYellow.add(course.id);
            rem -= take;
        }
    }
    return rem;
}