import { describe, it, expect, beforeEach } from 'vitest';
import { deriveInvigilationSteps, readDraftCount } from './invigilationProgress.js';

// A finished schedule; tests override the parts they care about.
const base = () => ({
    seating: { slots_total: 5, slots_with_exams: 5, slots_with_seating: 5, rooms: 30 },
    targets: { faculty: 3, phd_student: 2, lab_staff: 0 },
    schedule: { duties: 63, invigilators: 20, required: 63, unfilled_positions: 0, understaffed_rooms: 0, unassigned_rooms: 0, orphan_duties: 0 },
    swaps: { pending_admin: 0, pending_peer: 0 },
});
const with_ = (patch) => {
    const p = base();
    for (const [k, v] of Object.entries(patch)) p[k] = { ...p[k], ...v };
    return p;
};
const stateOf = (d, key) => d.steps.find((s) => s.key === key).state;

describe('deriveInvigilationSteps', () => {
    it('returns null until progress has loaded', () => {
        expect(deriveInvigilationSteps(null)).toBeNull();
    });

    it('a saved, fully staffed schedule is complete', () => {
        const d = deriveInvigilationSteps(base());
        expect(d.complete).toBe(true);
        expect(d.steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done']);
        expect(d.current).toBeNull();
        expect(d.steps[1].detail).toBe('Faculty 3 · PhD 2');
        expect(d.steps[3].detail).toBe('All 30 rooms fully staffed.');
    });

    it('points at Smart Scheduling when no exams are in slots, then at Seating Manager', () => {
        let d = deriveInvigilationSteps(with_({ seating: { slots_with_exams: 0, slots_with_seating: 0, rooms: 0 }, schedule: { duties: 0 } }));
        expect(d.current.key).toBe('seating');
        expect(d.current.action.route).toBe('/dashboard/smart-scheduling');

        d = deriveInvigilationSteps(with_({ seating: { slots_with_seating: 0, rooms: 0 }, schedule: { duties: 0 } }));
        expect(d.current.action.route).toBe('/dashboard/seating-manager');
    });

    it('flags exam slots that still have no seating and blocks completion', () => {
        const d = deriveInvigilationSteps(with_({ seating: { slots_with_seating: 3 } }));
        expect(stateOf(d, 'seating')).toBe('attention');
        expect(d.steps[0].detail).toMatch(/^2 exam slots have no seating plan/);
        expect(d.complete).toBe(false);
    });

    it('asks to generate and save when nothing is scheduled yet', () => {
        const d = deriveInvigilationSteps(with_({ schedule: { duties: 0, invigilators: 0 } }));
        expect(d.current.key).toBe('schedule');
        expect(d.current.action.tab).toBe('schedule');
        expect(stateOf(d, 'staffed')).toBe('todo');
    });

    it('unsaved draft edits keep the schedule step open', () => {
        const d = deriveInvigilationSteps(base(), { draftCount: 37 });
        expect(stateOf(d, 'schedule')).toBe('attention');
        expect(d.current.detail).toBe('37 unsaved changes: click Save Changes to publish them.');
        expect(d.complete).toBe(false);
    });

    it('reports unfilled positions and duties in rooms without seating', () => {
        let d = deriveInvigilationSteps(with_({ schedule: { unfilled_positions: 4, understaffed_rooms: 3 } }));
        expect(d.current.key).toBe('staffed');
        expect(d.current.detail).toBe('4 positions unfilled in 3 rooms.');

        d = deriveInvigilationSteps(with_({ schedule: { orphan_duties: 1 } }));
        expect(d.current.detail).toBe('1 duty is in a room with no seating. Remove it.');
        expect(d.complete).toBe(false);
    });

    it('missing targets do not block completion once the schedule is saved', () => {
        const d = deriveInvigilationSteps(with_({ targets: { faculty: 0, phd_student: 0, lab_staff: 0 } }));
        expect(stateOf(d, 'targets')).toBe('attention');
        expect(d.complete).toBe(true);
        expect(d.current.key).toBe('targets');
    });

    it('missing targets are the next step before anything is scheduled', () => {
        const d = deriveInvigilationSteps(with_({
            targets: { faculty: 0, phd_student: 0, lab_staff: 0 },
            schedule: { duties: 0, invigilators: 0 },
        }));
        expect(stateOf(d, 'targets')).toBe('todo');
        expect(d.current.key).toBe('targets');
        expect(d.current.next).toBe('Set duty targets');
        expect(d.current.action.tab).toBe('targets');
    });

    it('a targets warning does not jump ahead of real staffing gaps', () => {
        const d = deriveInvigilationSteps(with_({
            targets: { faculty: 0, phd_student: 0, lab_staff: 0 },
            schedule: { unfilled_positions: 2, understaffed_rooms: 2 },
        }));
        expect(stateOf(d, 'targets')).toBe('attention');
        expect(d.current.key).toBe('staffed');
        expect(d.current.next).toBe('Fill the remaining positions');
    });
});

describe('readDraftCount', () => {
    beforeEach(() => sessionStorage.clear());

    it('counts the persisted draft edits for a period', () => {
        sessionStorage.setItem('inv_sched_draft_p7', JSON.stringify({ reassigns: { 1: {} }, removes: [2, 3], adds: [{}, {}, {}] }));
        expect(readDraftCount(7)).toBe(6);
        expect(readDraftCount(8)).toBe(0);
        expect(readDraftCount(null)).toBe(0);
    });

    it('treats a corrupt draft as empty', () => {
        sessionStorage.setItem('inv_sched_draft_p7', '{not json');
        expect(readDraftCount(7)).toBe(0);
    });
});
