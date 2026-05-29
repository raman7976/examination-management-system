import { useState, useEffect, useRef, useCallback } from 'react';
import PeriodScopedEmptyState from '../components/PeriodScopedEmptyState.jsx';

const API = '/api/exams';

/** Build headers with the JWT token from localStorage */
function authHeaders(extra = {}) {
    const token = localStorage.getItem('token');
    const headers = { ...extra };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tiny helpers
// ─────────────────────────────────────────────────────────────────────────────

function Badge({ status }) {
    const styles = {
        saved:   'bg-success/15 text-success',
        pending: 'bg-warning/15 text-warning',
        empty:   'bg-surface2 text-textMuted',
    };
    const labels = { saved: 'Saved', pending: 'Pending', empty: 'No courses' };
    const key = status in styles ? status : 'empty';
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase ${styles[key]}`}>
            {labels[key]}
        </span>
    );
}

function Step({ num, title, active, done }) {
    return (
        <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 transition-colors duration-300 ${
                done ? 'bg-success/100 text-white' : active ? 'bg-brand-500 text-white' : 'bg-surface2 text-textFaint'
            }`}>
                {done ? '✓' : num}
            </div>
            <span className={`text-[13px] ${
                active ? 'font-bold text-text' : done ? 'font-medium text-success' : 'font-medium text-textFaint'
            }`}>
                {title}
            </span>
        </div>
    );
}

function Toast({ message, type, onClose }) {
    useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
    const styles = {
        success: 'bg-success/10 border-success/30 text-success',
        error:   'bg-danger/10 border-danger text-danger',
        info:    'bg-danger/10 border-brand-500 text-danger',
    };
    const s = styles[type] ?? styles.info;
    return (
        <div className={`fixed bottom-6 right-6 z-[9999] border-[1.5px] rounded-xl px-4 py-3 max-w-[380px] shadow-xl flex items-start gap-2.5 animate-slideUp ${s}`}>
            <div className="flex-1 text-[13px] font-medium">{message}</div>
            <button onClick={onClose} className="bg-transparent border-none cursor-pointer text-lg leading-none p-0 opacity-70 hover:opacity-100 transition-opacity">×</button>
        </div>
    );
}

function Spinner() {
    return (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full inline-block animate-spin" />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Per-slot room selector panel (expanded inline under a slot row)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  RoomGroup — hoisted to module scope (was defined INSIDE SlotRoomSelector,
//  which created a brand-new component identity on every parent render. React
//  treated each render's <RoomGroup/> as a different component and tore down
//  the entire button tree — bad for performance, state, and focus.)
//
//  Behaviour is unchanged: same JSX, same Tailwind classes, same callbacks.
//  We pass `selectedIds` and `toggle` in as props instead of closing over them.
// ─────────────────────────────────────────────────────────────────────────────
function RoomGroup({ title, rooms, selectedIds, toggle }) {
    return (
        <div className="mb-2.5">
            <p className="text-[10px] font-bold text-textFaint tracking-widest uppercase mb-1.5">{title}</p>
            <div className="flex flex-wrap gap-1.5">
                {rooms.map(r => {
                    const on = selectedIds.includes(r.id);
                    return (
                        <button key={r.id} onClick={() => toggle(r.id)}
                            title={`Purple:${r.cap_purple} Green:${r.cap_green} Yellow:${r.cap_yellow} | ${r.type}`}
                            className={`px-2.5 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-all duration-150 border-[1.5px] ${
                                on
                                    ? 'border-brand-500 bg-danger/10 text-brand-500 font-bold'
                                    : 'border-border bg-surface2 text-textMuted font-medium'
                            }`}>
                            {r.room_name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function SlotRoomSelector({ slotId, classrooms, selectedIds, onChange }) {
    const toggle   = (id) => onChange(slotId, selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
    const selectAll = () => onChange(slotId, classrooms.map(r => r.id));
    const clearAll  = () => onChange(slotId, []);

    const building1 = classrooms.filter(r => r.location_order < 50);
    const building2 = classrooms.filter(r => r.location_order >= 50);

    return (
        <div className="p-3.5 bg-danger/10 rounded-lg border border-danger/30">
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-text">
                    Rooms for this slot
                    <span className={`ml-2 rounded-full px-2 py-px text-[11px] font-bold ${
                        selectedIds.length === 0 ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success'
                    }`}>
                        {selectedIds.length} selected
                    </span>
                </span>
                <div className="flex gap-2.5">
                    <button onClick={selectAll} className="bg-transparent border-none cursor-pointer text-[11px] text-brand-500 font-bold hover:underline">All</button>
                    <button onClick={clearAll}  className="bg-transparent border-none cursor-pointer text-[11px] text-danger font-bold hover:underline">None</button>
                </div>
            </div>

            <RoomGroup title="Academic Block  (LH-1 → CP)" rooms={building1} selectedIds={selectedIds} toggle={toggle} />
            {building2.length > 0 && (
                <RoomGroup title="Incubation Centre  (LH-16 → LH-19)" rooms={building2} selectedIds={selectedIds} toggle={toggle} />
            )}

            {selectedIds.length === 0 && (
                <p className="text-xs text-danger font-semibold mt-1.5">
                    ⚠ No rooms selected — this slot will be skipped during export.
                </p>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function SeatingManager() {
    const [slots,         setSlots]         = useState([]);
    const [classrooms,    setClassrooms]    = useState([]);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [generating,    setGenerating]    = useState(false);
    const [uploading,     setUploading]     = useState(false);
    const [workflowStep,  setWorkflowStep]  = useState(1);
    const [toast,         setToast]         = useState(null);
    const [dragOver,      setDragOver]      = useState(false);
    const [fetchError,    setFetchError]    = useState(null);   // stores server error message
    const [pendingFile,   setPendingFile]   = useState(null);   // file staged for confirmation
    const [showConfirm,   setShowConfirm]   = useState(false);  // confirmation modal visible

    // expandedSlots: Set<slot_id>
    const [expandedSlots,  setExpandedSlots]  = useState(new Set());
    // slotRoomConfig: { [slot_id]: number[] }
    const [slotRoomConfig, setSlotRoomConfig] = useState({});

    const fileInputRef = useRef(null);
    const notify = useCallback((msg, type = 'info') => setToast({ message: msg, type }), []);

    // ── Initial load ─────────────────────────────────────────────────────────
    useEffect(() => {
        const loadData = async () => {
            try {
                // Fetch both endpoints; capture non-2xx responses as errors
                const [sRes, cRes] = await Promise.all([
                    fetch(`${API}/seating-status`, { headers: authHeaders() }),
                    fetch(`${API}/classrooms`,     { headers: authHeaders() }),
                ]);

                // Surface server-side error messages in the UI
                if (!sRes.ok) {
                    const errBody = await sRes.json().catch(() => ({}));
                    throw new Error(
                        `[${sRes.status}] seating-status: ${errBody.error ?? errBody.message ?? sRes.statusText}`
                    );
                }
                if (!cRes.ok) {
                    const errBody = await cRes.json().catch(() => ({}));
                    throw new Error(
                        `[${cRes.status}] classrooms: ${errBody.error ?? errBody.message ?? cRes.statusText}`
                    );
                }

                const [statusData, classData] = await Promise.all([sRes.json(), cRes.json()]);

                const slotList = Array.isArray(statusData) ? statusData : [];
                const roomList = Array.isArray(classData)  ? classData  : [];

                setSlots(slotList);
                setClassrooms(roomList);
                setFetchError(null);

                // Default: all rooms enabled for every slot, except LH-11, LH-12, and CP Lab
                const defaultIds = roomList
                    .filter(r => {
                        const name = r.room_name.toLowerCase().trim();
                        return !(name === 'lh-11' || name === 'lh-12' || name === 'cp' || name === 'cp lab' || name === 'cplab');
                    })
                    .map(r => r.id);

                const init   = {};
                slotList.forEach(s => { init[s.slot_id] = [...defaultIds]; });
                setSlotRoomConfig(init);

            } catch (err) {
                console.error('SeatingManager load error:', err);
                setFetchError(err.message);
                notify(`Load failed: ${err.message}`, 'error');
            } finally {
                setLoadingStatus(false);
            }
        };
        loadData();
    }, [notify]);

    const refreshStatus = useCallback(() => {
        fetch(`${API}/seating-status`, { headers: authHeaders() }).then(r => r.json())
            .then(d => { if (Array.isArray(d)) setSlots(d); })
            .catch(() => {});
    }, []);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleSlotRoomChange = useCallback((slotId, newIds) => {
        setSlotRoomConfig(prev => ({ ...prev, [slotId]: newIds }));
    }, []);

    const toggleExpand = (slotId) => setExpandedSlots(prev => {
        const next = new Set(prev);
        next.has(slotId) ? next.delete(slotId) : next.add(slotId);
        return next;
    });

    // Apply same room list to ALL slots at once
    const setGlobalRooms = (ids) => {
        const next = {};
        slots.forEach(s => { next[s.slot_id] = [...ids]; });
        setSlotRoomConfig(next);
    };

    const handleGenerateExport = async () => {
        const slotsWithExams = slots.filter(s => s.exam_count > 0);
        if (!slotsWithExams.length) return notify('No slots have scheduled exams yet.', 'error');

        const emptySlots = slotsWithExams.filter(
            s => !(slotRoomConfig[s.slot_id]?.length > 0)
        );
        if (emptySlots.length)
            return notify(`${emptySlots.length} slot(s) have no rooms selected. Please fix them first.`, 'error');

        setGenerating(true);
        try {
            const res = await fetch(`${API}/generate-export`, {
                method:  'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body:    JSON.stringify({ slotRoomConfig }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `HTTP ${res.status}`);

            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            // Try reading filename from Content-Disposition, fallback to dated name
            const cd   = res.headers.get('Content-Disposition') ?? '';
            const match = cd.match(/filename="?([^"]+)"?/);
            const dateStr = new Date().toISOString().slice(0, 10);
            a.download = match?.[1] || `seating_plan_${dateStr}.xlsx`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);

            notify('Excel downloaded! Review it, then upload the finalised version.', 'success');
            setWorkflowStep(3);
        } catch (err) {
            notify(`Export failed: ${err.message}`, 'error');
        } finally {
            setGenerating(false);
        }
    };

    // Stage file for confirmation — don't upload yet
    const handleUpload = (file) => {
        if (!file) return;
        if (!file.name.endsWith('.xlsx')) return notify('Please upload a .xlsx file.', 'error');
        setPendingFile(file);
        setShowConfirm(true);
    };

    // Actually upload after user confirms
    const handleConfirmUpload = async () => {
        setShowConfirm(false);
        if (!pendingFile) return;
        setUploading(true);
        const form = new FormData();
        form.append('seatingFile', pendingFile);
        try {
            const res  = await fetch(`${API}/upload-seating`, { method: 'POST', headers: authHeaders(), body: form });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
            let msg = `✓ Saved! ${data.exams_processed} exams · ${data.allocations_saved} allocations.`;
            if (data.old_allocations_cleared > 0) {
                msg += ` (Cleared ${data.old_allocations_cleared} old allocations)`;
            }
            notify(msg, 'success');
            setWorkflowStep(4);
            refreshStatus();
        } catch (err) {
            notify(`Upload failed: ${err.message}`, 'error');
        } finally {
            setUploading(false);
            setPendingFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleCancelUpload = () => {
        setShowConfirm(false);
        setPendingFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        notify('Upload cancelled.', 'info');
    };

    // ── Derived ───────────────────────────────────────────────────────────────
    const slotsWithExams   = slots.filter(s => s.exam_count > 0);
    const slotsWithSeating = slots.filter(s => s.has_seating);
    const totalRooms       = classrooms.length;
    const formatDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
    const formatTime = t => t ? t.slice(0, 5) : '';

    // ─────────────────────────────────────────────────────────────────────────
    //  Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
                @keyframes slideUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
                .animate-slideUp { animation: slideUp 0.25s ease; }
                .slot-row:hover td { background: rgb(var(--color-brand-500) / 0.05) !important; }
            `}</style>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <div className="min-h-screen p-7">
                <div className="max-w-[1180px] mx-auto">

                    {/* ── Page header ── */}
                    <div className="flex items-end justify-between mb-8">
                        <div>
                            <h1 className="text-2xl font-bold text-brand-500 tracking-tight">Seating Plan Assignment</h1>
                            <p className="text-sm text-textMuted mt-1">Per-slot room assignment</p>
                        </div>
                        <div className="flex gap-3">
                            {[['Total Slots', slots.length], ['With Exams', slotsWithExams.length], ['Seating Saved', slotsWithSeating.length]].map(([label, value]) => (
                                <div key={label} className="bg-surface border border-border rounded-xl px-5 py-2.5 text-center min-w-[90px] shadow-sm">
                                    <div className="text-xl font-bold text-text">{value}</div>
                                    <div className="text-[11px] text-textFaint font-medium">{label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-[1fr_320px] gap-5">

                        {/* ── LEFT ── */}
                        <div className="flex flex-col gap-5">

                            {/* Workflow stepper */}
                            <div className="bg-surface rounded-xl shadow-lg border border-border p-5">
                                <p className="text-xs font-bold tracking-widest uppercase text-textFaint mb-3.5">Workflow</p>
                                <div className="flex flex-col gap-3">
                                    <Step num={1} title="Expand each slot row to configure its rooms" active={workflowStep === 1} done={workflowStep > 1} />
                                    <Step num={2} title="Generate Excel — algorithm runs per-slot"   active={workflowStep === 2} done={workflowStep > 2} />
                                    <Step num={3} title="Review & edit the downloaded Excel"          active={workflowStep === 3} done={workflowStep > 3} />
                                    <Step num={4} title="Upload finalised Excel → saved to Data Base"        active={workflowStep === 4} done={workflowStep > 4} />
                                </div>
                            </div>

                            {/* ── Slot table with expandable room rows ── */}
                            <div className="bg-surface rounded-xl shadow-lg border border-border overflow-hidden">
                                {/* Toolbar */}
                                <div className="px-5 py-3 border-b border-border flex justify-between items-center flex-wrap gap-2">
                                    <div>
                                        <span className="text-xs font-bold tracking-widest uppercase text-textFaint">Exam Slots</span>
                                        <span className="ml-2 text-[11px] text-textMuted">— click ▾ to configure rooms per slot</span>
                                    </div>
                                    <div className="flex gap-1.5 items-center">
                                        <span className="text-[11px] text-textFaint">All slots:</span>
                                        <button onClick={() => setGlobalRooms(classrooms.map(r => r.id))} className="bg-transparent border-none cursor-pointer text-[11px] text-brand-500 font-bold hover:underline">All rooms</button>
                                        <button onClick={() => setGlobalRooms([])} className="bg-transparent border-none cursor-pointer text-[11px] text-danger font-bold hover:underline">Clear rooms</button>
                                        <span className="text-textFaint px-1">|</span>
                                        <button onClick={refreshStatus} className="bg-transparent border-none cursor-pointer text-xs text-textMuted hover:text-text transition-colors">↻ Refresh</button>
                                    </div>
                                </div>

                                {loadingStatus ? (
                                    <div className="p-10 text-center text-textFaint text-sm">Loading…</div>
                                ) : fetchError ? (
                                    <div className="p-7 m-4 bg-danger/10 border border-danger/30 rounded-xl">
                                        <p className="text-[13px] font-bold text-danger mb-2">
                                            ⚠ Could not load data from server
                                        </p>
                                        <p className="font-mono text-xs text-danger bg-danger/15 px-3 py-2 rounded-lg mb-3 break-all">
                                            {fetchError}
                                        </p>
                                        <p className="text-xs text-danger leading-relaxed">
                                            <strong>Common causes:</strong><br />
                                            1. <code className="bg-danger/15 px-1 rounded">seating_allocations</code> table missing → run <code className="bg-danger/15 px-1 rounded">migration.sql</code> on your Aiven DB<br />
                                            2. No Vite proxy → add <code className="bg-danger/15 px-1 rounded">server.proxy</code> in <code className="bg-danger/15 px-1 rounded">vite.config.js</code> (see below)<br />
                                            3. Backend not running on port 5001
                                        </p>
                                        <pre className="text-[11px] bg-text text-sky-300 px-3.5 py-2.5 rounded-lg mt-2.5 overflow-x-auto">{`// vite.config.js
export default {
  server: {
    proxy: {
      '/api': 'http://localhost:5001'
    }
  }
}`}</pre>
                                    </div>
                                ) : slots.length === 0 ? (
                                    <div className="p-4">
                                        <PeriodScopedEmptyState noun="exam slots">
                                            Add slots via <b className="text-text">Add Exam Slot</b> first, or
                                            switch to another period that already has slots.
                                        </PeriodScopedEmptyState>
                                    </div>
                                ) : (
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-surface2">
                                                {['', 'Date', 'Day', 'Time', 'Courses', 'Rooms', 'Status'].map(h => (
                                                    <th key={h} className="px-3 py-2 text-left text-[11px] font-bold text-textFaint tracking-wider uppercase border-b border-border">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {slots.map((sl, i) => {
                                                const expanded      = expandedSlots.has(sl.slot_id);
                                                const roomsSelected = (slotRoomConfig[sl.slot_id] ?? []).length;
                                                const hasWarning    = sl.exam_count > 0 && roomsSelected === 0;

                                                return (
                                                    <>
                                                        {/* ── Main slot row ── */}
                                                        <tr
                                                            key={sl.slot_id}
                                                            className={`slot-row cursor-pointer ${expanded ? '' : 'border-b border-border'}`}
                                                            onClick={() => toggleExpand(sl.slot_id)}
                                                        >
                                                            {/* Expand button */}
                                                            <td className={`px-1.5 py-2.5 pl-3.5 w-8 ${expanded ? 'bg-danger/10' : i % 2 === 0 ? 'bg-surface' : 'bg-surface2'}`}>
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); toggleExpand(sl.slot_id); }}
                                                                    className={`w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold leading-none transition-all duration-150 border-[1.5px] ${
                                                                        expanded
                                                                            ? 'border-brand-500 bg-danger/10 text-brand-500'
                                                                            : 'border-border bg-surface2 text-textMuted'
                                                                    }`}
                                                                >
                                                                    {expanded ? '▲' : '▾'}
                                                                </button>
                                                            </td>
                                                            <td className={`px-3 py-2.5 text-[13px] font-semibold text-text ${expanded ? 'bg-danger/10' : i % 2 === 0 ? 'bg-surface' : 'bg-surface2'}`}>{formatDate(sl.exam_date)}</td>
                                                            <td className={`px-3 py-2.5 text-[13px] text-textMuted ${expanded ? 'bg-danger/10' : i % 2 === 0 ? 'bg-surface' : 'bg-surface2'}`}>{sl.exam_day}</td>
                                                            <td className={`px-3 py-2.5 font-mono text-xs text-textMuted ${expanded ? 'bg-danger/10' : i % 2 === 0 ? 'bg-surface' : 'bg-surface2'}`}>
                                                                {formatTime(sl.start_time)} – {formatTime(sl.end_time)}
                                                            </td>
                                                            <td className={`px-3 py-2.5 text-[13px] text-textMuted text-center ${expanded ? 'bg-danger/10' : i % 2 === 0 ? 'bg-surface' : 'bg-surface2'}`}>{sl.exam_count}</td>
                                                            {/* Room count badge */}
                                                            <td className={`px-3 py-2.5 ${expanded ? 'bg-danger/10' : i % 2 === 0 ? 'bg-surface' : 'bg-surface2'}`}>
                                                                <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                                                                    hasWarning ? 'text-danger bg-danger/15' : 'text-brand-500 bg-danger/10'
                                                                }`}>
                                                                    {roomsSelected}/{totalRooms}{hasWarning ? ' ⚠' : ''}
                                                                </span>
                                                            </td>
                                                            <td className={`px-3 py-2.5 ${expanded ? 'bg-danger/10' : i % 2 === 0 ? 'bg-surface' : 'bg-surface2'}`}>
                                                                <Badge status={sl.exam_count === 0 ? 'empty' : sl.has_seating ? 'saved' : 'pending'} />
                                                            </td>
                                                        </tr>

                                                        {/* ── Expandable room selector row ── */}
                                                        {expanded && (
                                                            <tr key={`${sl.slot_id}-expand`} className="border-b-2 border-danger/30">
                                                                <td colSpan={7} className="px-3.5 pt-1.5 pb-3.5 bg-danger/10">
                                                                    <SlotRoomSelector
                                                                        slotId={sl.slot_id}
                                                                        classrooms={classrooms}
                                                                        selectedIds={slotRoomConfig[sl.slot_id] ?? []}
                                                                        onChange={handleSlotRoomChange}
                                                                    />
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* ── Upload zone ── */}
                            <div className="bg-surface rounded-xl shadow-lg border border-border p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">3</div>
                                    <h3 className="text-sm font-bold text-text uppercase tracking-wider">Upload Reviewed Excel</h3>
                                </div>

                                {/* ── Warning banner ── */}
                                <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-4">
                                    <div className="flex items-start gap-2">
                                        <span className="text-sm mt-0.5">⚠️</span>
                                        <p className="text-[11px] text-warning leading-relaxed">
                                            <strong className="text-warning">Strict Upload Mode:</strong> Uploading will <strong>replace all existing seating allocations</strong>. 
                                            Exam slots and scheduled courses are preserved.
                                        </p>
                                    </div>
                                </div>

                                <div
                                    className={`border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-all duration-200 ${
                                        dragOver ? 'border-brand-500 bg-danger/10' : 'border-borderStrong bg-surface2 hover:border-brand-500 hover:bg-danger/10'
                                    }`}
                                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files[0]); }}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <div className="text-3xl mb-1.5">{uploading ? '⏳' : '📂'}</div>
                                    <p className="text-sm font-semibold text-textMuted">
                                        {uploading ? 'Uploading & saving…' : 'Drop reviewed Excel here, or click to browse'}
                                    </p>
                                    <p className="text-xs text-textFaint mt-1">Only .xlsx accepted</p>
                                    <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden"
                                        onChange={e => { handleUpload(e.target.files[0]); e.target.value = ''; }} />
                                </div>
                                <button
                                    disabled={uploading}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`mt-3 w-full py-3 text-white text-sm font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 transition-all duration-200 ${
                                        uploading ? 'bg-textFaint cursor-not-allowed' : 'bg-brand-500 hover:bg-brand-600 hover:shadow-md cursor-pointer'
                                    }`}
                                >
                                    {uploading && <Spinner />}
                                    {uploading ? 'Saving to database…' : 'Upload & Save Seating Plan'}
                                </button>
                            </div>
                        </div>

                        {/* ── RIGHT ── */}
                        <div className="flex flex-col gap-5">

                            {/* Generate card */}
                            <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl p-5 shadow-lg text-white">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-7 h-7 rounded-full bg-surface/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">2</div>
                                    <h3 className="text-sm font-bold uppercase tracking-wider">Generate Seating Plan</h3>
                                </div>
                                <p className="text-[13px] opacity-80 leading-relaxed mb-4">
                                    1. The algorithm is applied for each slot using its own room config and exports a colour-coded Excel workbook.
                                    <br/>2. Make the changes as you see fit then upload the excel.
                                </p>

                                {/* Per-slot readiness list */}
                                <div className="bg-surface/10 rounded-lg px-3 py-2.5 mb-4 text-xs">
                                    {slotsWithExams.length === 0 ? (
                                        <span className="opacity-70">No slots with exams yet.</span>
                                    ) : (
                                        slotsWithExams.map(sl => {
                                            const n  = (slotRoomConfig[sl.slot_id] ?? []).length;
                                            const ok = n > 0;
                                            return (
                                                <div key={sl.slot_id} className="flex justify-between mb-1 items-center">
                                                    <span className="opacity-85">{formatDate(sl.exam_date)} · {formatTime(sl.start_time)}</span>
                                                    <span className={`font-bold text-[11px] ${ok ? 'text-success' : 'text-danger'}`}>
                                                        {ok ? `${n} rooms ✓` : '⚠ no rooms'}
                                                    </span>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                <button
                                    disabled={generating || slotsWithExams.length === 0}
                                    onClick={handleGenerateExport}
                                    className={`w-full py-3 bg-surface text-brand-500 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 ${
                                        generating || slotsWithExams.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md cursor-pointer'
                                    }`}
                                >
                                    {generating && <Spinner />}
                                    {generating ? 'Generating…' : '⬇ Generate & Download Excel'}
                                </button>
                            </div>

                            {/* Legend */}
                            <div className="bg-surface rounded-xl shadow-lg border border-border p-4">
                                <p className="text-xs font-bold tracking-widest uppercase text-textFaint mb-3">Excel Lane Legend</p>
                                {[
                                    ['bg-[#d9d2e9]', 'Purple', 'Undivided room'],
                                    ['bg-[#d9ead3]', 'Green',  'Giant course lane'],
                                    ['bg-[#fff2cc]', 'Yellow', 'Other courses lane'],
                                ].map(([bgClass, label, desc]) => (
                                    <div key={label} className="flex items-center gap-2.5 mb-2">
                                        <div className={`w-6 h-4 rounded border border-border flex-shrink-0 ${bgClass}`} />
                                        <span className="text-[13px] font-semibold text-text">{label}</span>
                                        <span className="text-xs text-textFaint">{desc}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Info */}
                            <div className="bg-success/10 border border-success/30 rounded-xl p-4">
                                <p className="text-xs font-bold text-success mb-1.5">How it works</p>
                                <ul className="text-xs text-success leading-relaxed pl-4 list-disc">
                                    <li>Each slot uses <strong>its own room list</strong></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* ═══════════════════════════════════════════════════════════════════════
                CONFIRMATION MODAL — Seating Upload
                ═══════════════════════════════════════════════════════════════════════ */}
            {showConfirm && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-surface rounded-2xl shadow-2xl border border-border w-full max-w-md mx-4 overflow-hidden">

                        {/* Modal Header */}
                        <div className="bg-danger px-6 py-4">
                            <h3 className="text-white text-base font-bold tracking-wide">⚠ Confirm Seating Reset</h3>
                        </div>

                        {/* Modal Body */}
                        <div className="px-6 py-5">
                            <p className="text-sm text-text leading-relaxed mb-4">
                                This will <strong className="text-danger">permanently delete</strong> all existing seating allocations and replace them with the data from your uploaded file.
                            </p>
                            <ul className="text-sm text-textMuted space-y-2 mb-5">
                                <li className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-danger/15 flex items-center justify-center text-danger text-xs font-bold flex-shrink-0">×</span>
                                    All previous seating allocations
                                </li>
                            </ul>

                            <div className="bg-success/10 border border-success/30 rounded-lg p-3 mb-5">
                                <p className="text-xs text-success">
                                    <strong>✓ Preserved:</strong> Exam time slots and scheduled courses will NOT be deleted.
                                </p>
                            </div>

                            {pendingFile && (
                                <div className="bg-surface2 border border-border rounded-lg p-3 shadow-sm">
                                    <p className="text-xs text-textMuted">
                                        <strong>File:</strong> {pendingFile.name} ({(pendingFile.size / 1024).toFixed(1)} KB)
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-surface2 border-t border-border flex items-center justify-end gap-3 shadow-sm">
                            <button
                                onClick={handleCancelUpload}
                                className="px-5 py-2 bg-surface text-text text-xs font-bold uppercase tracking-wider rounded-lg border border-borderStrong hover:bg-surface2 transition-all cursor-pointer shadow-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmUpload}
                                className="px-5 py-2 bg-danger hover:bg-danger/90 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer"
                            >
                                Yes, Reset & Upload
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}