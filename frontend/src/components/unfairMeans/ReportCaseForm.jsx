import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, ImagePlus, Loader2, Search, Trash2, X } from 'lucide-react';
import {
    getSlots,
    getInvigilators,
    getUfmSessionStudents,
    recordUnfairMeansCase,
    updateUnfairMeansCase,
    uploadUfmPhotos,
} from '../../api/api.js';
import {
    UFM_CATEGORIES, UFM_ACTIONS, UFM_DESCRIPTION_MIN, UFM_TEXT_MAX, sessionLabel, roomSeatLabel,
} from '../../utils/unfairMeans.js';
import { toDateKey } from '../../utils/invigilationPdf.js';
import { compressImage, MAX_PHOTOS } from '../../utils/imageCompress.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Record (or edit) an unfair-means case — examination department only.
//
//  Record: 1) the exam session, 2) the candidate (from the students writing in
//  that session — room, seat and course come from the seating plan), 3) the
//  invigilator who reported it (+ optional witness) and the incident, 4)
//  optional evidence photos, shrunk in the browser before upload.
//  Edit (while the case is open): session and candidate are fixed; photos are
//  managed from the case view.
// ─────────────────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40';
const MAX_LISTED = 50;

const pad2 = (n) => String(n).padStart(2, '0');
const nowHHMM = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const errMsg = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

// Default session: today's (the one running now, if any), else none.
function pickDefaultSlot(slots) {
    const today = toDateKey(new Date());
    const todays = slots.filter((s) => toDateKey(s.exam_date) === today);
    if (todays.length === 0) return '';
    const now = nowHHMM();
    const running = todays.find((s) => String(s.start_time).slice(0, 5) <= now && now <= String(s.end_time).slice(0, 5));
    return (running || todays[0]).id;
}

function Step({ n, title, children }) {
    return (
        <section className="rounded-lg border border-border p-4">
            <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text mb-3">
                <span className="w-5 h-5 rounded bg-brand-500 text-white text-[10px] flex items-center justify-center">{n}</span>
                {title}
            </h4>
            {children}
        </section>
    );
}

function Label({ children, required, htmlFor }) {
    return (
        <label htmlFor={htmlFor} className="block text-xs font-semibold text-textMuted mb-1">
            {children}{required && <span className="text-danger"> *</span>}
        </label>
    );
}

export default function ReportCaseForm({ existing = null, onSaved, onCancel }) {
    const isEdit = !!existing;

    // ── Sessions of the active period (record mode) ─────────────────────────
    const [slots, setSlots] = useState({ loaded: isEdit, list: [], error: null });
    const [slotId, setSlotId] = useState(isEdit ? existing.slot_id : '');
    useEffect(() => {
        if (isEdit) return undefined;
        let cancelled = false;
        getSlots()
            .then((res) => {
                if (cancelled) return;
                const list = Array.isArray(res.data) ? res.data : [];
                setSlots({ loaded: true, list, error: null });
                setSlotId((prev) => prev || pickDefaultSlot(list));
            })
            .catch((err) => { if (!cancelled) setSlots({ loaded: true, list: [], error: errMsg(err, 'Could not load the exam sessions.') }); });
        return () => { cancelled = true; };
    }, [isEdit]);

    // ── Candidates + invigilators on duty in the chosen session ─────────────
    const [session, setSession] = useState({ slotId: null, students: [], onDuty: [], seatingPlan: false, error: null });
    useEffect(() => {
        if (isEdit || !slotId) return undefined;
        let cancelled = false;
        getUfmSessionStudents(slotId)
            .then((res) => {
                if (!cancelled) setSession({ slotId, students: res.data.students || [], onDuty: res.data.on_duty || [], seatingPlan: !!res.data.seating_plan, error: null });
            })
            .catch((err) => {
                if (!cancelled) setSession({ slotId, students: [], onDuty: [], seatingPlan: false, error: errMsg(err, 'Could not load the candidates.') });
            });
        return () => { cancelled = true; };
    }, [slotId, isEdit]);
    const sessionLoading = !isEdit && !!slotId && session.slotId !== slotId;

    const [selected, setSelected] = useState(null);
    const [studentQuery, setStudentQuery] = useState('');
    const [roomFilter, setRoomFilter] = useState('all');
    const rooms = useMemo(
        () => Array.from(new Set(session.students.map((s) => s.room_name).filter(Boolean))),
        [session.students]
    );
    const visibleStudents = useMemo(() => {
        let list = session.students;
        if (roomFilter !== 'all') list = list.filter((s) => s.room_name === roomFilter);
        const q = studentQuery.trim().toLowerCase();
        if (q) list = list.filter((s) => s.roll_number.toLowerCase().includes(q) || (s.student_name || '').toLowerCase().includes(q));
        return list;
    }, [session.students, roomFilter, studentQuery]);

    // ── Reporter / witness choices ──────────────────────────────────────────
    // Default: invigilators on duty in the session. "Show all" (or editing, or
    // a session without a duty schedule) lists every registered invigilator.
    const [showAll, setShowAll] = useState(isEdit);
    const [everyone, setEveryone] = useState(null);
    const listAll = showAll || (!isEdit && session.slotId === slotId && !!slotId && session.onDuty.length === 0);
    useEffect(() => {
        if (!listAll || everyone) return undefined;
        let cancelled = false;
        getInvigilators('')
            .then((res) => { if (!cancelled) setEveryone(res.data.invigilators || []); })
            .catch(() => { if (!cancelled) setEveryone([]); });
        return () => { cancelled = true; };
    }, [listAll, everyone]);

    const peopleOptions = useMemo(() => {
        const map = new Map();
        if (listAll) {
            for (const u of everyone || []) map.set(u.id, `${u.full_name}${u.employee_id ? ` (${u.employee_id})` : ''}`);
        } else {
            for (const d of session.onDuty) if (!map.has(d.user_id)) map.set(d.user_id, `${d.full_name} — ${d.room_name}`);
        }
        // Keep the people already on an existing case selectable.
        if (isEdit) {
            if (existing.reported_by && !map.has(existing.reported_by)) map.set(existing.reported_by, existing.reported_by_name);
            if (existing.witness_user_id && !map.has(existing.witness_user_id)) map.set(existing.witness_user_id, existing.witness_name);
        }
        return Array.from(map, ([id, label]) => ({ id, label }));
    }, [listAll, everyone, session.onDuty, isEdit, existing]);

    // ── Incident details ─────────────────────────────────────────────────────
    const [form, setForm] = useState(() => ({
        reported_by_user_id:  existing?.reported_by ? String(existing.reported_by) : '',
        witness_user_id:      existing?.witness_user_id ? String(existing.witness_user_id) : '',
        category:             existing?.category || '',
        incident_time:        existing?.incident_time ? String(existing.incident_time).slice(0, 5) : '',
        description:          existing?.description || '',
        material_seized:      !!existing?.material_seized,
        material_description: existing?.material_description || '',
        action_taken:         existing?.action_taken || '',
        student_statement:    existing?.student_statement || '',
    }));
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

    // ── Photos (record mode) ─────────────────────────────────────────────────
    const [photos, setPhotos] = useState([]);   // [{ key, blob, name, width, height, caption, preview }]
    const [photoBusy, setPhotoBusy] = useState(false);
    const [photoError, setPhotoError] = useState(null);
    const photoInput = useRef(null);
    const photosRef = useRef(photos);
    photosRef.current = photos;
    useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

    const addPhotos = async (fileList) => {
        const files = Array.from(fileList || []);
        if (photoInput.current) photoInput.current.value = '';
        if (files.length === 0) return;
        const room = MAX_PHOTOS - photos.length;
        if (files.length > room) { setPhotoError(`You can attach ${room} more photo${room === 1 ? '' : 's'} (at most ${MAX_PHOTOS}).`); return; }
        setPhotoBusy(true);
        setPhotoError(null);
        try {
            const added = [];
            for (const f of files) {
                const shrunk = await compressImage(f);
                added.push({ ...shrunk, key: `${Date.now()}-${Math.random()}`, caption: '', preview: URL.createObjectURL(shrunk.blob) });
            }
            setPhotos((prev) => [...prev, ...added]);
        } catch (err) {
            setPhotoError(err.message);
        } finally {
            setPhotoBusy(false);
        }
    };
    const removePhoto = (key) => setPhotos((prev) => {
        const gone = prev.find((p) => p.key === key);
        if (gone) URL.revokeObjectURL(gone.preview);
        return prev.filter((p) => p.key !== key);
    });

    // ── Submit ───────────────────────────────────────────────────────────────
    const [attempted, setAttempted] = useState(false);
    const [saving, setSaving] = useState(false);
    const [serverError, setServerError] = useState(null);

    const description = form.description.trim();
    const errors = {
        slot:        !isEdit && !slotId ? 'Choose the exam session.' : null,
        student:     !isEdit && !selected ? 'Choose the candidate.' : null,
        reporter:    !form.reported_by_user_id ? 'Choose the invigilator who reported it.' : null,
        witness:     form.witness_user_id && form.witness_user_id === form.reported_by_user_id ? 'The witness must be someone else.' : null,
        category:    !form.category ? 'Choose the nature of unfair means.' : null,
        description: description.length < UFM_DESCRIPTION_MIN ? `Describe what happened (at least ${UFM_DESCRIPTION_MIN} characters).` : null,
        action:      !form.action_taken ? 'Choose the action taken in the hall.' : null,
    };
    const hasErrors = Object.values(errors).some(Boolean);
    const showErr = (key) => attempted && errors[key] && <p className="text-[11px] text-danger mt-1">{errors[key]}</p>;

    const submit = async (e) => {
        e.preventDefault();
        setAttempted(true);
        setServerError(null);
        if (hasErrors) return;
        const incident = {
            reported_by_user_id: Number(form.reported_by_user_id),
            witness_user_id: form.witness_user_id ? Number(form.witness_user_id) : null,
            category: form.category,
            action_taken: form.action_taken,
            description,
            incident_time: form.incident_time || null,
            material_seized: form.material_seized,
            material_description: form.material_seized ? form.material_description.trim() || null : null,
            student_statement: form.student_statement.trim() || null,
        };
        setSaving(true);
        try {
            if (isEdit) {
                const res = await updateUnfairMeansCase(existing.id, incident);
                onSaved(res.data.case);
                return;
            }
            const res = await recordUnfairMeansCase({ slot_id: Number(slotId), roll_number: selected.roll_number, course_code: selected.course_code, ...incident });
            let saved = res.data.case;
            let uploadError = null;
            if (photos.length > 0) {
                try {
                    const up = await uploadUfmPhotos(saved.id, photos);
                    saved = { ...saved, photos: up.data.photos, photo_count: up.data.photos.length };
                } catch (err) {
                    uploadError = errMsg(err, 'The photos could not be uploaded.');
                }
            }
            onSaved(saved, { uploadError });
        } catch (err) {
            setServerError(errMsg(err, 'Could not save the case.'));
        } finally {
            setSaving(false);
        }
    };

    if (!slots.loaded) return <div className="py-10 text-center text-sm text-textFaint">Loading…</div>;
    if (!isEdit && (slots.error || slots.list.length === 0)) {
        return (
            <div className="py-8 text-center">
                <p className="text-sm text-textMuted">{slots.error || 'The active exam period has no exam sessions yet.'}</p>
                <button type="button" onClick={onCancel} className="mt-4 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-border text-textMuted hover:bg-surface2 cursor-pointer">Close</button>
            </div>
        );
    }

    return (
        <form onSubmit={submit} className="space-y-3" noValidate>
            {/* 1. Session */}
            <Step n={1} title="Exam session">
                {isEdit ? (
                    <p className="text-sm text-text">{sessionLabel(existing)}{existing.room_name ? ` · ${existing.room_name}` : ''}</p>
                ) : (
                    <>
                        <Label htmlFor="ufm-slot" required>Session where it happened</Label>
                        <select id="ufm-slot" value={slotId}
                            onChange={(e) => {
                                setSlotId(e.target.value ? Number(e.target.value) : '');
                                setSelected(null); setStudentQuery(''); setRoomFilter('all');
                                setForm((f) => ({ ...f, reported_by_user_id: '', witness_user_id: '' }));
                            }}
                            className={`${inputCls} cursor-pointer`}>
                            <option value="">Choose a session…</option>
                            {slots.list.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s)}</option>)}
                        </select>
                        {showErr('slot')}
                    </>
                )}
            </Step>

            {/* 2. Candidate */}
            <Step n={2} title="Candidate">
                {isEdit ? (
                    <p className="text-sm text-text">
                        <span className="font-semibold">{existing.student_name}</span>{' '}
                        <span className="font-mono text-textMuted">({existing.roll_number})</span> · {existing.course_code} · {roomSeatLabel(existing)}
                    </p>
                ) : !slotId ? (
                    <p className="text-xs text-textFaint">Choose the session first.</p>
                ) : selected ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-500/40 bg-brand-500/5 px-3 py-2.5">
                        <div className="text-sm">
                            <div className="font-semibold text-text">{selected.student_name} <span className="font-mono text-textMuted">({selected.roll_number})</span></div>
                            <div className="text-[11px] text-textMuted">{selected.course_code}{selected.course_name ? ` — ${selected.course_name}` : ''} · {roomSeatLabel(selected)}</div>
                        </div>
                        <button type="button" onClick={() => setSelected(null)} className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-textMuted hover:text-text cursor-pointer">
                            <X className="w-3.5 h-3.5" /> Change
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textFaint" />
                                <input type="text" value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)}
                                    placeholder="Search by roll number or name…" aria-label="Search candidates"
                                    className={`${inputCls} pl-9`} />
                            </div>
                            {rooms.length > 1 && (
                                <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} aria-label="Filter by room"
                                    className={`${inputCls} w-36 cursor-pointer`}>
                                    <option value="all">All rooms</option>
                                    {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
                                </select>
                            )}
                        </div>
                        <div className="mt-2 text-right text-[11px] text-textMuted">
                            {!sessionLoading && `${visibleStudents.length} candidate${visibleStudents.length === 1 ? '' : 's'}`}
                        </div>
                        {!sessionLoading && !session.error && !session.seatingPlan && session.students.length > 0 && (
                            <p className="mt-1 text-[11px] text-warning">Seat numbers aren&apos;t available for this session yet, so candidates are listed by course without a room or seat.</p>
                        )}
                        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                            {sessionLoading ? (
                                <div className="p-4 text-xs text-textFaint text-center">Loading candidates…</div>
                            ) : session.error ? (
                                <div className="p-4 text-xs text-danger">{session.error}</div>
                            ) : visibleStudents.length === 0 ? (
                                <div className="p-4 text-xs text-textFaint text-center">No candidate matches.</div>
                            ) : (
                                visibleStudents.slice(0, MAX_LISTED).map((s) => (
                                    <button type="button" key={`${s.roll_number}|${s.course_code}`} onClick={() => setSelected(s)}
                                        className="w-full text-left px-3 py-2 hover:bg-surface2 cursor-pointer flex items-center justify-between gap-3">
                                        <span className="min-w-0">
                                            <span className="block text-sm text-text truncate">{s.student_name || '—'} <span className="font-mono text-textMuted">({s.roll_number})</span></span>
                                            <span className="block text-[11px] text-textFaint truncate">{s.course_code}{s.course_name ? ` — ${s.course_name}` : ''}</span>
                                        </span>
                                        <span className="shrink-0 text-[11px] font-mono text-textMuted">{roomSeatLabel(s)}</span>
                                    </button>
                                ))
                            )}
                            {visibleStudents.length > MAX_LISTED && (
                                <div className="p-2 text-[11px] text-textFaint text-center">{visibleStudents.length - MAX_LISTED} more — refine the search.</div>
                            )}
                        </div>
                        {showErr('student')}
                    </>
                )}
            </Step>

            {/* 3. Incident */}
            <Step n={3} title="Incident details">
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <Label htmlFor="ufm-reporter" required>Reported by (invigilator)</Label>
                        <select id="ufm-reporter" value={form.reported_by_user_id} onChange={set('reported_by_user_id')} className={`${inputCls} cursor-pointer`}>
                            <option value="">{listAll && !everyone ? 'Loading…' : 'Choose…'}</option>
                            {peopleOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                        {showErr('reporter')}
                    </div>
                    <div>
                        <Label htmlFor="ufm-witness">Witness (optional)</Label>
                        <select id="ufm-witness" value={form.witness_user_id} onChange={set('witness_user_id')} className={`${inputCls} cursor-pointer`}>
                            <option value="">None</option>
                            {peopleOptions.filter((p) => String(p.id) !== form.reported_by_user_id).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                        {showErr('witness')}
                    </div>
                    {!isEdit && (
                        <label className="sm:col-span-2 -mt-1 inline-flex items-center gap-1.5 text-[11px] text-textMuted cursor-pointer">
                            <input type="checkbox" checked={listAll} disabled={!showAll && listAll} onChange={(e) => setShowAll(e.target.checked)} />
                            {listAll && !showAll
                                ? 'No duty schedule for this session, so every invigilator is listed.'
                                : 'Show all invigilators (e.g. flying squad), not only those on duty in this session'}
                        </label>
                    )}
                    <div>
                        <Label htmlFor="ufm-category" required>Nature of unfair means</Label>
                        <select id="ufm-category" value={form.category} onChange={set('category')} className={`${inputCls} cursor-pointer`}>
                            <option value="">Choose…</option>
                            {UFM_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        {showErr('category')}
                    </div>
                    <div>
                        <Label htmlFor="ufm-time">Time of incident</Label>
                        <div className="flex gap-2">
                            <input id="ufm-time" type="time" value={form.incident_time} onChange={set('incident_time')} className={inputCls} />
                            <button type="button" onClick={() => setForm((f) => ({ ...f, incident_time: nowHHMM() }))}
                                className="inline-flex items-center gap-1 px-3 text-[11px] font-bold uppercase tracking-wider rounded-lg border border-border text-textMuted hover:bg-surface2 cursor-pointer">
                                <Clock className="w-3.5 h-3.5" /> Now
                            </button>
                        </div>
                    </div>
                    <div className="sm:col-span-2">
                        <Label htmlFor="ufm-description" required>What happened</Label>
                        <textarea id="ufm-description" rows={4} maxLength={UFM_TEXT_MAX} value={form.description} onChange={set('description')}
                            placeholder="As written in the invigilator's report: what was seen, where the material was found, how the candidate responded…"
                            className={inputCls} />
                        <div className="flex justify-between">
                            {showErr('description') || <span />}
                            <span className="text-[10px] text-textFaint mt-1">{form.description.length}/{UFM_TEXT_MAX}</span>
                        </div>
                    </div>
                    <div className="sm:col-span-2">
                        <label className="inline-flex items-center gap-2 text-sm text-text cursor-pointer">
                            <input type="checkbox" checked={form.material_seized} onChange={set('material_seized')} />
                            Material was seized (chit, phone, notes…)
                        </label>
                        {form.material_seized && (
                            <input type="text" maxLength={500} value={form.material_description} onChange={set('material_description')}
                                placeholder="What was seized, e.g. one handwritten chit, mobile phone"
                                aria-label="Material seized" className={`${inputCls} mt-2`} />
                        )}
                    </div>
                    <div>
                        <Label htmlFor="ufm-action" required>Action taken in the hall</Label>
                        <select id="ufm-action" value={form.action_taken} onChange={set('action_taken')} className={`${inputCls} cursor-pointer`}>
                            <option value="">Choose…</option>
                            {UFM_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                        </select>
                        {showErr('action')}
                    </div>
                    <div className="sm:col-span-2">
                        <Label htmlFor="ufm-statement">Candidate&apos;s statement (optional)</Label>
                        <textarea id="ufm-statement" rows={2} maxLength={UFM_TEXT_MAX} value={form.student_statement} onChange={set('student_statement')}
                            placeholder="Anything the candidate said or admitted. Leave empty to collect a handwritten statement on the printed report."
                            className={inputCls} />
                    </div>
                </div>
            </Step>

            {/* 4. Photos (record mode; existing cases manage photos from the case view) */}
            {!isEdit && (
                <Step n={4} title={`Evidence photos (optional, up to ${MAX_PHOTOS})`}>
                    <input ref={photoInput} type="file" accept="image/*" multiple className="hidden"
                        aria-label="Attach evidence photos" onChange={(e) => addPhotos(e.target.files)} />
                    {photos.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                            {photos.map((p, i) => (
                                <figure key={p.key} className="relative rounded-lg border border-border overflow-hidden bg-surface2">
                                    <img src={p.preview} alt={`Attached photo ${i + 1}`} className="w-full aspect-[4/3] object-cover" />
                                    <input type="text" maxLength={255} value={p.caption} aria-label={`Caption for photo ${i + 1}`}
                                        onChange={(e) => setPhotos((prev) => prev.map((x) => (x.key === p.key ? { ...x, caption: e.target.value } : x)))}
                                        placeholder="Caption (optional)"
                                        className="w-full px-2 py-1 text-[11px] bg-surface text-text border-t border-border focus:outline-none" />
                                    <button type="button" onClick={() => removePhoto(p.key)} aria-label={`Remove photo ${i + 1}`}
                                        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/60 text-white cursor-pointer">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </figure>
                            ))}
                        </div>
                    )}
                    {photos.length < MAX_PHOTOS && (
                        <button type="button" disabled={photoBusy} onClick={() => photoInput.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg border border-dashed border-brand-500/50 text-brand-500 hover:bg-brand-500/5 disabled:opacity-50 cursor-pointer">
                            {photoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                            {photoBusy ? 'Preparing…' : 'Attach photos'}
                        </button>
                    )}
                    <p className="text-[11px] text-textFaint mt-2">Photos are resized before upload. You can also add or remove photos later from the case.</p>
                    {photoError && <p className="text-[11px] text-danger mt-1">{photoError}</p>}
                </Step>
            )}

            {serverError && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{serverError}</div>}

            <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={onCancel} disabled={saving}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-border text-textMuted hover:bg-surface2 cursor-pointer">
                    Cancel
                </button>
                <button type="submit" disabled={saving || photoBusy}
                    className="px-5 py-2 text-xs font-bold uppercase tracking-widest rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-60 cursor-pointer">
                    {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Record case'}
                </button>
            </div>
        </form>
    );
}
