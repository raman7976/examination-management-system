import { describe, it, expect } from 'vitest';
import { pdfSafe, buildUnfairMeansReport, buildUnfairMeansRegister } from './unfairMeansPdf.js';

// Raw PDF text, with string escapes undone (see invigilationPdf.test.js).
const text = (doc) => doc.output().replace(/\\([()\\])/g, '$1');

const ufmCase = (overrides = {}) => ({
    id: 12, case_number: 'UFM-2026-0012', status: 'reported',
    semester_label: 'EVEN 2025-2026', exam_type: 'midterm',
    exam_date: '2026-03-09', start_time: '09:30:00', end_time: '11:00:00',
    room_name: 'LT-3', seat_number: 'G7',
    roll_number: '23UCS101', student_name: 'Rahul Sharma',
    course_code: 'CSE2011', course_name: 'Data Structures',
    category: 'electronic_device', incident_time: '10:15:00',
    description: 'Mobile phone found in the pocket, screen showing notes.',
    material_seized: true, material_description: 'One mobile phone',
    action_taken: 'answer_book_seized_new_issued',
    student_statement: null, reported_by_name: 'Asha Verma', witness_name: 'Ravi Kumar',
    decision_note: null, decided_at: null, created_at: '2026-03-09T05:00:00.000Z',
    ...overrides,
});

describe('pdfSafe', () => {
    it('maps typographic punctuation to ASCII and replaces unsupported characters', () => {
        expect(pdfSafe('“He said” — it’s mine…')).toBe('"He said" - it\'s mine...');
        expect(pdfSafe('café')).toBe('café'); // Latin-1 is kept
        expect(pdfSafe('नमस्ते')).toBe('??????'); // 6 Devanagari code points
        expect(pdfSafe(null)).toBe('');
    });
});

describe('buildUnfairMeansReport', () => {
    it('contains the case, candidate, incident and signature blocks', () => {
        const out = text(buildUnfairMeansReport(ufmCase()));
        expect(out).toContain('UNFAIR MEANS CASE REPORT');
        expect(out).toContain('UFM-2026-0012');
        expect(out).toContain('Rahul Sharma');
        expect(out).toContain('Mobile phone / electronic device');
        expect(out).toContain('Yes - One mobile phone');
        expect(out).toContain('Answer book seized, new one issued');
        expect(out).toContain("in the candidate's own handwriting");   // blank statement lines
        expect(out).toContain('Reporting invigilator');
        expect(out).toContain('Examination In-charge');
        expect(out).not.toContain('Examination department decision');
    });

    it('prints noon as 12 pm, not 00 pm (en-GB 12-hour quirk)', () => {
        const noon = new Date(2026, 9, 29, 12, 6).toISOString();
        expect(text(buildUnfairMeansReport(ufmCase({ created_at: noon })))).toContain('29 Oct 2026, 12:06 pm');
    });

    it('annexes evidence photos after the signed page, two per page', () => {
        const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const photos = [1, 2, 3].map((n) => ({ dataUrl: png, width: 800, height: 600, caption: `Chit ${n}` }));
        const doc = buildUnfairMeansReport(ufmCase({ recorded_by_name: 'Exam Admin' }), {}, { photos });
        expect(doc.getNumberOfPages()).toBe(3);               // report + 2 annexure pages
        const out = text(doc);
        expect(out).toContain('ANNEXURE: EVIDENCE PHOTOGRAPHS');
        expect(out).toContain('Photo 1 of 3: Chit 1');
        expect(out).toContain('Photo 3 of 3: Chit 3');
        expect(out).toContain('3 \\(annexed\\)'.replace(/\\/g, ''));
        expect(out).toContain('Exam Admin');
    });

    it('prints the recorded statement and the decision once the case is closed', () => {
        const out = text(buildUnfairMeansReport(ufmCase({
            status: 'action_taken', student_statement: 'I accept the phone was mine.',
            decision_note: 'Paper cancelled.', decided_at: '2026-03-12T06:00:00.000Z',
        })));
        expect(out).toContain('I accept the phone was mine.');
        expect(out).not.toContain("own handwriting");
        expect(out).toContain('Examination department decision');
        expect(out).toContain('Paper cancelled.');
    });
});

describe('buildUnfairMeansRegister', () => {
    it('lists every case with status counts', () => {
        const doc = buildUnfairMeansRegister([
            ufmCase(),
            ufmCase({ id: 13, case_number: 'UFM-2026-0013', status: 'dismissed', roll_number: '23UCS102', student_name: 'Neha Iyer' }),
        ], { semesterLabel: 'EVEN 2025-2026', examType: 'midterm' });
        const out = text(doc);
        expect(out).toContain('UNFAIR MEANS REGISTER');
        expect(out).toContain('UFM-2026-0012');
        expect(out).toContain('UFM-2026-0013');
        expect(out).toContain('Neha Iyer');
        expect(out).toContain('Dismissed');
    });

    it('says so when nothing matches', () => {
        expect(text(buildUnfairMeansRegister([], {}))).toContain('No unfair-means cases match this selection.');
    });
});
