// ─────────────────────────────────────────────────────────────────────────────
//  Unfair-means (UFM) case vocabulary shared by the invigilator portal, the
//  admin register and the PDF builders. Values mirror the ENUMs in
//  backend/migrations/2026-10-29_unfair_means.sql.
// ─────────────────────────────────────────────────────────────────────────────
import { toDateKey, formatDate, formatWeekday, formatTime } from './invigilationPdf.js';

export const UFM_CATEGORIES = [
    { value: 'chits_notes',             label: 'Chits / written notes' },
    { value: 'electronic_device',       label: 'Mobile phone / electronic device' },
    { value: 'copying_from_candidate',  label: 'Copying from another candidate' },
    { value: 'communication',           label: 'Talking / passing material' },
    { value: 'impersonation',           label: 'Impersonation' },
    { value: 'writing_on_body_or_desk', label: 'Writing on body / desk' },
    { value: 'misbehaviour',            label: 'Misbehaviour with invigilator' },
    { value: 'other',                   label: 'Other' },
];

export const UFM_ACTIONS = [
    { value: 'answer_book_seized_new_issued', label: 'Answer book seized, new one issued' },
    { value: 'answer_book_seized',            label: 'Answer book seized, not allowed to continue' },
    { value: 'warned_allowed_to_continue',    label: 'Warned and allowed to continue' },
    { value: 'sent_out_of_hall',              label: 'Sent out of the examination hall' },
];

export const UFM_STATUSES = [
    { value: 'reported',     label: 'Reported' },
    { value: 'under_review', label: 'Under review' },
    { value: 'action_taken', label: 'Action taken' },
    { value: 'dismissed',    label: 'Dismissed' },
];

export const UFM_DESCRIPTION_MIN = 10;
export const UFM_TEXT_MAX = 2000;

export const labelOf = (list, value) => list.find((x) => x.value === value)?.label || value || '-';

// "Mon, 09 Mar 2026 · 09:30 AM - 11:00 AM"
export function sessionLabel({ exam_date, start_time, end_time }) {
    const key = toDateKey(exam_date);
    return `${formatWeekday(key, true)}, ${formatDate(key)} · ${formatTime(start_time)} - ${formatTime(end_time)}`;
}

export const roomSeatLabel = (c) =>
    [c.room_name, c.seat_number ? `Seat ${c.seat_number}` : null].filter(Boolean).join(' · ') || 'Not seated yet';
