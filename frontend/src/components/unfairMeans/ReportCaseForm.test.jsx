import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import ReportCaseForm from './ReportCaseForm.jsx';
import { server } from '../../../test/setup/mswServer.js';

// jsdom has no canvas, so photo shrinking is replaced with a pass-through.
vi.mock('../../utils/imageCompress.js', async (orig) => ({
    ...(await orig()),
    compressImage: vi.fn(async (file) => ({ blob: file, name: file.name, width: 800, height: 600 })),
}));

const SLOTS = [
    { id: 41, exam_date: '2099-03-09', exam_day: 'Monday', start_time: '09:30:00', end_time: '11:00:00' },
    { id: 42, exam_date: '2099-03-10', exam_day: 'Tuesday', start_time: '09:30:00', end_time: '11:00:00' },
];
const STUDENTS = [
    { roll_number: '23UCS101', student_name: 'Rahul Sharma', course_code: 'CSE2011', course_name: 'Data Structures', classroom_id: 3, room_name: 'LT-3', seat_number: 'G7' },
    { roll_number: '23UCS102', student_name: 'Meera Nair',   course_code: 'CSE2011', course_name: 'Data Structures', classroom_id: 3, room_name: 'LT-3', seat_number: 'G8' },
    { roll_number: '23UEC201', student_name: 'Karan Gupta',  course_code: 'ECE2031', course_name: 'Signals',         classroom_id: 4, room_name: 'LT-4', seat_number: 'Y1' },
];
const ON_DUTY = [
    { user_id: 7, full_name: 'Asha Verma', employee_id: 'E7', room_name: 'LT-3' },
    { user_id: 9, full_name: 'Ravi Kumar', employee_id: 'E9', room_name: 'LT-4' },
];

let posted, uploaded;
beforeEach(() => {
    posted = null;
    uploaded = null;
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    server.use(
        http.get('/api/exams/available-slots', () => HttpResponse.json(SLOTS)),
        http.get('/api/unfair-means/session-students', () => HttpResponse.json({ success: true, seating_plan: true, students: STUDENTS, on_duty: ON_DUTY })),
        http.post('/api/unfair-means', async ({ request }) => {
            posted = await request.json();
            return HttpResponse.json({ success: true, case: { id: 5, case_number: 'UFM-2099-0005', ...posted, photos: [] } }, { status: 201 });
        }),
        http.post('/api/unfair-means/5/photos', async ({ request }) => {
            uploaded = await request.formData();
            return HttpResponse.json({ success: true, photos: [{ id: 1, caption: 'Chit' }] }, { status: 201 });
        }),
    );
});

async function fillIncident() {
    await userEvent.selectOptions(screen.getByLabelText(/Reported by \(invigilator\)/), '7');
    await userEvent.selectOptions(screen.getByLabelText(/Nature of unfair means/), 'chits_notes');
    await userEvent.type(screen.getByLabelText(/What happened/), 'Chit with formulae found under the answer book.');
    await userEvent.selectOptions(screen.getByLabelText(/Action taken in the hall/), 'answer_book_seized_new_issued');
}

describe('<ReportCaseForm> (examination department)', () => {
    it('blocks submission until the required fields are filled', async () => {
        const onSaved = vi.fn();
        render(<ReportCaseForm onSaved={onSaved} onCancel={vi.fn()} />);
        await userEvent.click(await screen.findByRole('button', { name: 'Record case' }));
        expect(screen.getByText('Choose the exam session.')).toBeInTheDocument();
        expect(screen.getByText('Choose the invigilator who reported it.')).toBeInTheDocument();
        expect(screen.getByText('Choose the nature of unfair means.')).toBeInTheDocument();
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('records a case with photos: session → candidate → reporter → incident → photos', async () => {
        const onSaved = vi.fn();
        render(<ReportCaseForm onSaved={onSaved} onCancel={vi.fn()} />);

        await userEvent.selectOptions(await screen.findByLabelText(/Session where it happened/), '41');
        expect(await screen.findByText('Karan Gupta')).toBeInTheDocument();      // every room by default
        await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by room' }), 'LT-3');
        expect(screen.queryByText('Karan Gupta')).not.toBeInTheDocument();
        await userEvent.type(screen.getByRole('textbox', { name: 'Search candidates' }), '102');
        await userEvent.click(screen.getByText('Meera Nair'));

        // Reporter / witness default to the invigilators on duty in that session.
        expect(within(screen.getByLabelText(/Reported by \(invigilator\)/)).getByRole('option', { name: 'Asha Verma — LT-3' })).toBeInTheDocument();
        await fillIncident();
        await userEvent.selectOptions(screen.getByLabelText(/Witness/), '9');

        const photo = new File(['fake-jpeg'], 'chit.jpg', { type: 'image/jpeg' });
        await userEvent.upload(screen.getByLabelText('Attach evidence photos'), photo);
        await userEvent.type(await screen.findByRole('textbox', { name: 'Caption for photo 1' }), 'Chit');

        await userEvent.click(screen.getByRole('button', { name: 'Record case' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(posted).toMatchObject({
            slot_id: 41,
            roll_number: '23UCS102',
            course_code: 'CSE2011',
            reported_by_user_id: 7,
            witness_user_id: 9,
            category: 'chits_notes',
            action_taken: 'answer_book_seized_new_issued',
        });
        expect(uploaded.getAll('photos')).toHaveLength(1);
        expect(uploaded.getAll('captions')).toEqual(['Chit']);
        expect(uploaded.getAll('widths')).toEqual(['800']);
        const [savedCase, extra] = onSaved.mock.calls[0];
        expect(savedCase.photo_count).toBe(1);
        expect(extra.uploadError).toBeNull();
    });

    it('keeps the case and reports the problem if the photo upload fails', async () => {
        server.use(http.post('/api/unfair-means/5/photos', () => HttpResponse.json({ success: false, message: 'Each photo must be under 5 MB.' }, { status: 400 })));
        const onSaved = vi.fn();
        render(<ReportCaseForm onSaved={onSaved} onCancel={vi.fn()} />);
        await userEvent.selectOptions(await screen.findByLabelText(/Session where it happened/), '41');
        await userEvent.click(await screen.findByText('Rahul Sharma'));
        await fillIncident();
        await userEvent.upload(screen.getByLabelText('Attach evidence photos'), new File(['x'], 'big.jpg', { type: 'image/jpeg' }));
        await screen.findByRole('textbox', { name: 'Caption for photo 1' });
        await userEvent.click(screen.getByRole('button', { name: 'Record case' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(onSaved.mock.calls[0][1].uploadError).toBe('Each photo must be under 5 MB.');
    });

    it('can list every invigilator, e.g. for a flying squad', async () => {
        server.use(http.get('/api/registration/invigilators', () => HttpResponse.json({
            success: true, invigilators: [{ id: 50, full_name: 'Flying Squad Member', employee_id: 'FS1' }],
        })));
        render(<ReportCaseForm onSaved={vi.fn()} onCancel={vi.fn()} />);
        await userEvent.selectOptions(await screen.findByLabelText(/Session where it happened/), '41');
        await screen.findByText('Rahul Sharma');
        const reporter = () => screen.getByLabelText(/Reported by \(invigilator\)/);
        expect(within(reporter()).queryByRole('option', { name: /Flying Squad Member/ })).not.toBeInTheDocument();
        await userEvent.click(screen.getByLabelText(/Show all invigilators/));
        expect(await within(reporter()).findByRole('option', { name: 'Flying Squad Member (FS1)' })).toBeInTheDocument();
    });

    it('shows the server message for a duplicate case', async () => {
        server.use(http.post('/api/unfair-means', () => HttpResponse.json(
            { success: false, message: 'This student already has a case for this session: UFM-2099-0004.' }, { status: 409 },
        )));
        render(<ReportCaseForm onSaved={vi.fn()} onCancel={vi.fn()} />);
        await userEvent.selectOptions(await screen.findByLabelText(/Session where it happened/), '41');
        await userEvent.click(await screen.findByText('Rahul Sharma'));
        await fillIncident();
        await userEvent.click(screen.getByRole('button', { name: 'Record case' }));
        expect(await screen.findByText(/already has a case for this session: UFM-2099-0004/)).toBeInTheDocument();
    });
});
