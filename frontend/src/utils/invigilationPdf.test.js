import { describe, it, expect } from 'vitest';
import {
    toDateKey, formatTime, formatDate, pdfFileName,
    gridFromSchedule, gridFromArchive, dutiesByInvigilator, gridStats,
    buildDutyChart, buildInvigilatorRoster, buildDutyLetters, buildWorkloadSummary, buildRoomSheet,
} from './invigilationPdf.js';

// Text in jsPDF output is uncompressed by default, so rendered strings can be
// asserted straight from the raw document — after undoing PDF string escapes.
const text = (doc) => doc.output().replace(/\\([()\\])/g, '$1');
const pages = (doc) => doc.getNumberOfPages();
const meta = { semesterLabel: 'EVEN 2025-26', examType: 'midterm', logo: null, generatedAt: new Date(2026, 3, 1, 10, 0) };

const asha = { user_id: 1, full_name: 'Asha Verma', employee_id: 'E001', role: 'faculty', department: 'CSE', is_course_instructor: true };
const ravi = { user_id: 2, full_name: 'Ravi Kumar', employee_id: 'P002', role: 'phd_student', department: 'ECE', is_course_instructor: false };

// Deliberately out of order: the adapter must sort slots and rooms.
const schedule = [
    {
        slot_id: 11, exam_date: '2026-05-11', exam_day: 'Monday', start_time: '09:00:00', end_time: '12:00:00',
        rooms: [{ classroom_id: 7, room_name: 'LT-2', location_order: 2, students: 30, required: 2, course_codes: 'CSE201', invigilators: [ravi] }],
    },
    {
        slot_id: 10, exam_date: '2026-05-10', exam_day: 'Sunday', start_time: '14:00:00', end_time: '17:00:00',
        rooms: [
            { classroom_id: 8, room_name: 'LT-9', location_order: 9, students: 20, required: 1, course_codes: 'MTH101', invigilators: [] },
            { classroom_id: 5, room_name: 'LT-1', location_order: 1, students: 45, required: 2, course_codes: 'CSE101, CSE102', invigilators: [ravi, asha] },
        ],
    },
];

describe('formatting helpers', () => {
    it('keeps plain date keys and reads timestamps as local calendar days', () => {
        expect(toDateKey('2026-05-10')).toBe('2026-05-10');
        expect(toDateKey(new Date(2026, 4, 10, 23, 30))).toBe('2026-05-10');
        expect(toDateKey(new Date(2026, 4, 10).toISOString())).toBe('2026-05-10');
        expect(toDateKey(null)).toBe('');
    });

    it('formats 12-hour times', () => {
        expect(formatTime('09:00:00')).toBe('09:00 AM');
        expect(formatTime('13:30:00')).toBe('01:30 PM');
        expect(formatTime('00:15')).toBe('12:15 AM');
        expect(formatTime('12:00')).toBe('12:00 PM');
    });

    it('formats dates without shifting the day', () => {
        expect(formatDate('2026-05-10')).toBe('10 May 2026');
    });

    it('builds safe file names', () => {
        expect(pdfFileName('Duty Chart', 'EVEN 2025-26', 'midterm')).toBe('Duty_Chart_EVEN_2025-26_midterm.pdf');
        expect(pdfFileName('', null)).toBe('invigilation.pdf');
    });
});

describe('grid adapters', () => {
    it('sorts slots chronologically and rooms by location order', () => {
        const grid = gridFromSchedule(schedule);
        expect(grid.map((s) => s.slot_id)).toEqual([10, 11]);
        expect(grid[0].rooms.map((r) => r.room_name)).toEqual(['LT-1', 'LT-9']);
        expect(grid[0].rooms[0].invigilators.map((i) => i.full_name)).toEqual(['Asha Verma', 'Ravi Kumar']);
    });

    it('rebuilds slots and rooms from archived duty rows', () => {
        const rows = [
            { slot_id: 3, exam_date: '2026-05-10', start_time: '09:00:00', end_time: '12:00:00', classroom_id: 5, room_name: 'LT-1', course_codes: 'CSE101', ...ravi },
            { slot_id: 3, exam_date: '2026-05-10', start_time: '09:00:00', end_time: '12:00:00', classroom_id: 5, room_name: 'LT-1', course_codes: 'CSE101', ...asha },
            { slot_id: 2, exam_date: '2026-05-09', start_time: '09:00:00', end_time: '12:00:00', classroom_id: 6, room_name: 'LT-3', course_codes: null, ...asha },
        ];
        const grid = gridFromArchive(rows);
        expect(grid.map((s) => s.slot_id)).toEqual([2, 3]);
        expect(grid[1].rooms).toHaveLength(1);
        expect(grid[1].rooms[0].invigilators).toHaveLength(2);
        expect(grid[1].rooms[0].required).toBeNull();
    });

    it('groups duties per person and computes shortfall', () => {
        const grid = gridFromSchedule(schedule);
        const people = dutiesByInvigilator(grid);
        expect(people.map((p) => [p.person.full_name, p.duties.length])).toEqual([['Asha Verma', 1], ['Ravi Kumar', 2]]);
        const stats = gridStats(grid);
        expect(stats).toMatchObject({ days: 2, sessions: 2, rooms: 3, duties: 3, invigilators: 2 });
        // LT-9 needs 1 (has 0), LT-2 needs 2 (has 1).
        expect(stats.shortfall).toBe(2);
    });
});

describe('PDF builders', () => {
    const grid = gridFromSchedule(schedule);

    it('duty chart lists every room and person, flags gaps, and starts each day on a new page', () => {
        const doc = buildDutyChart(grid, meta);
        const out = text(doc);
        expect(out).toContain('INVIGILATION DUTY CHART');
        expect(doc.getNumberOfPages()).toBeGreaterThan(0);
        expect(out).toContain('Mid-Term Examination');
        expect(out).toContain('Asha Verma (CI)');
        expect(out).toContain('Not assigned');
        expect(out).toContain('2 (1 short)');
        expect(pages(doc)).toBe(2);
        expect(out).toContain('Page 2 of 2');
        expect(out).toContain('Prepared by');
    });

    it('duty chart can keep days on the same page', () => {
        expect(pages(buildDutyChart(grid, meta, { newPagePerDay: false }))).toBe(1);
    });

    it('duty chart handles an empty schedule', () => {
        const out = text(buildDutyChart([], meta));
        expect(out).toContain('No invigilation duties have been scheduled.');
    });

    it('roster lists each invigilator with their duty count', () => {
        const out = text(buildInvigilatorRoster(grid, meta));
        expect(out).toContain('INVIGILATOR-WISE DUTY ROSTER');
        expect(out).toContain('Asha Verma');
        expect(out).toContain('Ravi Kumar');
        expect(out).toContain('LT-1 (CI)');
    });

    it('duty letters put each invigilator on their own page', () => {
        expect(pages(buildDutyLetters(grid, meta))).toBe(2);
        const one = buildDutyLetters(grid, meta, { onlyKeys: [2] });
        expect(pages(one)).toBe(1);
        const out = text(one);
        expect(out).toContain('Dear Ravi Kumar,');
        expect(out).not.toContain('Dear Asha Verma,');
        expect(out).toContain('Instructions to Invigilators');
    });

    it('duty letters accept a profile to fill missing details', () => {
        const archived = gridFromArchive([{ slot_id: 1, exam_date: '2026-05-10', start_time: '09:00', end_time: '12:00', classroom_id: 1, room_name: 'LT-1', user_id: 9, full_name: 'Neha', role: 'lab_staff' }]);
        const out = text(buildDutyLetters(archived, meta, { profile: { department: 'Physics', employee_id: 'L009' } }));
        expect(out).toContain('Physics');
        expect(out).toContain('L009');
    });

    it('workload summary totals assigned and targets', () => {
        const rows = [
            { user_id: 1, full_name: 'Asha Verma', role: 'faculty', assigned_count: 3, effective_target: 2, sibling_assigned: 0, sibling_target: 2, cumulative_assigned: 3, cumulative_target: 4, balance: -1, is_configured: true },
            { user_id: 2, full_name: 'Ravi Kumar', role: 'phd_student', assigned_count: 2, effective_target: 2, sibling_assigned: 3, sibling_target: 2, cumulative_assigned: 5, cumulative_target: 4, balance: 1, is_configured: true },
        ];
        const out = text(buildWorkloadSummary(rows, meta, { siblingExamType: 'endterm' }));
        expect(out).toContain('INVIGILATION WORKLOAD SUMMARY');
        expect(out).toContain('-1 deficit');
        expect(out).toContain('+1 extra');
        expect(out).toContain('8 / 8');
        expect(out).toContain('Endterm A/T');
    });

    it('room sheet lists the room invigilators with signature columns', () => {
        const slot = grid[0];
        const out = text(buildRoomSheet(slot, slot.rooms[0], meta));
        expect(out).toContain('INVIGILATOR ATTENDANCE SHEET');
        expect(out).toContain('Reporting time');
        expect(out).toContain('Asha Verma');
    });
});
