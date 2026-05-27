import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
    getRoleTargets,
    updateRoleTargets,
    getInvigilatorScheduleList,
    updateInvigilatorOverride,
    generateInvigilatorSchedule,
    getInvigilatorSchedule,
    getEligibleInvigilators,
    applyInvigilatorChanges,
    clearInvigilatorSchedule,
} from '../api/api.js';
import { usePeriod } from '../context/usePeriod.js';

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

function BalanceBadge({ balance, isConfigured = true }) {
    if (!isConfigured) return <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full px-2 py-0.5">Not set</span>;
    if (balance === 0) return <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full px-2 py-0.5">On target</span>;
    if (balance > 0)  return <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-[10px] font-bold rounded-full px-2 py-0.5">+{balance} extra</span>;
    return <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full px-2 py-0.5">{balance} deficit</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function InvigilatorScheduling() {
    const [activeTab, setActiveTab] = useState('targets');
    const { activePeriod, periodVersion, periodsLoaded, periodsError } = usePeriod();

    return (
        <div className="max-w-full">
            <ToastContainer position="top-right" theme="colored" />

            <div className="mb-4">
                <h2 className="text-2xl font-bold text-[#8B1A1A] tracking-tight">Invigilator Scheduling</h2>
                <p className="text-sm text-slate-500 mt-1">Configure duty targets, manage per-invigilator overrides, and assign invigilators to rooms.</p>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-1 mb-5 bg-slate-100 rounded-lg p-1 w-fit">
                {[
                    { key: 'targets',      label: 'Role Targets' },
                    { key: 'invigilators', label: 'Invigilators' },
                    { key: 'schedule',     label: 'Schedule' },
                ].map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={`px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 cursor-pointer ${
                            activeTab === tab.key ? 'bg-[#8B1A1A] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                        }`}>{tab.label}</button>
                ))}
            </div>

            {!periodsLoaded ? (
                <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-sm text-slate-400 text-center">Loading exam periods…</div>
            ) : periodsError ? (
                <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-xs text-red-700">⚠ {periodsError}</div>
            ) : !activePeriod ? (
                <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-sm text-slate-400 text-center">
                    No active exam period. Go to <b>Registration</b> tab to create one.
                </div>
            ) : (
                <>
                    {activeTab === 'targets'      && <RoleTargetsPanel periodVersion={periodVersion} activePeriod={activePeriod} />}
                    {activeTab === 'invigilators' && <InvigilatorsPanel periodVersion={periodVersion} activePeriod={activePeriod} />}
                    {activeTab === 'schedule'     && <SchedulePanel     periodVersion={periodVersion} activePeriod={activePeriod} />}
                </>
            )}
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Panel 1 — Role Targets
// ═════════════════════════════════════════════════════════════════════════════

function RoleTargetsPanel({ periodVersion, activePeriod }) {
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
            toast.success('Role targets saved.', { autoClose: 2000 });
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed.');
        } finally {
            setSaving(false);
        }
    };

    // Loading placeholder — NEVER renders the zero inputs prematurely
    if (!loaded && !loadError) {
        return (
            <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 p-8 max-w-2xl text-center">
                <div className="flex flex-col items-center gap-3">
                    <svg className="animate-spin h-7 w-7 text-[#8B1A1A]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    <span className="text-sm text-slate-500 font-medium">Loading role targets…</span>
                </div>
            </div>
        );
    }

    // Error state — inline retry, no misleading zeros
    if (loadError) {
        return (
            <div className="bg-white rounded-xl shadow-lg border border-red-200 p-6 max-w-2xl">
                <h3 className="text-xs font-bold text-red-700 uppercase tracking-wider mb-2">⚠ Couldn't load role targets</h3>
                <p className="text-sm text-slate-600 mb-3">{loadError}</p>
                <p className="text-[11px] text-slate-400 mb-4">If this persists, try signing out and signing back in to refresh your session.</p>
                <button onClick={load}
                    className="text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg bg-[#8B1A1A] text-white hover:bg-[#721515] cursor-pointer">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 p-6 max-w-2xl">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                Duty Targets — {activePeriod?.semester_label} · {activePeriod?.exam_type}
            </h3>
            <p className="text-xs text-slate-500 mb-5">
                Targets per role for <b>this exam</b>. Cumulative balance across midterm + endterm is shown on the Invigilators tab.
            </p>

            <div className="space-y-4">
                {ROLES.map(r => (
                    <div key={r.key} className="flex items-center gap-4">
                        <label className="w-36 text-sm font-medium text-slate-700">{r.label}</label>
                        <input
                            type="number"
                            min="0"
                            value={targets[r.key]}
                            onChange={(e) => setTargets(prev => ({ ...prev, [r.key]: e.target.value }))}
                            className="w-28 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50/50 text-slate-800
                                focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/20 focus:border-[#8B1A1A]/40"
                        />
                        <span className="text-xs text-slate-400">duties / semester</span>
                        {updatedAt[r.key] && (
                            <span className="text-[10px] text-slate-300 ml-auto">
                                updated {new Date(updatedAt[r.key]).toLocaleString()}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            <div className="mt-6 pt-5 border-t border-slate-100 flex justify-end">
                <button onClick={save} disabled={saving}
                    className={`px-6 py-2.5 text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm transition-all duration-200 ${
                        saving ? 'bg-slate-300 cursor-not-allowed' : 'bg-[#8B1A1A] hover:bg-[#721515] cursor-pointer'
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

    useEffect(() => { load(''); }, [load, periodVersion]);

    useEffect(() => {
        const t = setTimeout(() => load(search), 350);
        return () => clearTimeout(t);
    }, [search, load]);

    const saveOverride = async (userId, raw) => {
        const val = raw === '' || raw === null ? null : Number(raw);
        try {
            await updateInvigilatorOverride(userId, { override_target: val });
            toast.success('Override saved.', { autoClose: 1500 });
            setEditing(prev => { const next = { ...prev }; delete next[userId]; return next; });
            load(search);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed.');
        }
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
        <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden">
            {/* Stats banner */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-4 text-xs flex-wrap">
                <span className="text-slate-500">Total invigilators: <b className="text-slate-800">{stats.total}</b></span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-500">
                    <span className="capitalize">{activeType}</span> assigned/target: <b className="text-slate-800">{stats.totalAssignedActive} / {stats.totalTargetActive}</b>
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-500">
                    Cumulative (semester): <b className="text-slate-800">{stats.totalAssignedCum} / {stats.totalTargetCum}</b>
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-amber-700">{stats.deficit} in deficit</span>
                <span className="text-slate-300">·</span>
                <span className="text-red-700">{stats.extra} with extra duties</span>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-slate-100">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, email, employee ID or department…"
                    className="w-full px-4 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400
                        focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/20 focus:border-[#8B1A1A]/40"
                />
            </div>

            {/* Table */}
            <div className="max-h-[560px] overflow-y-auto">
                {loading ? (
                    <div className="p-10 text-sm text-slate-400 text-center">Loading…</div>
                ) : list.length === 0 ? (
                    <div className="p-10 text-sm text-slate-400 text-center">No invigilators found.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50 z-[5]">
                            <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                <th className="px-4 py-2.5 text-left">Name</th>
                                <th className="px-3 py-2.5 text-left">Role</th>
                                <th className="px-3 py-2.5 text-right">Default ({activeType})</th>
                                <th className="px-3 py-2.5 text-right">Override ({activeType})</th>
                                <th className={`px-3 py-2.5 text-right ${activeType === 'midterm' ? 'border-l-2 border-[#8B1A1A]/40 bg-[#8B1A1A]/5' : ''}`}>Midterm A/T</th>
                                <th className={`px-3 py-2.5 text-right ${activeType === 'endterm' ? 'border-l-2 border-[#8B1A1A]/40 bg-[#8B1A1A]/5' : ''}`}>Endterm A/T</th>
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
                                    <tr key={inv.user_id} className="hover:bg-slate-50/50">
                                        <td className="px-4 py-2.5">
                                            <div className="font-medium text-slate-800 text-[13px]">{inv.full_name}</div>
                                            <div className="text-[10px] text-slate-400">{inv.employee_id || '—'} · {inv.department || '—'}</div>
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-slate-500">{ROLE_LABEL[inv.role] || inv.role}</td>
                                        <td className="px-3 py-2.5 text-right text-xs text-slate-500">{inv.role_target ?? 0}</td>
                                        <td className="px-3 py-2.5 text-right">
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    min="0"
                                                    autoFocus
                                                    value={editing[inv.user_id]}
                                                    onChange={(e) => setEditing(prev => ({ ...prev, [inv.user_id]: e.target.value }))}
                                                    onBlur={(e) => saveOverride(inv.user_id, e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') saveOverride(inv.user_id, e.target.value);
                                                        if (e.key === 'Escape') setEditing(prev => { const n = { ...prev }; delete n[inv.user_id]; return n; });
                                                    }}
                                                    className="w-20 px-2 py-1 text-xs rounded border border-[#8B1A1A]/40 focus:outline-none focus:ring-1 focus:ring-[#8B1A1A]/30 text-right"
                                                />
                                            ) : (
                                                <button onClick={() => setEditing(prev => ({ ...prev, [inv.user_id]: inv.override_target ?? '' }))}
                                                    className={`text-xs font-mono px-2 py-1 rounded cursor-pointer ${inv.override_target != null ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-bold' : 'text-slate-400 hover:bg-slate-100'}`}>
                                                    {inv.override_target ?? '—'}
                                                </button>
                                            )}
                                        </td>
                                        <td className={`px-3 py-2.5 text-right text-xs ${activeType === 'midterm' ? 'border-l-2 border-[#8B1A1A]/40 bg-[#8B1A1A]/5 font-bold' : 'text-slate-500'}`}>
                                            {midA}<span className="text-slate-300"> / {midT}</span>
                                        </td>
                                        <td className={`px-3 py-2.5 text-right text-xs ${activeType === 'endterm' ? 'border-l-2 border-[#8B1A1A]/40 bg-[#8B1A1A]/5 font-bold' : 'text-slate-500'}`}>
                                            {endA}<span className="text-slate-300"> / {endT}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-xs font-semibold text-slate-700">
                                            {inv.cumulative_assigned}<span className="text-slate-300"> / {inv.cumulative_target}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-center"><BalanceBadge balance={inv.balance} isConfigured={inv.is_configured ?? (inv.cumulative_target > 0)} /></td>
                                        <td className="px-3 py-2.5 text-right pr-4">
                                            {inv.override_target != null && (
                                                <button onClick={() => resetOverride(inv.user_id)}
                                                    className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-[#8B1A1A] border border-slate-200 hover:border-[#8B1A1A] px-2 py-1 rounded cursor-pointer">
                                                    Reset
                                                </button>
                                            )}
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

function SchedulePanel({ periodVersion, activePeriod }) {
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
    const [pending, setPending] = useState({ reassigns: {}, removes: new Set(), adds: [] });
    const [saving, setSaving] = useState(false);
    const [clearing, setClearing] = useState(false);

    const pendingCount =
        Object.keys(pending.reassigns).length + pending.removes.size + pending.adds.length;

    const resetPending = () => setPending({ reassigns: {}, removes: new Set(), adds: [] });

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

    useEffect(() => { load(); resetPending(); /* refetch & drop drafts on period switch */ }, [load, periodVersion]);

    const handleGenerate = async () => {
        const label = activePeriod ? `${activePeriod.semester_label} — ${activePeriod.exam_type}` : 'the active period';
        let msg = `Generate a fresh schedule for ${label}? This wipes existing assignments for THIS period only (other periods untouched).`;
        if (pendingCount > 0) msg += `\n\n⚠ You have ${pendingCount} unsaved change(s). They will be lost.`;
        if (!window.confirm(msg)) return;
        setGenerating(true);
        try {
            // S3: send period_id explicitly so a flip mid-request can't misroute
            const res = await generateInvigilatorSchedule({ period_id: activePeriod?.id });
            toast.success(res.data.message, { autoClose: 3000 });
            setWarnings(res.data.warnings || []);
            resetPending();
            load();
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

    const undoRemove = (assignmentId) => {
        setPending(prev => {
            const removes = new Set(prev.removes);
            removes.delete(assignmentId);
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
            toast.success(res.data.message || 'Saved.', { autoClose: 2500 });
            resetPending();
            await load();
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
                        is_course_instructor: false,
                        _status:              'added',
                    }));
                return { ...room, invigilators: [...baseInvigilators, ...addedHere] };
            }),
        }));
    }, [schedule, pending]);

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
                <div className="text-xs text-slate-500">
                    Schedule for <b className="text-[#8B1A1A]">{activePeriod?.semester_label} — {activePeriod?.exam_type}</b>
                    {' · '}
                    {schedule.length === 0 ? 'no schedule yet, click Generate' : `${schedule.length} slot(s) loaded`}
                </div>
                <div className="flex gap-2">
                    <button onClick={load} disabled={loading}
                        className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
                        Refresh
                    </button>
                    <button onClick={handleClear} disabled={clearing || schedule.length === 0}
                        className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all duration-200 ${
                            clearing || schedule.length === 0
                                ? 'border-slate-200 text-slate-300 cursor-not-allowed'
                                : 'border-red-300 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 cursor-pointer'
                        }`}
                        title="Permanently delete the entire saved schedule">
                        {clearing ? 'Clearing…' : 'Clear Schedule'}
                    </button>
                    <button onClick={handleGenerate} disabled={generating}
                        className={`px-5 py-2 text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm transition-all duration-200 ${
                            generating ? 'bg-slate-300 cursor-not-allowed' : 'bg-[#8B1A1A] hover:bg-[#721515] cursor-pointer'
                        }`}>
                        {generating ? 'Generating…' : 'Generate Draft'}
                    </button>
                </div>
            </div>

            {/* Invigilator search */}
            {schedule.length > 0 && (
                <div className="mb-4 bg-white rounded-xl border border-slate-200/80 px-4 py-3">
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        <input type="text" value={invSearch} onChange={(e) => setInvSearch(e.target.value)}
                            placeholder="Search for an invigilator by name or employee ID…"
                            className="w-full pl-10 pr-9 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400
                                focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/20 focus:border-[#8B1A1A]/40" />
                        {invSearch && (
                            <button onClick={() => setInvSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                    {invSearch && (
                        <div className="mt-2 text-[11px] text-slate-500">
                            {matchCount === 0
                                ? <span className="text-amber-700">No matches.</span>
                                : <span><b className="text-[#8B1A1A]">{matchCount}</b> assignment{matchCount !== 1 ? 's' : ''} across <b className="text-[#8B1A1A]">{filteredSchedule.length}</b> slot{filteredSchedule.length !== 1 ? 's' : ''}.</span>
                            }
                        </div>
                    )}
                </div>
            )}

            {/* Unsaved changes banner — sticky at top */}
            {pendingCount > 0 && (
                <div className="sticky top-0 z-30 mb-4 -mx-1 px-4 py-3 rounded-lg shadow-md flex items-center justify-between flex-wrap gap-2"
                    style={{ background: 'linear-gradient(90deg, #fef3c7, #fde68a)' }}>
                    <div className="flex items-center gap-3 text-xs">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-600 text-white font-bold text-[11px]">{pendingCount}</span>
                        <div>
                            <div className="font-bold text-amber-900">Unsaved changes</div>
                            <div className="text-[11px] text-amber-800">
                                {pending.adds.length > 0       && <span className="mr-2">+{pending.adds.length} added</span>}
                                {Object.keys(pending.reassigns).length > 0 && <span className="mr-2">↺ {Object.keys(pending.reassigns).length} reassigned</span>}
                                {pending.removes.size > 0      && <span>− {pending.removes.size} removed</span>}
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleDiscard} disabled={saving}
                            className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded border border-amber-700 text-amber-800 hover:bg-amber-200 disabled:opacity-50 cursor-pointer">
                            Discard
                        </button>
                        <button onClick={handleSave} disabled={saving}
                            className={`px-5 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded text-white shadow-sm ${
                                saving ? 'bg-amber-400 cursor-not-allowed' : 'bg-amber-700 hover:bg-amber-800 cursor-pointer'
                            }`}>
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="text-xs font-bold text-amber-800 mb-1">⚠ Warnings ({warnings.length})</div>
                    <ul className="text-[11px] text-amber-700 list-disc list-inside space-y-0.5">
                        {warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
                        {warnings.length > 10 && <li>… and {warnings.length - 10} more.</li>}
                    </ul>
                </div>
            )}

            {/* Schedule */}
            {loading ? (
                <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-sm text-slate-400 text-center">Loading…</div>
            ) : schedule.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-sm text-slate-400 text-center">
                    Click <b>Generate Draft</b> to build the invigilator schedule. Requires at least one slot with a saved seating plan.
                </div>
            ) : filteredSchedule.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-sm text-slate-400 text-center">
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
                            <div key={slot.slot_id} className="bg-white rounded-xl shadow-sm border border-slate-200/80 overflow-hidden">
                                <div className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50/60"
                                    onClick={() => setExpandedSlots(prev => ({ ...prev, [slot.slot_id]: !isOpen }))}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isOpen ? 'bg-[#8B1A1A] text-white' : 'bg-slate-100 text-slate-400'}`}>
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d={isOpen ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'} />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-slate-800">{slot.exam_day}, {formatDate(slot.exam_date)}</div>
                                            <div className="text-[11px] text-slate-400">{formatTime(slot.start_time)} – {formatTime(slot.end_time)} · {slot.rooms.length} room(s)</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded ${totals.total_assigned >= totals.total_required ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                            {totals.total_assigned} / {totals.total_required} assigned
                                        </span>
                                    </div>
                                </div>

                                {isOpen && (
                                    <div className="border-t border-slate-100">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50/60">
                                                <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
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
                                                        <tr key={room.classroom_id} className="hover:bg-slate-50/40">
                                                            <td className="px-5 py-2.5 font-mono text-xs font-bold text-slate-700">{room.room_name}</td>
                                                            <td className="px-3 py-2.5 text-[11px] text-slate-500 truncate max-w-[180px]">{room.course_codes}</td>
                                                            <td className="px-3 py-2.5 text-right text-xs text-slate-600">{room.students}</td>
                                                            <td className={`px-3 py-2.5 text-right text-xs font-bold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{room.required}</td>
                                                            <td className="px-3 py-2.5">
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {room.invigilators.length === 0 && <span className="text-[10px] text-slate-300 italic">unassigned</span>}
                                                                    {room.invigilators.map(inv => {
                                                                        const isMatch    = lcQuery && matchesQuery(inv, lcQuery);
                                                                        const isAdded    = inv._status === 'added';
                                                                        const isReassign = inv._status === 'reassigned';
                                                                        const isRemoved  = inv._status === 'removed';

                                                                        // Click behaviour:
                                                                        //  - Removed chips → undo the remove (cancel staged delete)
                                                                        //  - Others       → open swap/edit modal
                                                                        const onClickChip = isRemoved
                                                                            ? () => undoRemove(inv.assignment_id)
                                                                            : () => setSwapModal({ slotId: slot.slot_id, room, assignment: inv });

                                                                        let cls;
                                                                        if (isRemoved)
                                                                            cls = 'bg-slate-50 text-slate-400 border border-dashed border-slate-300 line-through hover:bg-red-50 hover:text-red-600 hover:border-red-300';
                                                                        else if (isAdded)
                                                                            cls = 'bg-emerald-50 text-emerald-800 border border-emerald-400 hover:bg-emerald-100';
                                                                        else if (isReassign)
                                                                            cls = 'bg-amber-50 text-amber-900 border border-amber-400 hover:bg-amber-100';
                                                                        else if (isMatch)
                                                                            cls = 'bg-amber-100 text-amber-900 border border-amber-400 ring-2 ring-amber-300/60';
                                                                        else if (inv.is_course_instructor)
                                                                            cls = 'bg-[#8B1A1A]/10 text-[#8B1A1A] border border-[#8B1A1A]/30 hover:bg-[#8B1A1A]/20';
                                                                        else
                                                                            cls = 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-[#8B1A1A]/10 hover:border-[#8B1A1A]/30 hover:text-[#8B1A1A]';

                                                                        const title = isRemoved
                                                                            ? 'Pending removal — click to undo'
                                                                            : isAdded
                                                                                ? 'Pending add — click to edit'
                                                                                : isReassign
                                                                                    ? 'Pending reassignment — click to edit'
                                                                                    : inv.is_course_instructor
                                                                                        ? 'Course instructor — click to reassign or remove'
                                                                                        : 'Click to reassign or remove';

                                                                        return (
                                                                            <button key={inv.assignment_id} onClick={onClickChip}
                                                                                className={`group inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${cls}`}
                                                                                title={title}>
                                                                                {isAdded    && <span className="text-[8px] font-bold">+</span>}
                                                                                {isReassign && <span className="text-[8px] font-bold">↺</span>}
                                                                                {!isAdded && !isReassign && !isRemoved && inv.is_course_instructor && <span className="text-[8px]">★</span>}
                                                                                {inv.full_name}
                                                                                <span className="text-[8px] opacity-50">({ROLE_LABEL[inv.role]})</span>
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right pr-5">
                                                                <button onClick={() => setSwapModal({ slotId: slot.slot_id, room })}
                                                                    className="text-[10px] font-bold uppercase tracking-wider text-[#8B1A1A] border border-[#8B1A1A]/30 hover:bg-[#8B1A1A] hover:text-white px-2.5 py-1 rounded cursor-pointer">
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

function AssignmentModal({ slotId, room, assignment, onPick, onRemove, onClose }) {
    const isSwap = !!assignment;
    const [eligible, setEligible] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    useEffect(() => {
        (async () => {
            try {
                // For pending-add assignments (tempId < 0), exclude_assignment_id has no
                // server-side meaning, so just request the full eligible list.
                const excludeId = assignment && assignment.assignment_id > 0
                    ? assignment.assignment_id : undefined;
                const res = await getEligibleInvigilators(slotId, excludeId);
                setEligible(res.data.eligible || []);
            } catch (err) {
                toast.error(err.response?.data?.message || 'Failed to load eligible invigilators.');
            } finally {
                setLoading(false);
            }
        })();
    }, [slotId, assignment]);

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">
                            {isSwap ? `Replace ${assignment.full_name}` : 'Add Invigilator'}
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            Room <b>{room.room_name}</b> · {room.students} students · needs {room.required}
                            {isSwap && assignment.is_course_instructor && <span className="ml-2 text-[#8B1A1A] font-semibold">★ course instructor</span>}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-5 py-3 border-b border-slate-100 space-y-2">
                    <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
                        placeholder="Search by name, employee ID or department…"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/20" />

                    {/* Role filter pills */}
                    <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                        {ROLE_FILTERS.map(rf => (
                            <button key={rf.key} onClick={() => setRoleFilter(rf.key)}
                                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all duration-200 cursor-pointer ${
                                    roleFilter === rf.key ? 'bg-[#8B1A1A] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                                }`}>{rf.label}</button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-10 text-sm text-slate-400 text-center">Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div className="p-10 text-sm text-slate-400 text-center">No eligible invigilators match.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-50">
                                <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
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
                                        <tr key={inv.user_id} className={`${isCurrent ? 'bg-[#8B1A1A]/5' : 'hover:bg-slate-50/50'}`}>
                                            <td className="px-4 py-2">
                                                <div className="text-[13px] font-medium text-slate-800 flex items-center gap-1.5">
                                                    {inv.full_name}
                                                    {isCurrent && <span className="text-[9px] font-bold text-[#8B1A1A] bg-[#8B1A1A]/10 px-1.5 py-0.5 rounded">CURRENT</span>}
                                                </div>
                                                <div className="text-[10px] text-slate-400">{inv.employee_id || '—'} · {inv.department || '—'}</div>
                                            </td>
                                            <td className="px-3 py-2 text-xs text-slate-500">{ROLE_LABEL[inv.role] || inv.role}</td>
                                            <td className="px-3 py-2 text-right text-xs">{inv.assigned_count} / {inv.effective_target}</td>
                                            <td className="px-3 py-2 text-center"><BalanceBadge balance={inv.balance} /></td>
                                            <td className="px-3 py-2 text-right pr-4">
                                                <button disabled={isCurrent} onClick={() => pick(inv.user_id, inv)}
                                                    className="text-[10px] font-bold uppercase tracking-wider bg-[#8B1A1A] text-white hover:bg-[#721515] disabled:bg-slate-300 disabled:cursor-not-allowed px-3 py-1 rounded cursor-pointer">
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
                    <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                        <button onClick={removeCurrent}
                            className="text-[11px] font-bold uppercase tracking-wider text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 px-3 py-1.5 rounded transition-all cursor-pointer">
                            Remove this invigilator
                        </button>
                        <button onClick={onClose}
                            className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer">
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default InvigilatorScheduling;
