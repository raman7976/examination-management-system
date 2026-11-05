import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate } from 'react-router-dom';
import { FileText, FileDown, Loader2, CircleCheck } from 'lucide-react';
import {
    getRoleTargets,
    updateRoleTargets,
    getInvigilatorScheduleList,
    updateInvigilatorOverride,
    previewInvigilatorSchedule,
    getInvigilatorSchedule,
    getEligibleInvigilators,
    applyInvigilatorChanges,
    clearInvigilatorSchedule,
    getInvigilationProgress,
} from '../api/api.js';
import { usePeriod } from '../context/usePeriod.js';
import PeriodScopedEmptyState from '../components/PeriodScopedEmptyState.jsx';
import PdfExportMenu from '../components/PdfExportMenu.jsx';
import InvigilationProgress from '../components/InvigilationProgress.jsx';
import Modal from '../components/ui/Modal.jsx';
import { deriveInvigilationSteps, readDraftCount } from '../utils/invigilationProgress.js';
import {
    gridFromSchedule,
    dutiesByInvigilator,
    downloadDutyChart,
    downloadInvigilatorRoster,
    downloadDutyLetters,
    downloadWorkloadSummary,
} from '../utils/invigilationPdf.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ROLES = [
    { key: 'faculty',     label: 'Faculty' },
    { key: 'phd_student', label: 'PhD Student' },
    { key: 'lab_staff',   label: 'Lab Staff' },
];

const ROLE_LABEL = { faculty: 'Faculty', phd_student: 'PhD', lab_staff: 'Lab Staff' };

function formatTime(t) {
    if (!t) return '';
    const [h, m] = String(t).split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${display}:${m} ${ampm}`;
}

function formatDate(dateStr) {
    try {
        return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return dateStr; }
}

const periodMeta = (period) => ({ semesterLabel: period?.semester_label, examType: period?.exam_type });
const pdfError = (err) => toast.error(err?.response?.data?.message || err?.message || 'Could not generate the PDF.');

function BalanceBadge({ balance, isConfigured = true }) {
    if (!isConfigured) return <span className="inline-flex items-center gap-1 bg-surface2 text-textMuted text-[10px] font-bold rounded-full px-2 py-0.5">Not set</span>;
    if (balance === 0) return <span className="inline-flex items-center gap-1 bg-success/10 text-success text-[10px] font-bold rounded-full px-2 py-0.5">On target</span>;
    if (balance > 0)  return <span className="inline-flex items-center gap-1 bg-danger/10 text-danger text-[10px] font-bold rounded-full px-2 py-0.5">+{balance} extra</span>;
    return <span className="inline-flex items-center gap-1 bg-warning/10 text-warning text-[10px] font-bold rounded-full px-2 py-0.5">{balance} deficit</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function InvigilatorScheduling() {
    const [activeTab, setActiveTab] = useState('targets');
    const { activePeriod, periodVersion, periodsLoaded, periodsError } = usePeriod();
    const navigate = useNavigate();

    // ── Workflow progress (tracker above the tabs) ──────────────────────────
    const [progress, setProgress] = useState(null);
    const [progressError, setProgressError] = useState(null);
    const [completeModal, setCompleteModal] = useState(false);

    // Unsaved draft edits: live from the Schedule tab while it is open,
    // otherwise from the draft it persisted to sessionStorage.
    const [liveDraft, setLiveDraft] = useState({ periodId: null, count: 0 });
    const reportDraftCount = useCallback(
        (count) => setLiveDraft({ periodId: activePeriod?.id, count }),
        [activePeriod?.id]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read when leaving the Schedule tab
    const storedDraftCount = useMemo(() => readDraftCount(activePeriod?.id), [activePeriod?.id, activeTab, periodVersion]);
    const draftCount = activeTab === 'schedule' && liveDraft.periodId === activePeriod?.id
        ? liveDraft.count
        : storedDraftCount;

    const refreshProgress = useCallback(async () => {
        try {
            const res = await getInvigilationProgress();
            setProgress(res.data);
            setProgressError(null);
            return res.data;
        } catch (err) {
            setProgressError(err.response?.data?.message || err.message || 'Request failed.');
            return null;
        }
    }, []);

    // Reload on period switch and whenever the admin changes tab (cheap, and it
    // picks up swap requests or seating changes made elsewhere meanwhile).
    useEffect(() => {
        if (activePeriod) refreshProgress();
    }, [activePeriod, periodVersion, activeTab, refreshProgress]);

    const derived = useMemo(() => deriveInvigilationSteps(progress, { draftCount }), [progress, draftCount]);

    const handleAction = (action) => {
        if (action.tab) setActiveTab(action.tab);
        else if (action.route) navigate(action.route);
    };

    // Called by the Schedule tab after Save Changes. Confirms completion with a
    // dialog the first time the schedule becomes complete, and after saving a
    // freshly generated draft (a full re-plan).
    const handleScheduleSaved = async ({ fromGenerate }) => {
        const wasComplete = !!derived?.complete;
        const fresh = await refreshProgress();
        const next = deriveInvigilationSteps(fresh, { draftCount: 0 });
        const confirmed = !!next?.complete && (fromGenerate || !wasComplete);
        if (confirmed) setCompleteModal(true);
        return { next, confirmed };
    };

    // PDFs offered once complete — always built from the saved schedule.
    const fromSaved = (fn) => async () => {
        const res = await getInvigilatorSchedule();
        await fn(gridFromSchedule(res.data.schedule || []), periodMeta(activePeriod));
    };
    const completionPdfItems = [
        { key: 'chart', label: 'Duty chart', description: 'Every session, room and invigilator, with signature column.', onSelect: fromSaved(downloadDutyChart) },
        { key: 'roster', label: 'Invigilator-wise roster', description: 'Alphabetical list with each person\'s duties.', onSelect: fromSaved(downloadInvigilatorRoster) },
        { key: 'letters', label: 'Duty letters (all)', description: 'A formal duty letter for every invigilator.', onSelect: fromSaved(downloadDutyLetters) },
    ];

    return (
        <div className="max-w-full">
            <div className="mb-4">
                <h2 className="text-2xl font-bold text-brand-500 tracking-tight">Invigilator Scheduling</h2>
                <p className="text-sm text-textMuted mt-1">Configure duty targets, manage per-invigilator overrides, and assign invigilators to rooms.</p>
            </div>

            {periodsLoaded && !periodsError && activePeriod && (
                <InvigilationProgress
                    derived={derived}
                    progress={progress}
                    error={progressError}
                    onAction={handleAction}
                    onRetry={refreshProgress}
                    pdfItems={completionPdfItems}
                    onPdfError={pdfError}
                />
            )}

            <ScheduleCompleteModal
                open={completeModal}
                onClose={() => setCompleteModal(false)}
                progress={progress}
                activePeriod={activePeriod}
                pdfItems={completionPdfItems}
                onAction={(action) => { setCompleteModal(false); handleAction(action); }}
            />

            {/* Tab Switcher */}
            <div className="flex gap-1 mb-5 bg-surface2 rounded-lg p-1 w-fit">
                {[
                    { key: 'targets',      label: 'Role Targets' },
                    { key: 'invigilators', label: 'Invigilators' },
                    { key: 'schedule',     label: 'Schedule' },
                ].map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={`px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 cursor-pointer ${
                            activeTab === tab.key ? 'bg-brand-500 text-white shadow-sm' : 'text-textMuted hover:text-text hover:bg-surface/60'
                        }`}>{tab.label}</button>
                ))}
            </div>

            {!periodsLoaded ? (
                <div className="bg-surface rounded-xl border border-border p-12 text-sm text-textFaint text-center shadow-sm">Loading exam periods…</div>
            ) : periodsError ? (
                <div className="bg-danger/10 rounded-xl border border-danger/30 p-4 text-xs text-danger">⚠ {periodsError}</div>
            ) : !activePeriod ? (
                <div className="bg-surface rounded-xl border border-border p-12 text-sm text-textFaint text-center shadow-sm">
                    No active exam period. Go to <b>Registration</b> tab to create one.
                </div>
            ) : (
                <>
                    {activeTab === 'targets'      && <RoleTargetsPanel periodVersion={periodVersion} activePeriod={activePeriod} onSaved={refreshProgress} />}
                    {activeTab === 'invigilators' && <InvigilatorsPanel periodVersion={periodVersion} activePeriod={activePeriod} />}
                    {activeTab === 'schedule'     && (
                        <SchedulePanel
                            periodVersion={periodVersion}
                            activePeriod={activePeriod}
                            onDraftCountChange={reportDraftCount}
                            onSaved={handleScheduleSaved}
                            onChanged={refreshProgress}
                        />
                    )}
                </>
            )}
        </div>
    );
}

// Inline download buttons (a dropdown would be clipped inside the modal).
function PdfButtons({ items }) {
    const [busy, setBusy] = useState(null);
    const run = async (item) => {
        setBusy(item.key);
        try { await item.onSelect(); } catch (err) { pdfError(err); } finally { setBusy(null); }
    };
    return (
        <div className="mt-1.5 flex flex-wrap gap-2">
            {items.map(item => (
                <button key={item.key} type="button" disabled={busy !== null} onClick={() => run(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg border border-brand-500/40 text-brand-500 hover:bg-brand-500/10 disabled:opacity-50 cursor-pointer">
                    {busy === item.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                    {item.label}
                </button>
            ))}
        </div>
    );
}

// Confirmation shown when saving makes the schedule complete.
function ScheduleCompleteModal({ open, onClose, progress, activePeriod, pdfItems, onAction }) {
    const pendingSwaps = progress?.swaps?.pending_admin || 0;
    return (
        <Modal open={open} onClose={onClose} size="lg">
            {progress && (
                <div className="text-center pt-2">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-success/10 text-success flex items-center justify-center">
                        <CircleCheck className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-text">Invigilation schedule complete</h3>
                    <p className="text-sm text-textMuted mt-1">
                        {activePeriod?.semester_label} · <span className="capitalize">{activePeriod?.exam_type}</span>
                    </p>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                        {[
                            ['Duties', progress.schedule.duties],
                            ['Rooms staffed', progress.seating.rooms],
                            ['Invigilators', progress.schedule.invigilators],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-lg bg-surface2 py-2.5">
                                <div className="text-xl font-bold text-text">{value}</div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-textFaint">{label}</div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-5 text-left">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-textMuted mb-2">What happens next</div>
                        <ol className="space-y-2.5 text-sm text-text">
                            <li className="flex gap-2.5">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-brand-500 text-white text-[11px] font-bold flex items-center justify-center">1</span>
                                <div className="flex-1">
                                    <div>Share the duty chart and duty letters.</div>
                                    <PdfButtons items={pdfItems} />
                                </div>
                            </li>
                            <li className="flex gap-2.5">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-brand-500 text-white text-[11px] font-bold flex items-center justify-center">2</span>
                                <div className="flex-1">
                                    Invigilators can already see their duties in their portal. Any swap or cover requests they
                                    make will wait for you in{' '}
                                    <button type="button" onClick={() => onAction({ route: '/dashboard/swap-approval' })}
                                        className="font-semibold text-brand-500 hover:underline cursor-pointer">Swap Approval</button>
                                    {pendingSwaps > 0 && <span className="text-warning font-semibold"> ({pendingSwaps} waiting now)</span>}.
                                </div>
                            </li>
                            <li className="flex gap-2.5">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-brand-500 text-white text-[11px] font-bold flex items-center justify-center">3</span>
                                <div className="flex-1">
                                    After the exams, save this schedule as a permanent record in{' '}
                                    <button type="button" onClick={() => onAction({ route: '/dashboard/past-invigilation' })}
                                        className="font-semibold text-brand-500 hover:underline cursor-pointer">Past Invigilation</button>.
                                </div>
                            </li>
                        </ol>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button type="button" onClick={onClose}
                            className="px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-lg bg-brand-500 text-white hover:bg-brand-600 cursor-pointer">
                            Done
                        </button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Panel 1 — Role Targets
// ═════════════════════════════════════════════════════════════════════════════

function RoleTargetsPanel({ periodVersion, activePeriod, onSaved }) {
    const [targets, setTargets] = useState({ faculty: '', phd_student: '', lab_staff: '' });
    const [updatedAt, setUpdatedAt] = useState({});
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoaded(false);
        setLoadError(null);
        try {
            const res = await getRoleTargets();
            const map = {};
            const ts  = {};
            for (const t of res.data.targets || []) {
                map[t.role] = t.target_duties;
                ts[t.role]  = t.updated_at;
            }
            setTargets({
                faculty:     map.faculty     ?? 0,
                phd_student: map.phd_student ?? 0,
                lab_staff:   map.lab_staff   ?? 0,
            });
            setUpdatedAt(ts);
            setLoaded(true);
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Failed to load role targets.';
            setLoadError(msg);
            toast.error(msg);
        }
    }, []);

    useEffect(() => { load(); /* re-run when period switches */ }, [load, periodVersion]);

    const save = async () => {
        setSaving(true);
        try {
            await updateRoleTargets(ROLES.map(r => ({ role: r.key, target_duties: Number(targets[r.key]) || 0 })));
            toast.success('Role targets saved. Next: generate the schedule on the Schedule tab.', { autoClose: 3500 });
            load();
            onSaved?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed.');
        } finally {
            setSaving(false);
        }
    };

    // Loading placeholder — NEVER renders the zero inputs prematurely
    if (!loaded && !loadError) {
        return (
            <div className="bg-surface rounded-xl shadow-lg border border-border p-8 max-w-2xl text-center">
                <div className="flex flex-col items-center gap-3">
                    <svg className="animate-spin h-7 w-7 text-brand-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    <span className="text-sm text-textMuted font-medium">Loading role targets…</span>
                </div>
            </div>
        );
    }

    // Error state — inline retry, no misleading zeros
    if (loadError) {
        return (
            <div className="bg-surface rounded-xl shadow-lg border border-danger/30 p-6 max-w-2xl">
                <h3 className="text-xs font-bold text-danger uppercase tracking-wider mb-2">⚠ Couldn't load role targets</h3>
                <p className="text-sm text-textMuted mb-3">{loadError}</p>
                <p className="text-[11px] text-textFaint mb-4">If this persists, try signing out and signing back in to refresh your session.</p>
                <button onClick={load}
                    className="text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 cursor-pointer">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="bg-surface rounded-xl shadow-lg border border-border p-6 max-w-2xl">
            <h3 className="text-xs font-bold text-text uppercase tracking-wider mb-1">
                Duty Targets — {activePeriod?.semester_label} · {activePeriod?.exam_type}
            </h3>
            <p className="text-xs text-textMuted mb-5">
                Targets per role for <b>this exam</b>. Cumulative balance across midterm + endterm is shown on the Invigilators tab.
            </p>

            <div className="space-y-4">
                {ROLES.map(r => (
                    <div key={r.key} className="flex items-center gap-4">
                        <label className="w-36 text-sm font-medium text-text">{r.label}</label>
                        <input
                            type="number"
                            min="0"
                            value={targets[r.key]}
                            onChange={(e) => setTargets(prev => ({ ...prev, [r.key]: e.target.value }))}
                            className="w-28 px-3 py-2 text-sm rounded-lg border border-border bg-surface2 text-text
                                focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40"
                        />
                        <span className="text-xs text-textFaint">duties this exam</span>
                        {updatedAt[r.key] && (
                            <span className="text-[10px] text-textFaint ml-auto">
                                updated {new Date(updatedAt[r.key]).toLocaleString()}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            <div className="mt-6 pt-5 border-t border-border flex justify-end">
                <button onClick={save} disabled={saving}
                    className={`px-6 py-2.5 text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm transition-all duration-200 ${
                        saving ? 'bg-textFaint cursor-not-allowed' : 'bg-brand-500 hover:bg-brand-600 cursor-pointer'
                    }`}>
                    {saving ? 'Saving…' : 'Save Targets'}
                </button>
            </div>
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Panel 2 — Invigilators (overrides + balance view)
// ═════════════════════════════════════════════════════════════════════════════

function InvigilatorsPanel({ periodVersion, activePeriod }) {
    const [list, setList] = useState([]);
    const [siblingMeta, setSiblingMeta] = useState(null); // { id, exam_type }
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState({}); // user_id → draft override value

    const load = useCallback(async (q) => {
        setLoading(true);
        try {
            const res = await getInvigilatorScheduleList(q || '');
            setList(res.data.invigilators || []);
            setSiblingMeta(res.data.sibling_period || null);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load invigilators.');
        } finally {
            setLoading(false);
        }
    }, []);

    // One effect for both the period switch and the (debounced) search, so the
    // list loads once on mount and a period switch keeps the current search.
    useEffect(() => {
        const t = setTimeout(() => load(search), search ? 350 : 0);
        return () => clearTimeout(t);
    }, [search, load, periodVersion]);

    const cancelEdit = (userId) =>
        setEditing(prev => { const next = { ...prev }; delete next[userId]; return next; });

    const saveOverride = async (inv, raw) => {
        const val = raw === '' || raw === null ? null : Number(raw);
        try {
            // Send the existing note back, otherwise the upsert would clear it.
            await updateInvigilatorOverride(inv.user_id, { override_target: val, note: inv.note ?? null });
            toast.success(val === null ? 'Override removed.' : 'Override saved.', { autoClose: 1500 });
            cancelEdit(inv.user_id);
            load(search);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed.');
        }
    };

    // Enter and click-away both commit through onBlur; Escape blurs with this
    // flag set so the edit is discarded instead of saved.
    const skipBlurSaveRef = useRef(false);
    const commitOverride = (inv, raw) => {
        if (skipBlurSaveRef.current) {
            skipBlurSaveRef.current = false;
            cancelEdit(inv.user_id);
            return;
        }
        if (String(raw ?? '') === String(inv.override_target ?? '')) {
            cancelEdit(inv.user_id);
            return;
        }
        saveOverride(inv, raw);
    };

    const downloadWorkload = async () => {
        // Always the full list — the on-screen search must not trim the record.
        const res = await getInvigilatorScheduleList('');
        await downloadWorkloadSummary(res.data.invigilators || [], periodMeta(res.data.active_period || activePeriod), {
            siblingExamType: res.data.sibling_period?.exam_type || null,
        });
    };

    const downloadLetterFor = async (inv) => {
        const res = await getInvigilatorSchedule();
        const grid = gridFromSchedule(res.data.schedule || []);
        const mine = dutiesByInvigilator(grid).find(p => p.person.user_id === inv.user_id);
        if (!mine) {
            toast.info(`${inv.full_name} has no saved duties in this exam period.`);
            return;
        }
        await downloadDutyLetters(grid, periodMeta(activePeriod), {
            onlyKeys: [inv.user_id],
            fileLabel: inv.full_name,
        });
    };

    const resetOverride = async (userId) => {
        try {
            await updateInvigilatorOverride(userId, { override_target: null });
            toast.success('Override reset.', { autoClose: 1500 });
            load(search);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Reset failed.');
        }
    };

    const stats = useMemo(() => {
        const total = list.length;
        const totalAssignedActive = list.reduce((s, i) => s + (i.assigned_count || 0), 0);
        const totalTargetActive   = list.reduce((s, i) => s + (i.effective_target || 0), 0);
        const totalAssignedCum    = list.reduce((s, i) => s + (i.cumulative_assigned || 0), 0);
        const totalTargetCum      = list.reduce((s, i) => s + (i.cumulative_target || 0), 0);
        const deficit       = list.filter(i => i.balance < 0).length;
        const extra         = list.filter(i => i.balance > 0).length;
        return { total, totalAssignedActive, totalTargetActive, totalAssignedCum, totalTargetCum, deficit, extra };
    }, [list]);

    const activeType  = activePeriod?.exam_type;
    const siblingType = siblingMeta?.exam_type;

    return (
        <div className="bg-surface rounded-xl shadow-lg border border-border overflow-hidden">
            {/* Stats banner */}
            <div className="px-5 py-3 border-b border-border flex items-center gap-4 text-xs flex-wrap">
                <span className="text-textMuted">Total invigilators: <b className="text-text">{stats.total}</b></span>
                <span className="text-textFaint">·</span>
                <span className="text-textMuted">
                    <span className="capitalize">{activeType}</span> assigned/target: <b className="text-text">{stats.totalAssignedActive} / {stats.totalTargetActive}</b>
                </span>
                <span className="text-textFaint">·</span>
                <span className="text-textMuted">
                    Cumulative (semester): <b className="text-text">{stats.totalAssignedCum} / {stats.totalTargetCum}</b>
                </span>
                <span className="text-textFaint">·</span>
                <span className="text-warning">{stats.deficit} in deficit</span>
                <span className="text-textFaint">·</span>
                <span className="text-danger">{stats.extra} with extra duties</span>
                <div className="ml-auto">
                    <PdfExportMenu
                        label="Workload PDF"
                        disabled={stats.total === 0}
                        disabledReason="No invigilators registered."
                        onError={pdfError}
                        items={[{
                            key: 'workload',
                            label: 'Workload summary',
                            description: 'Targets vs assigned duties for every invigilator, with the semester roll-up.',
                            onSelect: downloadWorkload,
                        }]}
                    />
                </div>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-border">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, email, employee ID or department…"
                    className="w-full px-4 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-slate-400
                        focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40"
                />
            </div>

            {/* Table */}
            <div className="max-h-[560px] overflow-y-auto">
                {loading ? (
                    <div className="p-10 text-sm text-textFaint text-center">Loading…</div>
                ) : list.length === 0 ? (
                    <div className="p-10 text-sm text-textFaint text-center">No invigilators found.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-surface2 z-[5]">
                            <tr className="text-[11px] font-bold text-textMuted uppercase tracking-wider">
                                <th className="px-4 py-2.5 text-left">Name</th>
                                <th className="px-3 py-2.5 text-left">Role</th>
                                <th className="px-3 py-2.5 text-right">Default ({activeType})</th>
                                <th className="px-3 py-2.5 text-right">Override ({activeType})</th>
                                <th className={`px-3 py-2.5 text-right ${activeType === 'midterm' ? 'border-l-2 border-brand-500/40 bg-brand-500/5' : ''}`}>Midterm A/T</th>
                                <th className={`px-3 py-2.5 text-right ${activeType === 'endterm' ? 'border-l-2 border-brand-500/40 bg-brand-500/5' : ''}`}>Endterm A/T</th>
                                <th className="px-3 py-2.5 text-right">Cumulative A/T</th>
                                <th className="px-3 py-2.5 text-center">Balance</th>
                                <th className="px-3 py-2.5 text-right pr-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {list.map(inv => {
                                const isEditing = editing[inv.user_id] !== undefined;
                                // Compute the per-period (A/T) cells from the API shape
                                const midA = activeType === 'midterm' ? inv.assigned_count : (siblingType === 'midterm' ? inv.sibling_assigned : 0);
                                const midT = activeType === 'midterm' ? inv.effective_target : (siblingType === 'midterm' ? inv.sibling_target : 0);
                                const endA = activeType === 'endterm' ? inv.assigned_count : (siblingType === 'endterm' ? inv.sibling_assigned : 0);
                                const endT = activeType === 'endterm' ? inv.effective_target : (siblingType === 'endterm' ? inv.sibling_target : 0);
                                return (
                                    <tr key={inv.user_id} className="hover:bg-surface2">
                                        <td className="px-4 py-2.5">
                                            <div className="font-medium text-text text-[13px]">{inv.full_name}</div>
                                            <div className="text-[10px] text-textFaint">{inv.employee_id || '—'} · {inv.department || '—'}</div>
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-textMuted">{ROLE_LABEL[inv.role] || inv.role}</td>
                                        <td className="px-3 py-2.5 text-right text-xs text-textMuted">{inv.role_target ?? 0}</td>
                                        <td className="px-3 py-2.5 text-right">
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    min="0"
                                                    autoFocus
                                                    value={editing[inv.user_id]}
                                                    onChange={(e) => setEditing(prev => ({ ...prev, [inv.user_id]: e.target.value }))}
                                                    onBlur={(e) => commitOverride(inv, e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') e.currentTarget.blur();
                                                        if (e.key === 'Escape') { skipBlurSaveRef.current = true; e.currentTarget.blur(); }
                                                    }}
                                                    className="w-20 px-2 py-1 text-xs rounded border border-brand-500/40 focus:outline-none focus:ring-1 focus:ring-brand-500/30 text-right"
                                                />
                                            ) : (
                                                <button onClick={() => setEditing(prev => ({ ...prev, [inv.user_id]: inv.override_target ?? '' }))}
                                                    className={`text-xs font-mono px-2 py-1 rounded cursor-pointer ${inv.override_target != null ? 'bg-brand-500/10 text-brand-500 font-bold' : 'text-textFaint hover:bg-surface2'}`}>
                                                    {inv.override_target ?? '—'}
                                                </button>
                                            )}
                                        </td>
                                        <td className={`px-3 py-2.5 text-right text-xs ${activeType === 'midterm' ? 'border-l-2 border-brand-500/40 bg-brand-500/5 font-bold' : 'text-textMuted'}`}>
                                            {midA}<span className="text-textFaint"> / {midT}</span>
                                        </td>
                                        <td className={`px-3 py-2.5 text-right text-xs ${activeType === 'endterm' ? 'border-l-2 border-brand-500/40 bg-brand-500/5 font-bold' : 'text-textMuted'}`}>
                                            {endA}<span className="text-textFaint"> / {endT}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-xs font-semibold text-text">
                                            {inv.cumulative_assigned}<span className="text-textFaint"> / {inv.cumulative_target}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-center"><BalanceBadge balance={inv.balance} isConfigured={inv.is_configured ?? (inv.cumulative_target > 0)} /></td>
                                        <td className="px-3 py-2.5 text-right pr-4">
                                            <div className="inline-flex items-center gap-1.5">
                                                {inv.override_target != null && (
                                                    <button onClick={() => resetOverride(inv.user_id)}
                                                        className="text-[10px] font-bold uppercase tracking-wider text-textMuted hover:text-brand-500 border border-border hover:border-brand-500 px-2 py-1 rounded cursor-pointer">
                                                        Reset
                                                    </button>
                                                )}
                                                {inv.assigned_count > 0 && (
                                                    <button
                                                        onClick={() => downloadLetterFor(inv).catch(pdfError)}
                                                        title={`Download duty letter for ${inv.full_name} (PDF)`}
                                                        aria-label={`Download duty letter for ${inv.full_name}`}
                                                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-500 border border-brand-500/30 hover:bg-brand-500 hover:text-white px-2 py-1 rounded cursor-pointer">
                                                        <FileText className="w-3 h-3" /> Letter
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Panel 3 — Schedule (Generate / View / Edit)
// ═════════════════════════════════════════════════════════════════════════════

const emptyDraft = () => ({ reassigns: {}, removes: new Set(), adds: [], generated: false });
const draftFromJson = (parsed) => ({
    reassigns: parsed.reassigns || {},
    removes:   new Set(parsed.removes || []),
    adds:      Array.isArray(parsed.adds) ? parsed.adds : [],
    generated: !!parsed.generated,   // the draft came from Generate Draft (a full re-plan)
});

function SchedulePanel({ periodVersion, activePeriod, onDraftCountChange, onSaved, onChanged }) {
    const { registerDirtyCheck } = usePeriod();
    const [schedule, setSchedule] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [expandedSlots, setExpandedSlots] = useState({});
    const [swapModal, setSwapModal] = useState(null); // { slotId, room, assignment? }
    const [warnings, setWarnings] = useState([]);
    const [invSearch, setInvSearch] = useState('');

    // ── Draft-mode state ────────────────────────────────────────────────────
    // reassigns: { [assignment_id]: { new_user_id, user_data } }
    // removes:   Set<assignment_id>
    // adds:      [{ tempId, slot_id, classroom_id, user_id, user_data }]
    //
    // Persisted to sessionStorage keyed by period id so drafts survive tab
    // navigation (Invigilator Scheduling → Seating Arrangement → back), page
    // refresh, and accidental component unmounts. Cleared on Save / Discard /
    // explicit Clear Schedule.
    const draftKey = activePeriod ? `inv_sched_draft_p${activePeriod.id}` : null;

    const initialPending = (() => {
        if (!draftKey) return emptyDraft();
        try {
            const raw = sessionStorage.getItem(draftKey);
            return raw ? draftFromJson(JSON.parse(raw)) : emptyDraft();
        } catch {
            return emptyDraft();
        }
    })();

    const [pending, setPending] = useState(initialPending);
    const [saving, setSaving] = useState(false);
    const [clearing, setClearing] = useState(false);

    const pendingCount =
        Object.keys(pending.reassigns).length + pending.removes.size + pending.adds.length;

    const resetPending = () => setPending(emptyDraft());

    // Persist drafts to sessionStorage on every change (Set→Array for JSON).
    useEffect(() => {
        if (!draftKey) return;
        try {
            if (pendingCount === 0) {
                sessionStorage.removeItem(draftKey);
            } else {
                sessionStorage.setItem(draftKey, JSON.stringify({
                    reassigns: pending.reassigns,
                    removes:   Array.from(pending.removes),
                    adds:      pending.adds,
                    generated: pending.generated,
                }));
            }
        } catch { /* sessionStorage may be full or disabled — non-fatal */ }
    }, [draftKey, pending, pendingCount]);

    // Keep the page-level progress tracker in step with the draft.
    useEffect(() => { onDraftCountChange?.(pendingCount); }, [pendingCount, onDraftCountChange]);

    // When activePeriod changes WHILE this component stays mounted (i.e. the
    // user switched periods from Registration but we're still here), rehydrate
    // the draft for the new period from its sessionStorage slot.
    const prevDraftKey = React.useRef(draftKey);
    useEffect(() => {
        if (prevDraftKey.current === draftKey) return;
        prevDraftKey.current = draftKey;
        if (!draftKey) {
            setPending(emptyDraft());
            return;
        }
        try {
            const raw = sessionStorage.getItem(draftKey);
            setPending(raw ? draftFromJson(JSON.parse(raw)) : emptyDraft());
        } catch {
            setPending(emptyDraft());
        }
    }, [draftKey]);

    // C1: register a dirty check so PeriodContext can prompt before switching.
    // The check is recomputed via a ref so we don't re-register on every keystroke.
    const pendingRef = React.useRef(pending);
    pendingRef.current = pending;
    useEffect(() => {
        const check = () => {
            const p = pendingRef.current;
            const n = Object.keys(p.reassigns).length + p.removes.size + p.adds.length;
            return n > 0
                ? `You have ${n} unsaved schedule change(s). Switching periods will discard them. Continue?`
                : false;
        };
        return registerDirtyCheck(check);
    }, [registerDirtyCheck]);

    const load = useCallback(async () => {
        setLoading(true);
        setWarnings([]); // S10: stale warnings from a previous Generate should not linger
        try {
            const res = await getInvigilatorSchedule();
            setSchedule(res.data.schedule || []);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load schedule.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Refetch the schedule whenever the period changes. We DO NOT call
    // resetPending() here because:
    //   • drafts are now persisted in sessionStorage keyed by period id;
    //   • switching periods is guarded by the dirty-check (PeriodContext);
    //   • when the user returns to the prior period, the draft for it is
    //     restored from sessionStorage automatically via initialPending.
    useEffect(() => { load(); }, [load, periodVersion]);

    const handleGenerate = async () => {
        const label = activePeriod ? `${activePeriod.semester_label} — ${activePeriod.exam_type}` : 'the active period';
        let msg = `Generate a fresh draft schedule for ${label}?\n\nThis stages a complete replacement in memory — nothing is saved to the database until you click Save Changes.`;
        if (pendingCount > 0) msg += `\n\n⚠ You already have ${pendingCount} unsaved change(s). They will be discarded.`;
        if (!window.confirm(msg)) return;
        setGenerating(true);
        try {
            const res = await previewInvigilatorSchedule({ period_id: activePeriod?.id });
            const proposals = res.data?.assignments || [];

            // Stage the proposals as a draft on top of the current schedule:
            //   • every CURRENT assignment for this period → pending.removes
            //   • every PROPOSED assignment → pending.adds (with a temp id)
            // When Save Changes is clicked, applyChanges runs removes → adds in
            // one transaction, exactly like the old "generate & save" did.
            const existingIds = new Set();
            for (const slot of schedule)
                for (const room of slot.rooms)
                    for (const inv of room.invigilators)
                        existingIds.add(inv.assignment_id);

            let tempSeed = -Date.now();
            const newAdds = proposals.map(p => ({
                tempId: tempSeed--,
                slot_id:      p.slot_id,
                classroom_id: p.classroom_id,
                user_id:      p.user_id,
                // CRITICAL: carry is_course_instructor through so the ★ marker
                // and Phase-A vs Phase-B colouring survive Generate Draft.
                is_course_instructor: !!p.is_course_instructor,
                user_data: {
                    user_id:     p.user_id,
                    full_name:   p.full_name,
                    role:        p.role,
                    employee_id: p.employee_id,
                },
            }));

            setPending({
                reassigns: {},
                removes: existingIds,
                adds:    newAdds,
                generated: true,
            });
            setWarnings(res.data.warnings || []);
            toast.success(res.data.message || 'Draft generated. Review and click Save Changes when ready.', { autoClose: 3500 });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Generate failed.');
        } finally {
            setGenerating(false);
        }
    };

    // ── Staging helpers (no API calls) ──────────────────────────────────────
    const stagePick = (slotId, room, assignment, newUserId, newUserData) => {
        if (assignment) {
            // Reassign existing chip
            if (assignment.assignment_id < 0) {
                // It was a pending-add — mutate its entry in adds
                setPending(prev => ({
                    ...prev,
                    adds: prev.adds.map(a =>
                        a.tempId === assignment.assignment_id
                            ? { ...a, user_id: newUserId, user_data: newUserData }
                            : a
                    ),
                }));
            } else {
                setPending(prev => ({
                    ...prev,
                    reassigns: { ...prev.reassigns, [assignment.assignment_id]: { new_user_id: newUserId, user_data: newUserData } },
                }));
            }
        } else {
            // Brand new add for this room
            const tempId = -Date.now() - Math.floor(Math.random() * 1000);
            setPending(prev => ({
                ...prev,
                adds: [...prev.adds, { tempId, slot_id: slotId, classroom_id: room.classroom_id, user_id: newUserId, user_data: newUserData }],
            }));
        }
    };

    const stageRemove = (assignment) => {
        if (assignment.assignment_id < 0) {
            // Drop the pending-add entirely
            setPending(prev => ({ ...prev, adds: prev.adds.filter(a => a.tempId !== assignment.assignment_id) }));
        } else {
            setPending(prev => {
                const reassigns = { ...prev.reassigns };
                delete reassigns[assignment.assignment_id];
                const removes = new Set(prev.removes);
                removes.add(assignment.assignment_id);
                return { ...prev, removes, reassigns };
            });
        }
    };

    const undoRemove = (inv, slot) => {
        // After Generate Draft the old chips are all staged for removal and the
        // same people may already be re-staged elsewhere in this slot — reviving
        // the old chip would double-book them and make Save fail.
        const clash = slot.rooms.find(r => r.invigilators.some(i =>
            i.user_id === inv.user_id && i._status !== 'removed' && i.assignment_id !== inv.assignment_id));
        if (clash) {
            toast.error(`${inv.full_name} is already placed in ${clash.room_name} in this slot.`);
            return;
        }
        setPending(prev => {
            const removes = new Set(prev.removes);
            removes.delete(inv.assignment_id);
            return { ...prev, removes };
        });
    };

    // ── Save (commit) / Discard ─────────────────────────────────────────────
    const handleSave = async () => {
        if (pendingCount === 0) return;
        setSaving(true);
        try {
            const payload = {
                period_id: activePeriod?.id, // S3: pin to the period this UI was showing
                reassigns: Object.entries(pending.reassigns).map(([id, v]) => ({
                    assignment_id: Number(id), user_id: v.new_user_id,
                })),
                removes: Array.from(pending.removes),
                adds: pending.adds.map(a => ({
                    slot_id: a.slot_id, classroom_id: a.classroom_id, user_id: a.user_id,
                })),
            };
            const res = await applyInvigilatorChanges(payload);
            const fromGenerate = pending.generated;
            resetPending();
            await load();
            // The page re-checks the workflow; if the schedule just became
            // complete it shows a confirmation dialog instead of a toast.
            const outcome = await onSaved?.({ fromGenerate });
            if (!outcome?.confirmed) {
                const next = outcome?.next;
                if (next?.complete) {
                    toast.success('Schedule saved. Every room is fully staffed: the schedule is complete.', { autoClose: 4000 });
                } else if (next?.current) {
                    toast.success(`Schedule saved. Still to do: ${next.current.detail}`, { autoClose: 5000 });
                } else {
                    toast.success(res.data.message || 'Saved.', { autoClose: 2500 });
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed — nothing was applied.');
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => {
        if (pendingCount === 0) return;
        if (!window.confirm(`Discard all ${pendingCount} unsaved change(s)?`)) return;
        resetPending();
    };

    const handleClear = async () => {
        const totalAssigned = schedule.reduce((s, sl) => s + sl.rooms.reduce((a, r) => a + r.invigilators.length, 0), 0);
        if (totalAssigned === 0) {
            toast.info?.('Schedule is already empty.', { autoClose: 1500 });
            return;
        }
        const label = activePeriod ? `${activePeriod.semester_label} — ${activePeriod.exam_type}` : 'the active period';
        let msg = `Permanently delete the saved schedule for ${label} (${totalAssigned} assignment(s))? Other periods are untouched.`;
        if (pendingCount > 0) msg += `\n\n⚠ Your ${pendingCount} unsaved change(s) will also be discarded.`;
        if (!window.confirm(msg)) return;
        if (!window.confirm('This cannot be undone. Confirm once more?')) return;

        setClearing(true);
        try {
            const res = await clearInvigilatorSchedule(activePeriod?.id);
            toast.success(res.data.message || 'Schedule cleared.', { autoClose: 2500 });
            resetPending();
            setWarnings([]);
            await load();
            onChanged?.();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Clear failed.');
        } finally {
            setClearing(false);
        }
    };

    // ── Warn on browser-close with unsaved edits ────────────────────────────
    useEffect(() => {
        if (pendingCount === 0) return;
        const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [pendingCount]);

    // ── effectiveSchedule = server data + pending edits applied ─────────────
    const effectiveSchedule = useMemo(() => {
        return schedule.map(slot => ({
            ...slot,
            rooms: slot.rooms.map(room => {
                const baseInvigilators = room.invigilators.map(inv => {
                    const reassigned = pending.reassigns[inv.assignment_id];
                    const isRemoved = pending.removes.has(inv.assignment_id);
                    if (reassigned) {
                        return {
                            ...inv,
                            user_id:              reassigned.user_data.user_id,
                            full_name:            reassigned.user_data.full_name,
                            role:                 reassigned.user_data.role,
                            employee_id:          reassigned.user_data.employee_id,
                            // We can't know client-side whether the NEW user
                            // teaches a course in this room without an extra
                            // round-trip. The backend recomputes the real flag
                            // on Save (isInstructorForRoom in applyChanges /
                            // reassignAssignment). For the draft preview, fall
                            // back to false — the ★ will reappear after Save.
                            is_course_instructor: false,
                            _status: 'reassigned',
                        };
                    }
                    if (isRemoved) return { ...inv, _status: 'removed' };
                    return inv;
                });
                const addedHere = pending.adds
                    .filter(a => a.slot_id === slot.slot_id && a.classroom_id === room.classroom_id)
                    .map(a => ({
                        assignment_id:        a.tempId,
                        user_id:              a.user_data.user_id,
                        full_name:            a.user_data.full_name,
                        role:                 a.user_data.role,
                        employee_id:          a.user_data.employee_id,
                        // Preserve the algorithm's instructor flag so the ★
                        // shows up on staged Phase-A placements.
                        is_course_instructor: !!a.is_course_instructor,
                        _status:              'added',
                    }));
                return { ...room, invigilators: [...baseInvigilators, ...addedHere] };
            }),
        }));
    }, [schedule, pending]);

    // Duties per person in the draft (saved + staged, minus staged removals) —
    // what the edit modal shows, so counts stay right while editing.
    const draftCounts = useMemo(() => {
        const m = new Map();
        for (const s of effectiveSchedule)
            for (const r of s.rooms)
                for (const i of r.invigilators)
                    if (i._status !== 'removed') m.set(i.user_id, (m.get(i.user_id) || 0) + 1);
        return m;
    }, [effectiveSchedule]);

    // For the modal's slot: who is already placed there (and where), and how
    // many duties each person has on the same day — both from the draft.
    const modalContext = useMemo(() => {
        if (!swapModal) return null;
        const excludeId = swapModal.assignment?.assignment_id;
        const slot = effectiveSchedule.find(s => s.slot_id === swapModal.slotId);
        const placedInSlot = new Map();
        const sameDay = new Map();
        if (slot) {
            for (const s of effectiveSchedule) {
                if (s.exam_date !== slot.exam_date) continue;
                for (const r of s.rooms) {
                    for (const i of r.invigilators) {
                        if (i._status === 'removed' || i.assignment_id === excludeId) continue;
                        sameDay.set(i.user_id, (sameDay.get(i.user_id) || 0) + 1);
                        if (s.slot_id === slot.slot_id) placedInSlot.set(i.user_id, r.room_name);
                    }
                }
            }
        }
        return { placedInSlot, sameDay };
    }, [swapModal, effectiveSchedule]);

    // ── PDF export (always from the SAVED schedule) ─────────────────────────
    const savedGrid = useMemo(() => gridFromSchedule(schedule), [schedule]);
    const hasSavedDuties = useMemo(
        () => schedule.some(s => s.rooms.some(r => r.invigilators.length > 0)),
        [schedule]
    );
    const exportItems = [
        {
            key: 'chart',
            label: 'Duty chart',
            description: 'Session-wise chart of every room and invigilator, with signature column. One page per exam day.',
            onSelect: () => downloadDutyChart(savedGrid, periodMeta(activePeriod)),
        },
        {
            key: 'roster',
            label: 'Invigilator-wise roster',
            description: 'Alphabetical list of invigilators with each of their duties.',
            onSelect: () => downloadInvigilatorRoster(savedGrid, periodMeta(activePeriod)),
        },
        {
            key: 'letters',
            label: 'Duty letters (all)',
            description: 'A formal duty letter for every invigilator, one per page.',
            onSelect: () => downloadDutyLetters(savedGrid, periodMeta(activePeriod)),
        },
    ];

    const totalsBySlot = useMemo(() => effectiveSchedule.map(s => ({
        slot_id:        s.slot_id,
        total_required: s.rooms.reduce((a, r) => a + r.required, 0),
        // exclude pending-removes from assigned totals
        total_assigned: s.rooms.reduce((a, r) => a + r.invigilators.filter(i => i._status !== 'removed').length, 0),
    })), [effectiveSchedule]);

    // ── Search filter ───────────────────────────────────────────────────────
    const matchesQuery = useCallback((inv, q) =>
        inv.full_name?.toLowerCase().includes(q) ||
        inv.employee_id?.toLowerCase().includes(q),
    []);

    const filteredSchedule = useMemo(() => {
        const q = invSearch.trim().toLowerCase();
        if (!q) return effectiveSchedule;
        return effectiveSchedule
            .map(slot => ({
                ...slot,
                rooms: slot.rooms.filter(r => r.invigilators.some(i => matchesQuery(i, q))),
            }))
            .filter(slot => slot.rooms.length > 0);
    }, [effectiveSchedule, invSearch, matchesQuery]);

    const matchCount = useMemo(() => {
        const q = invSearch.trim().toLowerCase();
        if (!q) return 0;
        let n = 0;
        for (const s of effectiveSchedule)
            for (const r of s.rooms)
                for (const i of r.invigilators)
                    if (matchesQuery(i, q)) n++;
        return n;
    }, [effectiveSchedule, invSearch, matchesQuery]);

    const lcQuery = invSearch.trim().toLowerCase();

    return (
        <div>
            {/* Action bar */}
            <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                <div className="text-xs text-textMuted">
                    Schedule for <b className="text-brand-500">{activePeriod?.semester_label} — {activePeriod?.exam_type}</b>
                    {' · '}
                    {schedule.length === 0 ? 'no schedule yet, click Generate' : `${schedule.length} slot(s) loaded`}
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => { load(); onChanged?.(); }} disabled={loading}
                        className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-border text-textMuted hover:bg-surface2 cursor-pointer">
                        Refresh
                    </button>
                    <PdfExportMenu
                        items={exportItems}
                        disabled={!hasSavedDuties || pendingCount > 0}
                        disabledReason={pendingCount > 0
                            ? 'Save or discard your unsaved changes first: PDFs are generated from the saved schedule.'
                            : 'There is no saved schedule to export yet.'}
                        onError={pdfError}
                    />
                    <button onClick={handleClear} disabled={clearing || schedule.length === 0}
                        className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all duration-200 ${
                            clearing || schedule.length === 0
                                ? 'border-border text-textFaint cursor-not-allowed'
                                : 'border-danger/40 text-danger hover:bg-danger hover:text-white hover:border-danger/50 cursor-pointer'
                        }`}
                        title="Permanently delete the entire saved schedule">
                        {clearing ? 'Clearing…' : 'Clear Schedule'}
                    </button>
                    <button onClick={handleGenerate} disabled={generating}
                        className={`px-5 py-2 text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm transition-all duration-200 ${
                            generating ? 'bg-textFaint cursor-not-allowed' : 'bg-brand-500 hover:bg-brand-600 cursor-pointer'
                        }`}>
                        {generating ? 'Generating…' : 'Generate Draft'}
                    </button>
                </div>
            </div>

            {/* Invigilator search */}
            {schedule.length > 0 && (
                <div className="mb-4 bg-surface rounded-xl border border-border px-4 py-3 shadow-sm">
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textFaint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        <input type="text" value={invSearch} onChange={(e) => setInvSearch(e.target.value)}
                            placeholder="Search for an invigilator by name or employee ID…"
                            className="w-full pl-10 pr-9 py-2 text-sm rounded-lg border border-border bg-surface2 text-text placeholder-slate-400
                                focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/40" />
                        {invSearch && (
                            <button onClick={() => setInvSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-textFaint hover:text-textMuted cursor-pointer">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                    {invSearch && (
                        <div className="mt-2 text-[11px] text-textMuted">
                            {matchCount === 0
                                ? <span className="text-warning">No matches.</span>
                                : <span><b className="text-brand-500">{matchCount}</b> assignment{matchCount !== 1 ? 's' : ''} across <b className="text-brand-500">{filteredSchedule.length}</b> slot{filteredSchedule.length !== 1 ? 's' : ''}.</span>
                            }
                        </div>
                    )}
                </div>
            )}

            {/* Unsaved changes banner — sticky at top */}
            {pendingCount > 0 && (
                <div className="sticky top-0 z-30 mb-4 -mx-1 px-4 py-3 rounded-lg shadow-md flex items-center justify-between flex-wrap gap-2 bg-gradient-to-r from-warning/15 to-warning/25">
                    <div className="flex items-center gap-3 text-xs">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-warning text-white font-bold text-[11px]">{pendingCount}</span>
                        <div>
                            <div className="font-bold text-warning">Unsaved changes</div>
                            <div className="text-[11px] text-warning">
                                {pending.adds.length > 0       && <span className="mr-2">+{pending.adds.length} added</span>}
                                {Object.keys(pending.reassigns).length > 0 && <span className="mr-2">↺ {Object.keys(pending.reassigns).length} reassigned</span>}
                                {pending.removes.size > 0      && <span>− {pending.removes.size} removed</span>}
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleDiscard} disabled={saving}
                            className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded border border-warning/50 text-warning hover:bg-warning/30 disabled:opacity-50 cursor-pointer">
                            Discard
                        </button>
                        <button onClick={handleSave} disabled={saving}
                            className={`px-5 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded text-white shadow-sm ${
                                saving ? 'bg-warning/30 cursor-not-allowed' : 'bg-warning hover:bg-warning cursor-pointer'
                            }`}>
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
                <div className="mb-4 p-3 bg-warning/10 border border-warning/30 rounded-lg">
                    <div className="text-xs font-bold text-warning mb-1">⚠ Warnings ({warnings.length})</div>
                    <ul className="text-[11px] text-warning list-disc list-inside space-y-0.5">
                        {warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
                        {warnings.length > 10 && <li>… and {warnings.length - 10} more.</li>}
                    </ul>
                </div>
            )}

            {/* Schedule */}
            {loading ? (
                <div className="bg-surface rounded-xl border border-border p-12 text-sm text-textFaint text-center shadow-sm">Loading…</div>
            ) : schedule.length === 0 ? (
                <PeriodScopedEmptyState noun="invigilator assignments">
                    Click <b className="text-text">Generate Draft</b> to build the schedule for this period
                    (requires at least one slot with a saved seating plan). Or switch to another period
                    that already has a saved schedule.
                </PeriodScopedEmptyState>
            ) : filteredSchedule.length === 0 ? (
                <div className="bg-surface rounded-xl border border-border p-12 text-sm text-textFaint text-center shadow-sm">
                    No invigilators match <b>"{invSearch}"</b>.
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredSchedule.map((slot) => {
                        const idx = schedule.findIndex(s => s.slot_id === slot.slot_id);
                        // When searching, force-expand the filtered slots so matches are visible.
                        const isOpen = lcQuery ? true : expandedSlots[slot.slot_id] !== false;
                        const totals = totalsBySlot[idx];
                        return (
                            <div key={slot.slot_id} className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden">
                                <div className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-surface2/60"
                                    onClick={() => setExpandedSlots(prev => ({ ...prev, [slot.slot_id]: !isOpen }))}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isOpen ? 'bg-brand-500 text-white' : 'bg-surface2 text-textFaint'}`}>
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d={isOpen ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'} />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-text">{slot.exam_day}, {formatDate(slot.exam_date)}</div>
                                            <div className="text-[11px] text-textFaint">{formatTime(slot.start_time)} – {formatTime(slot.end_time)} · {slot.rooms.length} room(s)</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded ${totals.total_assigned >= totals.total_required ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                                            {totals.total_assigned} / {totals.total_required} assigned
                                        </span>
                                    </div>
                                </div>

                                {isOpen && (
                                    <div className="border-t border-border">
                                        <table className="w-full text-sm">
                                            <thead className="bg-surface2/60">
                                                <tr className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                                                    <th className="px-5 py-2 text-left">Room</th>
                                                    <th className="px-3 py-2 text-left">Courses</th>
                                                    <th className="px-3 py-2 text-right">Students</th>
                                                    <th className="px-3 py-2 text-right">Required</th>
                                                    <th className="px-3 py-2 text-left">Invigilators</th>
                                                    <th className="px-3 py-2 text-right pr-5">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {slot.rooms.map(room => {
                                                    const liveCount = room.invigilators.filter(i => i._status !== 'removed').length;
                                                    const ok = liveCount >= room.required;
                                                    return (
                                                        <tr key={room.classroom_id} className={room.orphaned ? 'bg-danger/5' : 'hover:bg-surface2/40'}>
                                                            <td className="px-5 py-2.5 font-mono text-xs font-bold text-text">
                                                                {room.room_name}
                                                                {room.orphaned && (
                                                                    <span className="ml-2 font-sans text-[9px] font-bold uppercase tracking-wider text-danger bg-danger/10 px-1.5 py-0.5 rounded"
                                                                        title="This room no longer has any seated exam in this slot (seating was changed after the schedule was saved).">
                                                                        No seating
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-[11px] text-textMuted truncate max-w-[180px]">
                                                                {room.orphaned
                                                                    ? <span className="italic text-danger">No exam here — remove these duties</span>
                                                                    : room.course_codes}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right text-xs text-textMuted">{room.orphaned ? '—' : room.students}</td>
                                                            <td className={`px-3 py-2.5 text-right text-xs font-bold ${room.orphaned ? 'text-textFaint' : ok ? 'text-success' : 'text-warning'}`}>{room.orphaned ? '—' : room.required}</td>
                                                            <td className="px-3 py-2.5">
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {room.invigilators.length === 0 && <span className="text-[10px] text-textFaint italic">unassigned</span>}
                                                                    {room.invigilators.map(inv => {
                                                                        const isMatch      = lcQuery && matchesQuery(inv, lcQuery);
                                                                        const isAdded      = inv._status === 'added';
                                                                        const isReassign   = inv._status === 'reassigned';
                                                                        const isRemoved    = inv._status === 'removed';
                                                                        const isInstructor = !!inv.is_course_instructor;

                                                                        const onClickChip = isRemoved
                                                                            ? () => undoRemove(inv, slot)
                                                                            : () => setSwapModal({ slotId: slot.slot_id, room, assignment: inv });

                                                                        // Styling precedence:
                                                                        //   removed (strikethrough) > instructor (maroon ★) > added (emerald) > reassigned (amber) > match > default.
                                                                        // Instructor styling DOMINATES added/reassigned, but we layer a coloured
                                                                        // ring around the chip so the user can still see it's a draft change.
                                                                        let cls;
                                                                        if (isRemoved) {
                                                                            cls = 'bg-surface2 text-textFaint border border-dashed border-borderStrong line-through hover:bg-danger/10 hover:text-danger hover:border-danger/40';
                                                                        } else if (isInstructor) {
                                                                            const baseCi = 'bg-brand-500/10 text-brand-500';
                                                                            const draftRing = isAdded
                                                                                ? ' border-2 border-success/30 ring-2 ring-emerald-200/60'
                                                                                : isReassign
                                                                                    ? ' border-2 border-warning/30 ring-2 ring-amber-200/60'
                                                                                    : ' border border-brand-500/30 hover:bg-brand-500/20';
                                                                            cls = baseCi + draftRing;
                                                                        } else if (isAdded) {
                                                                            cls = 'bg-success/10 text-success border border-success/50 hover:bg-success/15';
                                                                        } else if (isReassign) {
                                                                            cls = 'bg-warning/10 text-warning border border-warning/50 hover:bg-warning/15';
                                                                        } else if (isMatch) {
                                                                            cls = 'bg-warning/15 text-warning border border-warning/50 ring-2 ring-amber-300/60';
                                                                        } else {
                                                                            cls = 'bg-surface2 text-text border border-border hover:bg-brand-500/10 hover:border-brand-500/30 hover:text-brand-500';
                                                                        }

                                                                        const title = isRemoved
                                                                            ? 'Pending removal — click to undo'
                                                                            : isInstructor && isAdded
                                                                                ? '★ Course instructor (pending add) — click to edit'
                                                                                : isInstructor && isReassign
                                                                                    ? '★ Course instructor (pending reassign) — click to edit'
                                                                                    : isInstructor
                                                                                        ? '★ Course instructor — click to reassign or remove'
                                                                                        : isAdded
                                                                                            ? 'Pending add — click to edit'
                                                                                            : isReassign
                                                                                                ? 'Pending reassignment — click to edit'
                                                                                                : 'Click to reassign or remove';

                                                                        return (
                                                                            <button key={inv.assignment_id} onClick={onClickChip}
                                                                                className={`group inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${cls}`}
                                                                                title={title}>
                                                                                {/* ★ ALWAYS shows for instructor placements, regardless of draft state */}
                                                                                {isInstructor && !isRemoved && <span className="text-[10px]">★</span>}
                                                                                {!isInstructor && isAdded    && <span className="text-[8px] font-bold">+</span>}
                                                                                {!isInstructor && isReassign && <span className="text-[8px] font-bold">↺</span>}
                                                                                {inv.full_name}
                                                                                <span className="text-[8px] opacity-50">({ROLE_LABEL[inv.role]})</span>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right pr-5">
                                                                <button onClick={() => setSwapModal({ slotId: slot.slot_id, room })}
                                                                    className="text-[10px] font-bold uppercase tracking-wider text-brand-500 border border-brand-500/30 hover:bg-brand-500 hover:text-white px-2.5 py-1 rounded cursor-pointer">
                                                                    + Add
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {swapModal && (
                <AssignmentModal
                    slotId={swapModal.slotId}
                    room={swapModal.room}
                    assignment={swapModal.assignment || null}
                    placedInSlot={modalContext.placedInSlot}
                    sameDay={modalContext.sameDay}
                    draftCounts={draftCounts}
                    onPick={(userId, userData) => {
                        stagePick(swapModal.slotId, swapModal.room, swapModal.assignment || null, userId, userData);
                        setSwapModal(null);
                    }}
                    onRemove={() => {
                        if (swapModal.assignment) stageRemove(swapModal.assignment);
                        setSwapModal(null);
                    }}
                    onClose={() => setSwapModal(null)}
                />
            )}
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
//  AssignmentModal — handles BOTH add (assignment=null) and swap (assignment!=null)
//   • Search by name / employee_id / department
//   • Role filter pills (All / Faculty / PhD / Lab Staff)
//   • Footer: "Remove this invigilator" button when in swap mode
// ═════════════════════════════════════════════════════════════════════════════

const ROLE_FILTERS = [
    { key: 'all',          label: 'All' },
    { key: 'faculty',      label: 'Faculty' },
    { key: 'phd_student',  label: 'PhD' },
    { key: 'lab_staff',    label: 'Lab Staff' },
];

// Availability is decided against the DRAFT, not the saved schedule: the server
// returns everyone (include_busy) and the parent passes who is already placed
// in this slot once staged adds / removals are applied (placedInSlot), plus
// draft duty counts and same-day load for each person.
function AssignmentModal({ slotId, room, assignment, placedInSlot, sameDay, draftCounts, onPick, onRemove, onClose }) {
    const isSwap = !!assignment;
    const [everyone, setEveryone] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    useEffect(() => {
        (async () => {
            try {
                const res = await getEligibleInvigilators(slotId, undefined, { includeBusy: true });
                setEveryone(res.data.eligible || []);
            } catch (err) {
                toast.error(err.response?.data?.message || 'Failed to load eligible invigilators.');
            } finally {
                setLoading(false);
            }
        })();
    }, [slotId]);

    const eligible = useMemo(() => everyone
        .filter(e => !placedInSlot.has(e.user_id))
        .map(e => {
            const assigned = draftCounts.get(e.user_id) || 0;
            return { ...e, assigned_count: assigned, balance: assigned - e.effective_target, same_day: sameDay.get(e.user_id) || 0 };
        }), [everyone, placedInSlot, draftCounts, sameDay]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return eligible.filter(e => {
            if (roleFilter !== 'all' && e.role !== roleFilter) return false;
            if (!q) return true;
            return (
                e.full_name?.toLowerCase().includes(q) ||
                e.employee_id?.toLowerCase().includes(q) ||
                e.department?.toLowerCase().includes(q)
            );
        });
    }, [eligible, search, roleFilter]);

    const pick = (userId, userData) => onPick(userId, userData);

    const removeCurrent = () => {
        if (!isSwap) return;
        if (!window.confirm(`Stage removal of ${assignment.full_name} from ${room.room_name}? Click Save Changes when ready to commit.`)) return;
        onRemove();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
            <div className="bg-surface rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-text">
                            {isSwap ? `Replace ${assignment.full_name}` : 'Add Invigilator'}
                        </h3>
                        <p className="text-[11px] text-textFaint mt-0.5">
                            Room <b>{room.room_name}</b> · {room.students} students · needs {room.required}
                            {isSwap && assignment.is_course_instructor && <span className="ml-2 text-brand-500 font-semibold">★ course instructor</span>}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-textFaint hover:text-textMuted cursor-pointer">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-5 py-3 border-b border-border space-y-2">
                    <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
                        placeholder="Search by name, employee ID or department…"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface2 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />

                    {/* Role filter pills */}
                    <div className="flex gap-1 bg-surface2 rounded-lg p-1 w-fit">
                        {ROLE_FILTERS.map(rf => (
                            <button key={rf.key} onClick={() => setRoleFilter(rf.key)}
                                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all duration-200 cursor-pointer ${
                                    roleFilter === rf.key ? 'bg-brand-500 text-white shadow-sm' : 'text-textMuted hover:text-text hover:bg-surface/60'
                                }`}>{rf.label}</button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-10 text-sm text-textFaint text-center">Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div className="p-10 text-sm text-textFaint text-center">No eligible invigilators match.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-surface2">
                                <tr className="text-[10px] font-bold text-textMuted uppercase tracking-wider">
                                    <th className="px-4 py-2 text-left">Name</th>
                                    <th className="px-3 py-2 text-left">Role</th>
                                    <th className="px-3 py-2 text-right">Assigned / Target</th>
                                    <th className="px-3 py-2 text-center">Balance</th>
                                    <th className="px-3 py-2 text-right pr-4"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filtered.map(inv => {
                                    const isCurrent = isSwap && inv.user_id === assignment.user_id;
                                    return (
                                        <tr key={inv.user_id} className={`${isCurrent ? 'bg-brand-500/5' : 'hover:bg-surface2'}`}>
                                            <td className="px-4 py-2">
                                                <div className="text-[13px] font-medium text-text flex items-center gap-1.5">
                                                    {inv.full_name}
                                                    {isCurrent && <span className="text-[9px] font-bold text-brand-500 bg-brand-500/10 px-1.5 py-0.5 rounded">CURRENT</span>}
                                                </div>
                                                <div className="text-[10px] text-textFaint">
                                                    {inv.employee_id || '—'} · {inv.department || '—'}
                                                    {inv.same_day > 0 && (
                                                        <span className="ml-1.5 text-warning font-semibold">
                                                            · {inv.same_day} other dut{inv.same_day === 1 ? 'y' : 'ies'} that day
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-xs text-textMuted">{ROLE_LABEL[inv.role] || inv.role}</td>
                                            <td className="px-3 py-2 text-right text-xs">{inv.assigned_count} / {inv.effective_target}</td>
                                            <td className="px-3 py-2 text-center"><BalanceBadge balance={inv.balance} /></td>
                                            <td className="px-3 py-2 text-right pr-4">
                                                <button disabled={isCurrent} onClick={() => pick(inv.user_id, inv)}
                                                    className="text-[10px] font-bold uppercase tracking-wider bg-brand-500 text-white hover:bg-brand-600 disabled:bg-textFaint disabled:cursor-not-allowed px-3 py-1 rounded cursor-pointer">
                                                    {isCurrent ? 'Current' : (isSwap ? 'Replace' : 'Assign')}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer — Remove button only in swap mode */}
                {isSwap && (
                    <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                        <button onClick={removeCurrent}
                            className="text-[11px] font-bold uppercase tracking-wider text-danger hover:text-white hover:bg-danger border border-danger/30 hover:border-danger/50 px-3 py-1.5 rounded transition-all cursor-pointer">
                            Remove this invigilator
                        </button>
                        <button onClick={onClose}
                            className="text-[11px] font-semibold text-textMuted hover:text-text cursor-pointer">
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default InvigilatorScheduling;
