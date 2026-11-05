// ─────────────────────────────────────────────────────────────────────────────
//  Invigilation workflow steps, derived from GET /invigilator-scheduling/progress
//  plus the count of unsaved draft edits on the Schedule tab.
//
//    1. Seating ready      every slot that has exams has a saved seating plan
//    2. Duty targets set   at least one role has a target
//    3. Schedule saved     duties exist and there are no unsaved edits
//    4. Rooms staffed      every seated room has its required invigilators,
//                          and no duty sits in a room without seating
//
//  The schedule is "complete" when steps 1, 3 and 4 are done. Targets only
//  steer generation, so a saved, fully-staffed schedule without targets is
//  still complete (that step just shows a warning).
//
//  Each step: { key, title, state, detail, next?, action? }
//    state:  'done' | 'attention' | 'todo'
//    next:   imperative phrase for the "Next step" bar ("Set duty targets")
//    action: { label, tab } (switch tab on this page) or { label, route }
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_SHORT = { faculty: 'Faculty', phd_student: 'PhD', lab_staff: 'Lab Staff' };

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function deriveInvigilationSteps(progress, { draftCount = 0 } = {}) {
    if (!progress) return null;
    const { seating, targets, schedule } = progress;

    // 1. Seating
    let seatingStep;
    if (seating.slots_with_exams === 0) {
        seatingStep = {
            state: 'todo',
            detail: 'No exams are scheduled into slots yet.',
            next: 'Schedule exams into slots',
            action: { label: 'Open Smart Scheduling', route: '/dashboard/smart-scheduling' },
        };
    } else if (seating.slots_with_seating === 0) {
        seatingStep = {
            state: 'todo',
            detail: 'Save a seating plan first: invigilators are assigned to seated rooms.',
            next: 'Finish the seating plan',
            action: { label: 'Open Seating Manager', route: '/dashboard/seating-manager' },
        };
    } else if (seating.slots_with_seating < seating.slots_with_exams) {
        const missing = seating.slots_with_exams - seating.slots_with_seating;
        seatingStep = {
            state: 'attention',
            detail: `${plural(missing, 'exam slot')} ${missing === 1 ? 'has' : 'have'} no seating plan, so ${missing === 1 ? 'it' : 'they'} will get no invigilators.`,
            next: 'Finish the seating plan',
            action: { label: 'Open Seating Manager', route: '/dashboard/seating-manager' },
        };
    } else {
        seatingStep = {
            state: 'done',
            detail: `Seating saved for all ${plural(seating.slots_with_exams, 'exam slot')} (${plural(seating.rooms, 'room')}).`,
        };
    }

    // 2. Duty targets
    const setRoles = Object.entries(targets).filter(([, n]) => Number(n) > 0);
    const targetsStep = setRoles.length > 0
        ? { state: 'done', detail: setRoles.map(([r, n]) => `${ROLE_SHORT[r] || r} ${n}`).join(' · ') }
        : {
            state: schedule.duties > 0 ? 'attention' : 'todo',
            detail: schedule.duties > 0
                ? 'No duty targets were set, so duties were spread evenly.'
                : 'Set how many duties each role should do in this exam.',
            next: 'Set duty targets',
            action: { label: 'Set targets', tab: 'targets' },
        };

    // 3. Schedule saved
    let scheduleStep;
    if (draftCount > 0) {
        scheduleStep = {
            state: 'attention',
            detail: `${plural(draftCount, 'unsaved change')}: click Save Changes to publish them.`,
            next: 'Save your changes',
            action: { label: 'Review & save', tab: 'schedule' },
        };
    } else if (schedule.duties === 0) {
        scheduleStep = {
            state: 'todo',
            detail: 'Generate a draft, review it, then click Save Changes.',
            next: 'Generate and save the schedule',
            action: { label: 'Go to Schedule', tab: 'schedule' },
        };
    } else {
        scheduleStep = {
            state: 'done',
            detail: `${plural(schedule.duties, 'duty', 'duties')} saved for ${plural(schedule.invigilators, 'invigilator')}.`,
        };
    }

    // 4. Every room staffed (judged on the SAVED schedule)
    let staffedStep;
    if (schedule.duties === 0) {
        staffedStep = { state: 'todo', detail: 'Every room needs its required invigilators (1 per 25 students).' };
    } else if (schedule.orphan_duties > 0) {
        staffedStep = {
            state: 'attention',
            detail: `${plural(schedule.orphan_duties, 'duty', 'duties')} ${schedule.orphan_duties === 1 ? 'is' : 'are'} in a room with no seating. Remove ${schedule.orphan_duties === 1 ? 'it' : 'them'}.`,
            next: 'Remove duties in rooms without seating',
            action: { label: 'Fix in Schedule', tab: 'schedule' },
        };
    } else if (schedule.unfilled_positions > 0) {
        staffedStep = {
            state: 'attention',
            detail: `${plural(schedule.unfilled_positions, 'position')} unfilled in ${plural(schedule.understaffed_rooms, 'room')}.`,
            next: 'Fill the remaining positions',
            action: { label: 'Fill in Schedule', tab: 'schedule' },
        };
    } else {
        staffedStep = { state: 'done', detail: `All ${plural(seating.rooms, 'room')} fully staffed.` };
    }

    const steps = [
        { key: 'seating', title: 'Seating ready', ...seatingStep },
        { key: 'targets', title: 'Duty targets set', ...targetsStep },
        { key: 'schedule', title: 'Schedule saved', ...scheduleStep },
        { key: 'staffed', title: 'All rooms staffed', ...staffedStep },
    ];

    const blocking = ['seating', 'schedule', 'staffed'];
    const complete = steps.filter(s => blocking.includes(s.key)).every(s => s.state === 'done');
    // The step to work on next: the first unfinished step in order — except a
    // targets *warning* (schedule already saved without targets), which only
    // becomes "next" once nothing else is left.
    const isSoftWarning = (s) => s.key === 'targets' && s.state === 'attention';
    const current = steps.find(s => s.state !== 'done' && !isSoftWarning(s))
        || steps.find(s => s.state !== 'done')
        || null;

    return { steps, complete, current };
}

// Read the persisted Schedule-tab draft (see SchedulePanel) and count its edits.
export function readDraftCount(periodId) {
    if (!periodId) return 0;
    try {
        const raw = sessionStorage.getItem(`inv_sched_draft_p${periodId}`);
        if (!raw) return 0;
        const d = JSON.parse(raw);
        return Object.keys(d.reassigns || {}).length + (d.removes || []).length + (d.adds || []).length;
    } catch {
        return 0;
    }
}
