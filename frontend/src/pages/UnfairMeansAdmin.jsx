import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Search, FileDown, Plus, Pencil, Camera, Loader2 } from 'lucide-react';
import { listUnfairMeansCases, getUnfairMeansCase, reviewUnfairMeansCase, getUfmPhotoBlob } from '../api/api.js';
import { usePeriod } from '../context/usePeriod.js';
import Modal from '../components/ui/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import CaseDetails from '../components/unfairMeans/CaseDetails.jsx';
import PhotoGallery from '../components/unfairMeans/PhotoGallery.jsx';
import ReportCaseForm from '../components/unfairMeans/ReportCaseForm.jsx';
import { UFM_CATEGORIES, UFM_STATUSES, UFM_TEXT_MAX, labelOf, sessionLabel, roomSeatLabel } from '../utils/unfairMeans.js';
import { downloadUnfairMeansReport, downloadUnfairMeansRegister } from '../utils/unfairMeansPdf.js';
import { blobToDataUrl } from '../utils/imageCompress.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Unfair Means register — examination department only.
//
//  The exam department records each case from the invigilator's report
//  (with evidence photos), reviews it, and records the decision. Closing a
//  case (action taken / dismissed) needs a decision note and locks its
//  details and photos; setting it back to "Under review" re-opens it.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [{ value: 'all', label: 'All' }, ...UFM_STATUSES];
const FINAL = ['action_taken', 'dismissed'];
const errMsg = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

function ReviewPanel({ c, onSaved }) {
    const [status, setStatus] = useState(c.status);
    const [note, setNote] = useState(c.decision_note || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const needsNote = FINAL.includes(status) && !note.trim();
    const unchanged = status === c.status && note.trim() === (c.decision_note || '');

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await reviewUnfairMeansCase(c.id, { status, decision_note: note.trim() || null });
            onSaved(res.data.case);
        } catch (err) {
            setError(errMsg(err, 'Could not save the review.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="mt-3 rounded-lg border border-brand-500/30 bg-brand-500/5 p-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-brand-500 mb-3">Review</h4>
            <div className="grid gap-3 sm:grid-cols-3">
                <div>
                    <label htmlFor="ufm-review-status" className="block text-xs font-semibold text-textMuted mb-1">Status</label>
                    <select id="ufm-review-status" value={status} onChange={(e) => setStatus(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text cursor-pointer">
                        {UFM_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="ufm-review-note" className="block text-xs font-semibold text-textMuted mb-1">
                        Decision / note{FINAL.includes(status) && <span className="text-danger"> *</span>}
                    </label>
                    <textarea id="ufm-review-note" rows={2} maxLength={UFM_TEXT_MAX} value={note} onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. Paper cancelled as per the UFM committee meeting of 12 Mar."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text" />
                </div>
            </div>
            {needsNote && <p className="text-[11px] text-warning mt-1">Record the decision before closing the case.</p>}
            {FINAL.includes(status) && !FINAL.includes(c.status) && (
                <p className="text-[11px] text-textFaint mt-1">Closing the case locks its details and photos (re-open it to change them).</p>
            )}
            {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
            <div className="mt-3 flex justify-end">
                <button type="button" onClick={save} disabled={saving || needsNote || unchanged}
                    className="px-5 py-2 text-xs font-bold uppercase tracking-widest rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                    {saving ? 'Saving…' : 'Save review'}
                </button>
            </div>
        </section>
    );
}

// Photo blobs → data URLs for the PDF annexure.
async function photosForPdf(c) {
    const out = [];
    for (const p of c.photos || []) {
        const res = await getUfmPhotoBlob(c.id, p.id);
        out.push({ dataUrl: await blobToDataUrl(res.data), width: p.width, height: p.height, caption: p.caption });
    }
    return out;
}

export default function UnfairMeansAdmin() {
    const { activePeriod, periodVersion } = usePeriod();
    const [scope, setScope] = useState('active');      // 'active' | 'all'
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('all');
    const [data, setData] = useState({ cases: [], counts: {} });
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(null);

    const [viewing, setViewing] = useState(null);      // full case (with photos) in the details modal
    const [formFor, setFormFor] = useState(null);      // null | 'new' | case being edited
    const [downloading, setDownloading] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await listUnfairMeansCases({
                q: query.trim(),
                status: status === 'all' ? '' : status,
                periodId: scope === 'all' ? 'all' : '',
            });
            setData({ cases: res.data.cases || [], counts: res.data.counts || {} });
            setError(null);
        } catch (err) {
            setError(errMsg(err, 'Failed to load cases.'));
        } finally {
            setLoaded(true);
        }
    }, [query, status, scope]);

    useEffect(() => {
        const t = setTimeout(load, query ? 300 : 0);
        return () => clearTimeout(t);
    }, [load, query, periodVersion]);

    const open = async (row) => {
        setViewing({ ...row, photos: row.photos || null });
        try {
            const res = await getUnfairMeansCase(row.id);
            setViewing(res.data.case);
        } catch (err) {
            toast.error(errMsg(err, 'Could not load the case.'));
        }
    };

    const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
    const scopeLabel = scope === 'all' ? 'All exam periods' : activePeriod ? `${activePeriod.semester_label} · ${activePeriod.exam_type}` : 'Active period';

    const onReviewed = (updated) => {
        setViewing(updated);
        toast.success(`${updated.case_number} is now “${labelOf(UFM_STATUSES, updated.status)}”.`);
        load();
    };

    const onSaved = (saved, { uploadError } = {}) => {
        const isNew = formFor === 'new';
        setFormFor(null);
        setViewing({ ...saved, photos: saved.photos || [] });
        if (uploadError) toast.warning(`${saved.case_number} was recorded, but the photos failed: ${uploadError} Add them from the case.`);
        else toast.success(isNew ? `Case ${saved.case_number} recorded.` : `${saved.case_number} updated.`);
        load();
    };

    const downloadReport = async (c) => {
        setDownloading(true);
        try {
            await downloadUnfairMeansReport(c, { photos: await photosForPdf(c) });
        } catch {
            toast.error('Could not generate the PDF.');
        } finally {
            setDownloading(false);
        }
    };

    const downloadRegister = () => downloadUnfairMeansRegister(data.cases, {
        semesterLabel: scope === 'all' ? null : activePeriod?.semester_label,
        examType: scope === 'all' ? null : activePeriod?.exam_type,
        // The period is already the subtitle; the note lists only extra filters.
        scopeNote: [
            scope === 'all' ? 'All exam periods' : null,
            status !== 'all' ? `Status: ${labelOf(UFM_STATUSES, status)}` : null,
            query.trim() ? `Search: "${query.trim()}"` : null,
        ].filter(Boolean).join(' · ') || undefined,
    }).catch(() => toast.error('Could not generate the PDF.'));

    return (
        <div className="max-w-full">
            <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
                <div>
                    <h2 className="text-2xl font-bold text-brand-500 tracking-tight">Unfair Means Register</h2>
                    <p className="text-sm text-textMuted mt-1">Record cases from the invigilators&apos; reports, attach evidence, and record the decision.</p>
                </div>
                <div className="flex gap-2">
                    <button type="button" onClick={downloadRegister} disabled={data.cases.length === 0}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-brand-500/40 text-brand-500 hover:bg-brand-500/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                        <FileDown className="w-3.5 h-3.5" /> Register PDF
                    </button>
                    <button type="button" onClick={() => setFormFor('new')} disabled={!activePeriod}
                        title={activePeriod ? undefined : 'Activate an exam period first'}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 shadow-sm cursor-pointer">
                        <Plus className="w-4 h-4" /> Record a case
                    </button>
                </div>
            </div>

            <div className="bg-surface rounded-xl border border-border shadow-sm p-4 mb-4 space-y-3">
                <div className="flex gap-3 flex-wrap items-center">
                    <div className="flex gap-1 bg-surface2 rounded-lg p-1" role="group" aria-label="Exam period scope">
                        {[['active', 'Active period'], ['all', 'All periods']].map(([v, l]) => (
                            <button key={v} type="button" onClick={() => setScope(v)} aria-pressed={scope === v}
                                className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md cursor-pointer ${
                                    scope === v ? 'bg-brand-500 text-white' : 'text-textMuted hover:text-text'}`}>{l}</button>
                        ))}
                    </div>
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textFaint" />
                        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by roll number, name, course, room, invigilator or case number…" aria-label="Search cases"
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40" />
                    </div>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
                    {STATUS_FILTERS.map((s) => (
                        <button key={s.value} type="button" onClick={() => setStatus(s.value)} aria-pressed={status === s.value}
                            className={`px-3 py-1.5 rounded-full text-[11px] font-bold border cursor-pointer ${
                                status === s.value ? 'bg-brand-500 text-white border-brand-500' : 'bg-surface text-textMuted border-border hover:border-brand-500/50'
                            }`}>
                            {s.label} <span className="opacity-70">({s.value === 'all' ? total : data.counts[s.value] ?? 0})</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-surface rounded-xl border border-border shadow-sm overflow-x-auto">
                {!loaded ? (
                    <div className="p-10 text-center text-sm text-textFaint">Loading…</div>
                ) : error ? (
                    <div className="p-6 text-sm text-danger">{error}</div>
                ) : data.cases.length === 0 ? (
                    <div className="p-10 text-center">
                        <p className="text-sm text-textMuted">
                            {total === 0 && !query ? `No unfair-means cases have been recorded (${scopeLabel}).` : 'No cases match these filters.'}
                        </p>
                        {total === 0 && !query && <p className="text-xs text-textFaint mt-1">Use “Record a case” when an invigilator hands in an unfair-means report.</p>}
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-surface2">
                            <tr className="text-[10px] font-bold uppercase tracking-wider text-textMuted text-left">
                                <th className="px-4 py-2.5">Case</th>
                                <th className="px-3 py-2.5">Session</th>
                                <th className="px-3 py-2.5">Candidate</th>
                                <th className="px-3 py-2.5">Course</th>
                                <th className="px-3 py-2.5">Room · seat</th>
                                <th className="px-3 py-2.5">Nature</th>
                                <th className="px-3 py-2.5">Reported by</th>
                                <th className="px-3 py-2.5">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.cases.map((c) => (
                                <tr key={c.id} onClick={() => open(c)} className="hover:bg-surface2 cursor-pointer align-top">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <div className="font-mono text-xs font-bold text-text">{c.case_number}</div>
                                        {c.photo_count > 0 && (
                                            <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-textFaint" title="Evidence photos">
                                                <Camera className="w-3 h-3" /> {c.photo_count}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-3 text-xs text-textMuted whitespace-nowrap">{sessionLabel(c)}</td>
                                    <td className="px-3 py-3">
                                        <div className="text-sm text-text">{c.student_name || '—'}</div>
                                        <div className="text-[11px] font-mono text-textFaint">{c.roll_number}</div>
                                    </td>
                                    <td className="px-3 py-3 text-xs text-textMuted">{c.course_code}</td>
                                    <td className="px-3 py-3 text-xs text-textMuted whitespace-nowrap">{roomSeatLabel(c)}</td>
                                    <td className="px-3 py-3 text-xs text-textMuted">{labelOf(UFM_CATEGORIES, c.category)}</td>
                                    <td className="px-3 py-3 text-xs text-textMuted">{c.reported_by_name}</td>
                                    <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Case view */}
            <Modal open={!!viewing && !formFor} onClose={() => setViewing(null)} title="Unfair-means case" size="xl">
                {viewing && (
                    <div className="space-y-3">
                        <CaseDetails c={viewing} />
                        {viewing.photos ? (
                            <PhotoGallery
                                caseId={viewing.id}
                                photos={viewing.photos}
                                editable={!viewing.is_closed}
                                onChange={(photos) => { setViewing((v) => ({ ...v, photos, photo_count: photos.length })); load(); }}
                            />
                        ) : (
                            <div className="rounded-lg border border-border p-4 text-xs text-textFaint">Loading photos…</div>
                        )}
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => downloadReport(viewing)} disabled={downloading || !viewing.photos}
                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-brand-500/40 text-brand-500 hover:bg-brand-500/10 disabled:opacity-50 cursor-pointer">
                                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} Download report
                            </button>
                            {!viewing.is_closed && (
                                <button type="button" onClick={() => setFormFor(viewing)}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-border text-textMuted hover:bg-surface2 cursor-pointer">
                                    <Pencil className="w-3.5 h-3.5" /> Edit details
                                </button>
                            )}
                        </div>
                        <ReviewPanel key={`${viewing.id}-${viewing.status}`} c={viewing} onSaved={onReviewed} />
                    </div>
                )}
            </Modal>

            {/* Record / edit */}
            <Modal open={!!formFor} onClose={() => setFormFor(null)} dismissible={false}
                title={formFor === 'new' ? 'Record an unfair-means case' : `Edit ${formFor?.case_number || ''}`} size="xl">
                {formFor && (
                    <ReportCaseForm
                        // Fresh form state per case: the modal keeps its content
                        // mounted while animating closed, and re-opening it during
                        // that window would otherwise reuse the previous form.
                        key={formFor === 'new' ? 'new' : `edit-${formFor.id}`}
                        existing={formFor === 'new' ? null : formFor}
                        onSaved={onSaved}
                        onCancel={() => setFormFor(null)}
                    />
                )}
            </Modal>
        </div>
    );
}
