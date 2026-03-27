import { useState, useEffect, useRef, useCallback } from 'react';

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
        saved:   'bg-emerald-100 text-emerald-800',
        pending: 'bg-amber-100 text-amber-800',
        empty:   'bg-slate-100 text-slate-500',
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
                done ? 'bg-emerald-500 text-white' : active ? 'bg-[#8B1A1A] text-white' : 'bg-slate-200 text-slate-400'
            }`}>
                {done ? '✓' : num}
            </div>
            <span className={`text-[13px] ${
                active ? 'font-bold text-slate-800' : done ? 'font-medium text-emerald-500' : 'font-medium text-slate-400'
            }`}>
                {title}
            </span>
        </div>
    );
}

function Toast({ message, type, onClose }) {
    useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
    const styles = {
        success: 'bg-emerald-50 border-emerald-500 text-emerald-800',
        error:   'bg-red-50 border-red-500 text-red-800',
        info:    'bg-red-50 border-[#8B1A1A] text-red-900',
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

function SlotRoomSelector({ slotId, classrooms, selectedIds, onChange }) {
    const toggle   = (id) => onChange(slotId, selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
    const selectAll = () => onChange(slotId, classrooms.map(r => r.id));
    const clearAll  = () => onChange(slotId, []);

    const building1 = classrooms.filter(r => r.location_order < 50);
    const building2 = classrooms.filter(r => r.location_order >= 50);

    const RoomGroup = ({ title, rooms }) => (
        <div className="mb-2.5">
            <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-1.5">{title}</p>
            <div className="flex flex-wrap gap-1.5">
                {rooms.map(r => {
                    const on = selectedIds.includes(r.id);
                    return (
                        <button key={r.id} onClick={() => toggle(r.id)}
                            title={`Purple:${r.cap_purple} Green:${r.cap_green} Yellow:${r.cap_yellow} | ${r.type}`}
                            className={`px-2.5 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-all duration-150 border-[1.5px] ${
                                on
                                    ? 'border-[#8B1A1A] bg-red-50 text-[#8B1A1A] font-bold'
                                    : 'border-slate-200 bg-slate-50 text-slate-500 font-medium'
                            }`}>
                            {r.room_name}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div className="p-3.5 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-800">
                    Rooms for this slot
                    <span className={`ml-2 rounded-full px-2 py-px text-[11px] font-bold ${
                        selectedIds.length === 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                        {selectedIds.length} selected
                    </span>
                </span>
                <div className="flex gap-2.5">
                    <button onClick={selectAll} className="bg-transparent border-none cursor-pointer text-[11px] text-[#8B1A1A] font-bold hover:underline">All</button>
                    <button onClick={clearAll}  className="bg-transparent border-none cursor-pointer text-[11px] text-red-500 font-bold hover:underline">None</button>
                </div>
            </div>

            <RoomGroup title="Academic Block  (LH-1 → CP)" rooms={building1} />
            {building2.length > 0 && (
                <RoomGroup title="Incubation Centre  (LH-16 → LH-19)" rooms={building2} />
            )}

            {selectedIds.length === 0 && (
                <p className="text-xs text-red-500 font-semibold mt-1.5">
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

                // Default: all rooms enabled for every slot
                const allIds = roomList.map(r => r.id);
                const init   = {};
                slotList.forEach(s => { init[s.slot_id] = [...allIds]; });
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
            const cd   = res.headers.get('Content-Disposition') ?? '';
            a.download = (cd.match(/filename="?([^"]+)"?/) ?? [])[1] ?? 'seating_plan.xlsx';
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

    const handleUpload = async (file) => {
        if (!file) return;
        if (!file.name.endsWith('.xlsx')) return notify('Please upload a .xlsx file.', 'error');
        setUploading(true);
        const form = new FormData();
        form.append('seatingFile', file);
        try {
            const res  = await fetch(`${API}/upload-seating`, { method: 'POST', headers: authHeaders(), body: form });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
            notify(`✓ Saved! ${data.exams_processed} exams · ${data.allocations_saved} allocations.`, 'success');
            setWorkflowStep(4);
            refreshStatus();
        } catch (err) {
            notify(`Upload failed: ${err.message}`, 'error');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
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
                .slot-row:hover td { background: #fef2f2 !important; }
            `}</style>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <div className="min-h-screen p-7">
                <div className="max-w-[1180px] mx-auto">

                    {/* ── Page header ── */}
                    <div className="flex items-end justify-between mb-8">
                        <div>
                            <h1 className="text-2xl font-bold text-[#8B1A1A] tracking-tight">Seating Plan Assignment</h1>
                            <p className="text-sm text-slate-500 mt-1">Per-slot room assignment</p>
                        </div>
                        <div className="flex gap-3">
                            {[['Total Slots', slots.length], ['With Exams', slotsWithExams.length], ['Seating Saved', slotsWithSeating.length]].map(([label, value]) => (
                                <div key={label} className="bg-white border border-slate-200 rounded-xl px-5 py-2.5 text-center min-w-[90px] shadow-sm">
                                    <div className="text-xl font-bold text-slate-800">{value}</div>
                                    <div className="text-[11px] text-slate-400 font-medium">{label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-[1fr_320px] gap-5">

                        {/* ── LEFT ── */}
                        <div className="flex flex-col gap-5">

                            {/* Workflow stepper */}
                            <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 p-5">
                                <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-3.5">Workflow</p>
                                <div className="flex flex-col gap-3">
                                    <Step num={1} title="Expand each slot row to configure its rooms" active={workflowStep === 1} done={workflowStep > 1} />
                                    <Step num={2} title="Generate Excel — algorithm runs per-slot"   active={workflowStep === 2} done={workflowStep > 2} />
                                    <Step num={3} title="Review & edit the downloaded Excel"          active={workflowStep === 3} done={workflowStep > 3} />
                                    <Step num={4} title="Upload finalised Excel → saved to Data Base"        active={workflowStep === 4} done={workflowStep > 4} />
                                </div>
                            </div>

                            {/* ── Slot table with expandable room rows ── */}
                            <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden">
                                {/* Toolbar */}
                                <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center flex-wrap gap-2">
                                    <div>
                                        <span className="text-xs font-bold tracking-widest uppercase text-slate-400">Exam Slots</span>
                                        <span className="ml-2 text-[11px] text-slate-500">— click ▾ to configure rooms per slot</span>
                                    </div>
                                    <div className="flex gap-1.5 items-center">
                                        <span className="text-[11px] text-slate-400">All slots:</span>
                                        <button onClick={() => setGlobalRooms(classrooms.map(r => r.id))} className="bg-transparent border-none cursor-pointer text-[11px] text-[#8B1A1A] font-bold hover:underline">All rooms</button>
                                        <button onClick={() => setGlobalRooms([])} className="bg-transparent border-none cursor-pointer text-[11px] text-red-500 font-bold hover:underline">Clear rooms</button>
                                        <span className="text-slate-200 px-1">|</span>
                                        <button onClick={refreshStatus} className="bg-transparent border-none cursor-pointer text-xs text-slate-500 hover:text-slate-700 transition-colors">↻ Refresh</button>
                                    </div>
                                </div>

                                {loadingStatus ? (
                                    <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
                                ) : fetchError ? (
                                    <div className="p-7 m-4 bg-red-50 border border-red-200 rounded-xl">
                                        <p className="text-[13px] font-bold text-red-800 mb-2">
                                            ⚠ Could not load data from server
                                        </p>
                                        <p className="font-mono text-xs text-red-700 bg-red-100 px-3 py-2 rounded-lg mb-3 break-all">
                                            {fetchError}
                                        </p>
                                        <p className="text-xs text-red-900 leading-relaxed">
                                            <strong>Common causes:</strong><br />
                                            1. <code className="bg-red-100 px-1 rounded">seating_allocations</code> table missing → run <code className="bg-red-100 px-1 rounded">migration.sql</code> on your Aiven DB<br />
                                            2. No Vite proxy → add <code className="bg-red-100 px-1 rounded">server.proxy</code> in <code className="bg-red-100 px-1 rounded">vite.config.js</code> (see below)<br />
                                            3. Backend not running on port 5001
                                        </p>
                                        <pre className="text-[11px] bg-slate-800 text-sky-300 px-3.5 py-2.5 rounded-lg mt-2.5 overflow-x-auto">{`// vite.config.js
export default {
  server: {
    proxy: {
      '/api': 'http://localhost:5001'
    }
  }
}`}</pre>
                                    </div>
                                ) : slots.length === 0 ? (
                                    <div className="p-10 text-center text-slate-400 text-[13px]">
                                        No exam slots found in the database.<br />
                                        <span className="text-xs mt-1 block">
                                            Add slots via <strong>Add Exam Slot</strong> in the sidebar first.
                                        </span>
                                    </div>
                                ) : (
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50">
                                                {['', 'Date', 'Day', 'Time', 'Courses', 'Rooms', 'Status'].map(h => (
                                                    <th key={h} className="px-3 py-2 text-left text-[11px] font-bold text-slate-400 tracking-wider uppercase border-b border-slate-100">{h}</th>
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
                                                            className={`slot-row cursor-pointer ${expanded ? '' : 'border-b border-slate-100'}`}
                                                            onClick={() => toggleExpand(sl.slot_id)}
                                                        >
                                                            {/* Expand button */}
                                                            <td className={`px-1.5 py-2.5 pl-3.5 w-8 ${expanded ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); toggleExpand(sl.slot_id); }}
                                                                    className={`w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold leading-none transition-all duration-150 border-[1.5px] ${
                                                                        expanded
                                                                            ? 'border-[#8B1A1A] bg-red-50 text-[#8B1A1A]'
                                                                            : 'border-slate-200 bg-slate-100 text-slate-500'
                                                                    }`}
                                                                >
                                                                    {expanded ? '▲' : '▾'}
                                                                </button>
                                                            </td>
                                                            <td className={`px-3 py-2.5 text-[13px] font-semibold text-slate-800 ${expanded ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>{formatDate(sl.exam_date)}</td>
                                                            <td className={`px-3 py-2.5 text-[13px] text-slate-500 ${expanded ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>{sl.exam_day}</td>
                                                            <td className={`px-3 py-2.5 font-mono text-xs text-slate-600 ${expanded ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                                {formatTime(sl.start_time)} – {formatTime(sl.end_time)}
                                                            </td>
                                                            <td className={`px-3 py-2.5 text-[13px] text-slate-600 text-center ${expanded ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>{sl.exam_count}</td>
                                                            {/* Room count badge */}
                                                            <td className={`px-3 py-2.5 ${expanded ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                                <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                                                                    hasWarning ? 'text-red-500 bg-red-100' : 'text-[#8B1A1A] bg-red-50'
                                                                }`}>
                                                                    {roomsSelected}/{totalRooms}{hasWarning ? ' ⚠' : ''}
                                                                </span>
                                                            </td>
                                                            <td className={`px-3 py-2.5 ${expanded ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                                <Badge status={sl.exam_count === 0 ? 'empty' : sl.has_seating ? 'saved' : 'pending'} />
                                                            </td>
                                                        </tr>

                                                        {/* ── Expandable room selector row ── */}
                                                        {expanded && (
                                                            <tr key={`${sl.slot_id}-expand`} className="border-b-2 border-red-200">
                                                                <td colSpan={7} className="px-3.5 pt-1.5 pb-3.5 bg-red-50">
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
                            <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-7 h-7 rounded-full bg-[#8B1A1A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">3</div>
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Upload Reviewed Excel</h3>
                                </div>
                                <div
                                    className={`border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-all duration-200 ${
                                        dragOver ? 'border-[#8B1A1A] bg-red-50' : 'border-slate-300 bg-slate-50/50 hover:border-[#8B1A1A] hover:bg-red-50'
                                    }`}
                                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files[0]); }}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <div className="text-3xl mb-1.5">{uploading ? '⏳' : '📂'}</div>
                                    <p className="text-sm font-semibold text-slate-600">
                                        {uploading ? 'Uploading & saving…' : 'Drop reviewed Excel here, or click to browse'}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">Only .xlsx accepted</p>
                                    <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden"
                                        onChange={e => { handleUpload(e.target.files[0]); e.target.value = ''; }} />
                                </div>
                                <button
                                    disabled={uploading}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`mt-3 w-full py-3 text-white text-sm font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 transition-all duration-200 ${
                                        uploading ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#8B1A1A] hover:bg-[#721515] hover:shadow-md cursor-pointer'
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
                            <div className="bg-gradient-to-br from-[#8B1A1A] to-[#a52422] rounded-xl p-5 shadow-lg text-white">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">2</div>
                                    <h3 className="text-sm font-bold uppercase tracking-wider">Generate Seating Plan</h3>
                                </div>
                                <p className="text-[13px] opacity-80 leading-relaxed mb-4">
                                    1. The algorithm is applied for each slot using its own room config and exports a colour-coded Excel workbook.
                                    <br/>2. Make the changes as you see fit then upload the excel.
                                </p>

                                {/* Per-slot readiness list */}
                                <div className="bg-white/10 rounded-lg px-3 py-2.5 mb-4 text-xs">
                                    {slotsWithExams.length === 0 ? (
                                        <span className="opacity-70">No slots with exams yet.</span>
                                    ) : (
                                        slotsWithExams.map(sl => {
                                            const n  = (slotRoomConfig[sl.slot_id] ?? []).length;
                                            const ok = n > 0;
                                            return (
                                                <div key={sl.slot_id} className="flex justify-between mb-1 items-center">
                                                    <span className="opacity-85">{formatDate(sl.exam_date)} · {formatTime(sl.start_time)}</span>
                                                    <span className={`font-bold text-[11px] ${ok ? 'text-emerald-300' : 'text-red-300'}`}>
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
                                    className={`w-full py-3 bg-white text-[#8B1A1A] rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200 ${
                                        generating || slotsWithExams.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md cursor-pointer'
                                    }`}
                                >
                                    {generating && <Spinner />}
                                    {generating ? 'Generating…' : '⬇ Generate & Download Excel'}
                                </button>
                            </div>

                            {/* Legend */}
                            <div className="bg-white rounded-xl shadow-lg border border-slate-200/80 p-4">
                                <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-3">Excel Lane Legend</p>
                                {[
                                    ['bg-[#d9d2e9]', 'Purple', 'Undivided room'],
                                    ['bg-[#d9ead3]', 'Green',  'Giant course lane'],
                                    ['bg-[#fff2cc]', 'Yellow', 'Other courses lane'],
                                ].map(([bgClass, label, desc]) => (
                                    <div key={label} className="flex items-center gap-2.5 mb-2">
                                        <div className={`w-6 h-4 rounded border border-slate-200 flex-shrink-0 ${bgClass}`} />
                                        <span className="text-[13px] font-semibold text-slate-700">{label}</span>
                                        <span className="text-xs text-slate-400">{desc}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Info */}
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                                <p className="text-xs font-bold text-emerald-700 mb-1.5">How it works</p>
                                <ul className="text-xs text-emerald-800 leading-relaxed pl-4 list-disc">
                                    <li>Each slot uses <strong>its own room list</strong></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}