import StatusBadge from '../StatusBadge.jsx';
import { UFM_CATEGORIES, UFM_ACTIONS, labelOf, sessionLabel, roomSeatLabel } from '../../utils/unfairMeans.js';
import { formatTime } from '../../utils/invigilationPdf.js';

// Read-only view of one unfair-means case (invigilator portal + admin register).

const stamp = (v) => (v
    ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—');

function Field({ label, children, wide = false }) {
    return (
        <div className={wide ? 'sm:col-span-2' : ''}>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-textFaint">{label}</dt>
            <dd className="text-sm text-text mt-0.5 whitespace-pre-wrap break-words">{children || '—'}</dd>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section className="rounded-lg border border-border p-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-brand-500 mb-3">{title}</h4>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
        </section>
    );
}

export default function CaseDetails({ c }) {
    const closed = c.status === 'action_taken' || c.status === 'dismissed';
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <div className="font-mono text-sm font-bold text-text">{c.case_number}</div>
                    <div className="text-[11px] text-textFaint">
                        Recorded {stamp(c.created_at)}{c.recorded_by_name ? ` by ${c.recorded_by_name}` : ''}
                    </div>
                </div>
                <StatusBadge status={c.status} />
            </div>

            <Section title="Candidate">
                <Field label="Name">{c.student_name}</Field>
                <Field label="Roll number"><span className="font-mono">{c.roll_number}</span></Field>
                <Field label="Course">{[c.course_code, c.course_name].filter(Boolean).join(' — ')}</Field>
                <Field label="Room / seat">{roomSeatLabel(c)}</Field>
                <Field label="Exam session" wide>{sessionLabel(c)} · {c.semester_label} ({c.exam_type})</Field>
            </Section>

            <Section title="Incident">
                <Field label="Nature of unfair means">{labelOf(UFM_CATEGORIES, c.category)}</Field>
                <Field label="Time of incident">{c.incident_time ? formatTime(c.incident_time) : 'Not recorded'}</Field>
                <Field label="What happened" wide>{c.description}</Field>
                <Field label="Material seized">
                    {c.material_seized ? `Yes${c.material_description ? ` — ${c.material_description}` : ''}` : 'No'}
                </Field>
                <Field label="Action taken in the hall">{labelOf(UFM_ACTIONS, c.action_taken)}</Field>
                <Field label="Reported by (invigilator)">{c.reported_by_name}</Field>
                <Field label="Witness">{c.witness_name || 'None'}</Field>
                <Field label="Candidate's statement" wide>{c.student_statement || 'Not recorded'}</Field>
            </Section>

            {(closed || c.decision_note) && (
                <Section title="Examination department">
                    <Field label="Decision" wide>{c.decision_note}</Field>
                    {c.decided_at && <Field label="Decided on">{stamp(c.decided_at)}</Field>}
                </Section>
            )}
        </div>
    );
}
